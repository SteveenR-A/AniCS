use std::io::SeekFrom;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{AppHandle, Manager};
use subtle::ConstantTimeEq;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use futures::StreamExt;

use once_cell::sync::Lazy;
use parking_lot::Mutex;

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);
static DLNA_PORT: AtomicU16 = AtomicU16::new(0);
static MEDIA_TOKEN: Lazy<String> = Lazy::new(|| {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("Unable to initialize media authentication");
    hex::encode(bytes)
});
static MEDIA_ROOTS: Lazy<Mutex<Vec<PathBuf>>> = Lazy::new(|| Mutex::new(Vec::new()));
static DLNA_FILE: Lazy<Mutex<Option<DlnaFile>>> = Lazy::new(|| Mutex::new(None));

#[derive(Clone)]
struct DlnaFile {
    token: String,
    path: PathBuf,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AuthCallbackData {
    pub uid: String,
    pub email: Option<String>,
    #[serde(alias = "displayName")]
    pub display_name: Option<String>,
    #[serde(alias = "photoURL")]
    pub photo_url: Option<String>,
    #[serde(alias = "idToken")]
    pub id_token: Option<String>,
    #[serde(alias = "accessToken")]
    pub access_token: Option<String>,
}

static PENDING_AUTH: Lazy<Mutex<Option<AuthCallbackData>>> = Lazy::new(|| Mutex::new(None));

/// Compares session credentials without branching on matching bytes.
pub fn verify_token_constant_time(expected: &[u8], provided: &[u8]) -> bool {
    !expected.is_empty() && bool::from(expected.ct_eq(provided))
}

/// Obtiene el puerto asignado al servidor local de streaming
pub fn get_server_port() -> u16 {
    SERVER_PORT.load(Ordering::Relaxed)
}

/// Credential shared only with the application's local media URL generator.
pub fn get_media_token() -> &'static str {
    MEDIA_TOKEN.as_str()
}

pub fn register_download_root(root: &Path) {
    if let Ok(root) = root.canonicalize() {
        if root.is_dir() && root.parent().is_some() {
            let mut roots = MEDIA_ROOTS.lock();
            if !roots.contains(&root) { roots.push(root); }
        }
    }
}

fn authorized_media_path(path: &str) -> Option<PathBuf> {
    let path = Path::new(path);
    if !path.is_absolute() || path.components().any(|part| part == Component::ParentDir) {
        return None;
    }
    let canonical = path.canonicalize().ok()?;
    if !canonical.is_file() { return None; }
    let mut roots = MEDIA_ROOTS.lock().clone();
    // Settings can change through the generic settings command during playback.
    if let Ok(Some(root)) = crate::storage::get_setting("download_dir") {
        if let Ok(root) = Path::new(&root).canonicalize() {
            if root.parent().is_some() { roots.push(root); }
        }
    }
    roots.iter().any(|root| canonical.starts_with(root)).then_some(canonical)
}

/// Genera una URL de streaming local compatible con HTML5 <video>
pub fn get_media_stream_url(file_path: &str) -> String {
    let port = get_server_port();
    let encoded_path = urlencoding::encode(file_path);
    if port > 0 {
        format!("http://127.0.0.1:{}/video?path={}&token={}", port, encoded_path, get_media_token())
    } else {
        file_path.to_string()
    }
}

/// Genera una URL de proxy de stream remoto compatible con HTML5 <video> y headers personalizados (Referer, User-Agent)
pub fn get_proxied_stream_url(target_url: &str, referer: Option<&str>) -> String {
    let port = get_server_port();
    if port > 0 {
        let mut u = format!(
            "http://127.0.0.1:{}/proxy_stream?url={}&token={}",
            port,
            urlencoding::encode(target_url),
            get_media_token()
        );
        if let Some(ref_str) = referer {
            u.push_str("&referer=");
            u.push_str(&urlencoding::encode(ref_str));
        }
        u
    } else {
        target_url.to_string()
    }
}

/// Inicia el servidor HTTP de streaming local en segundo plano
pub async fn start_media_server(app_handle: AppHandle) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    Lazy::force(&MEDIA_TOKEN);
    if let Ok(root) = crate::commands::download_cmd::get_default_download_dir(app_handle.clone()) {
        register_download_root(Path::new(&root));
    }
    #[cfg(not(target_os = "android"))]
    for root in [app_handle.path().video_dir(), app_handle.path().download_dir()].into_iter().flatten() {
        register_download_root(&root.join("AniCS"));
    }
    #[cfg(target_os = "android")]
    {
        register_download_root(Path::new("/storage/emulated/0/Anime"));
        if let Ok(root) = app_handle.path().app_data_dir() { register_download_root(&root.join("Anime")); }
    }
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let local_addr = listener.local_addr()?;
    let port = local_addr.port();
    SERVER_PORT.store(port, Ordering::Relaxed);
    log::info!("Local media streaming server started on port {}", port);

    // Isolated LAN listener: it only serves the single file registered for an active DLNA cast.
    match TcpListener::bind("0.0.0.0:0").await {
        Ok(listener) => {
            let lan_port = listener.local_addr()?.port();
            DLNA_PORT.store(lan_port, Ordering::Relaxed);
            tokio::spawn(async move {
                loop {
                    match listener.accept().await {
                        Ok((stream, _)) => { tokio::spawn(handle_dlna_connection(stream)); }
                        Err(error) => {
                            log::warn!("DLNA media server accept error: {}", error);
                            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                        }
                    }
                }
            });
            log::info!("DLNA media server listening on port {}", lan_port);
        }
        Err(error) => log::warn!("DLNA media sharing is unavailable: {}", error),
    }

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, addr)) => {
                    tokio::spawn(handle_connection(stream, addr));
                }
                Err(e) => {
                    log::warn!("Media server accept error: {}", e);
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }
        }
    });

    Ok(port)
}

pub async fn prepare_dlna_file(path: &str, renderer_ip: IpAddr) -> Result<String, String> {
    let port = DLNA_PORT.load(Ordering::Relaxed);
    if port == 0 { return Err("No se pudo iniciar el servidor local para compartir el video.".to_string()); }
    let path = tokio::fs::canonicalize(path).await.map_err(|error| format!("No se encontró el video descargado: {error}"))?;
    if !tokio::fs::metadata(&path).await.map_err(|error| error.to_string())?.is_file() {
        return Err("La ruta elegida no es un archivo de video.".to_string());
    }
    let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
    socket.connect(SocketAddr::new(renderer_ip, 1900)).map_err(|error| error.to_string())?;
    let local_ip = socket.local_addr().map_err(|error| error.to_string())?.ip();
    if local_ip.is_unspecified() || local_ip.is_loopback() {
        return Err("El dispositivo no tiene una dirección de red local disponible.".to_string());
    }
    let token = uuid::Uuid::new_v4().simple().to_string();
    *DLNA_FILE.lock() = Some(DlnaFile { token: token.clone(), path });
    Ok(format!("http://{local_ip}:{port}/dlna/{token}/media"))
}

pub fn clear_dlna_file(token: &str) {
    let mut active = DLNA_FILE.lock();
    if active.as_ref().is_some_and(|file| file.token == token) {
        *active = None;
    }
}

// TCP reads can end anywhere, including in the request line or a JSON token.
// Read complete headers (and the declared callback body) before parsing them.
async fn read_http_request(stream: &mut TcpStream, include_body: bool) -> std::io::Result<Vec<u8>> {
    const MAX_HEADERS: usize = 32 * 1024;
    const MAX_BODY: usize = 64 * 1024;
    let read_request = async {
        let mut buffer = Vec::new();
        let mut chunk = [0u8; 4096];
        let header_end = loop {
            if let Some(position) = buffer.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                if position + 4 > MAX_HEADERS {
                    return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "HTTP headers too large"));
                }
                break position + 4;
            }
            if buffer.len() >= MAX_HEADERS {
                return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "HTTP headers too large"));
            }
            let count = stream.read(&mut chunk).await?;
            if count == 0 {
                return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Incomplete HTTP headers"));
            }
            buffer.extend_from_slice(&chunk[..count]);
        };
        let mut content_length = None;
        if include_body {
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            for line in headers.lines().skip(1) {
                let Some((name, value)) = line.split_once(':') else { continue; };
                if name.eq_ignore_ascii_case("content-length") {
                    let length = value.trim().parse::<usize>().map_err(|_| {
                        std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid Content-Length")
                    })?;
                    if length > MAX_BODY || content_length.is_some() {
                        return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, "Invalid HTTP body length"));
                    }
                    content_length = Some(length);
                }
            }
        }
        let request_length = header_end + content_length.unwrap_or(0);
        while buffer.len() < request_length {
            let count = stream.read(&mut chunk).await?;
            if count == 0 {
                return Err(std::io::Error::new(std::io::ErrorKind::UnexpectedEof, "Incomplete HTTP body"));
            }
            buffer.extend_from_slice(&chunk[..count]);
        }
        buffer.truncate(request_length);
        Ok(buffer)
    };
    tokio::time::timeout(std::time::Duration::from_secs(10), read_request)
        .await
        .map_err(|_| std::io::Error::new(std::io::ErrorKind::TimedOut, "HTTP request timed out"))?
}

async fn handle_dlna_connection(mut stream: TcpStream) {
    let buffer = match read_http_request(&mut stream, false).await {
        Ok(buffer) => buffer,
        Err(_) => return,
    };
    let request = String::from_utf8_lossy(&buffer);
    let mut lines = request.lines();
    let Some(request_line) = lines.next() else { return; };
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 { return; }
    let method = parts[0];
    let route: Vec<&str> = parts[1].split('?').next().unwrap_or_default().split('/').collect();
    if route.len() != 4 || route[1] != "dlna" || route[3] != "media" {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").await;
        return;
    }
    let Some(file) = DLNA_FILE.lock().as_ref().filter(|file| file.token == route[2]).cloned() else {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").await;
        return;
    };
    if method == "OPTIONS" {
        let _ = stream.write_all(b"HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Range\r\nConnection: close\r\n\r\n").await;
        return;
    }
    if method != "GET" && method != "HEAD" {
        let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").await;
        return;
    }
    let range = lines.find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("range").then(|| value.trim().to_string())
    });
    serve_dlna_file(&mut stream, method, &file.path, range.as_deref()).await;
}

async fn serve_dlna_file(stream: &mut TcpStream, method: &str, path: &PathBuf, range: Option<&str>) {
    let Ok(metadata) = tokio::fs::metadata(path).await else {
        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").await;
        return;
    };
    let size = metadata.len();
    let mime = get_mime_type(path);
    let requested_range = range.and_then(|value| parse_range(value, size));
    let (status, start, end) = match (range, requested_range) {
        (Some(_), None) => {
            let response = format!("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
        (_, Some((start, end))) => ("206 Partial Content", start, end),
        _ => ("200 OK", 0, size.saturating_sub(1)),
    };
    let length = if size == 0 { 0 } else { end.saturating_sub(start).saturating_add(1) };
    let mut header = format!("HTTP/1.1 {status}\r\nContent-Type: {mime}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\nConnection: close\r\ntransferMode.dlna.org: Streaming\r\n");
    if status == "206 Partial Content" { header.push_str(&format!("Content-Range: bytes {start}-{end}/{size}\r\n")); }
    header.push_str("contentFeatures.dlna.org: DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000\r\n\r\n");
    if stream.write_all(header.as_bytes()).await.is_err() || method == "HEAD" { return; }
    let Ok(mut file) = tokio::fs::File::open(path).await else { return; };
    if file.seek(SeekFrom::Start(start)).await.is_err() { return; }
    let mut remaining = length;
    let mut chunk = [0u8; 64 * 1024];
    while remaining > 0 {
        let count = std::cmp::min(remaining, chunk.len() as u64) as usize;
        let read = match file.read(&mut chunk[..count]).await { Ok(0) | Err(_) => break, Ok(read) => read };
        if stream.write_all(&chunk[..read]).await.is_err() { break; }
        remaining -= read as u64;
    }
}

async fn handle_connection(mut stream: TcpStream, _addr: SocketAddr) {
    let buffer = match read_http_request(&mut stream, true).await {
        Ok(buffer) => buffer,
        Err(_) => {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
            return;
        }
    };

    let request = String::from_utf8_lossy(&buffer);
    let mut lines = request.lines();
    let request_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let uri = parts[1];

    let mut origin = String::from("http://localhost:1420");
    let mut range_header: Option<&str> = None;

    for line in request.lines().skip(1) {
        if line.is_empty() {
            break;
        }
        let line_lower = line.to_lowercase();
        if line_lower.starts_with("origin:") {
            let o = line["origin:".len()..].trim();
            if o == "tauri://localhost" ||
               o == "https://tauri.localhost" ||
               o == "http://tauri.localhost" ||
               o.starts_with("http://localhost:") {
                origin = o.to_string();
            }
        } else if line_lower.starts_with("range:") {
            range_header = Some(line["range:".len()..].trim());
        }
    }

    if method == "OPTIONS" {
        let response = format!("HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: {}\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS, POST\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\
\r\n", origin);
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // Interceptar rutas de autenticación segura vía navegador externo
    if uri.starts_with("/auth") {
        handle_auth_request(&mut stream, method, uri, &buffer, &origin).await;
        return;
    }

    // Interceptar proxy de streaming remoto (Mp4upload, etc. con headers Referer/Range)
    if uri.starts_with("/proxy_stream") {
        handle_proxy_stream(&mut stream, method, uri, range_header, &origin).await;
        return;
    }

    if method != "GET" && method != "HEAD" {
        let response = "HTTP/1.1 405 Method Not Allowed\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    let parsed = url::Url::parse(&format!("http://localhost{uri}")).ok();
    let tokens: Vec<_> = parsed.as_ref().map(|url| url.query_pairs().filter(|(key, _)| key == "token").map(|(_, value)| value.into_owned()).collect()).unwrap_or_default();
    if uri.split('?').next() != Some("/video") || tokens.len() != 1 ||
        !verify_token_constant_time(get_media_token().as_bytes(), tokens[0].as_bytes()) {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    }
    let paths = parsed.as_ref().unwrap().query_pairs().filter(|(key, _)| key == "path").count();
    if paths != 1 {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    }
    // Extraer parámetro `path` de la URL /video?path=...
    let file_path_str = match extract_query_param(uri, "path") {
        Some(p) => match urlencoding::decode(&p) {
            Ok(decoded) => decoded.into_owned(),
            Err(_) => p,
        },
        None => {
            let response = "HTTP/1.1 400 Bad Request\r\n\r\nMissing path param";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    };

    let Some(file_path) = authorized_media_path(&file_path_str) else {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    };
    let metadata = match tokio::fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(e) => {
            let response = if e.kind() == std::io::ErrorKind::NotFound {
                "HTTP/1.1 404 Not Found\r\n\r\nFile not found"
            } else {
                "HTTP/1.1 500 Internal Server Error\r\n\r\n"
            };
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    };

    let total_size = metadata.len();
    let mime_type = get_mime_type(&file_path);

    if let Some(range_str) = range_header {
        if let Some((start, end)) = parse_range(range_str, total_size) {
            let content_length = end - start + 1;
            let header = format!(
                "HTTP/1.1 206 Partial Content\r\n\
Access-Control-Allow-Origin: {}\r\n\
Accept-Ranges: bytes\r\n\
Content-Range: bytes {}-{}/{}\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
                origin, start, end, total_size, content_length, mime_type
            );

            if stream.write_all(header.as_bytes()).await.is_err() {
                return;
            }

            if method == "HEAD" {
                return;
            }

            // Stream de los bytes solicitados
            if let Ok(mut file) = tokio::fs::File::open(&file_path).await {
                if file.seek(SeekFrom::Start(start)).await.is_ok() {
                    let mut remaining = content_length;
                    let mut chunk_buf = [0u8; 64 * 1024];
                    while remaining > 0 {
                        let to_read = std::cmp::min(remaining, chunk_buf.len() as u64) as usize;
                        match file.read(&mut chunk_buf[..to_read]).await {
                            Ok(0) => break,
                            Ok(read_bytes) => {
                                if stream.write_all(&chunk_buf[..read_bytes]).await.is_err() {
                                    break;
                                }
                                remaining -= read_bytes as u64;
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
            return;
        }
        let response = format!(
            "HTTP/1.1 416 Range Not Satisfiable\r\nAccess-Control-Allow-Origin: {origin}\r\nContent-Range: bytes */{total_size}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        );
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // Respuesta completa 200 OK
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
Access-Control-Allow-Origin: {}\r\n\
Accept-Ranges: bytes\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
        origin, total_size, mime_type
    );

    if stream.write_all(header.as_bytes()).await.is_err() {
        return;
    }

    if method == "HEAD" {
        return;
    }

    if let Ok(mut file) = tokio::fs::File::open(&file_path).await {
        let mut chunk_buf = [0u8; 64 * 1024];
        loop {
            match file.read(&mut chunk_buf).await {
                Ok(0) => break,
                Ok(read_bytes) => {
                    if stream.write_all(&chunk_buf[..read_bytes]).await.is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    }
}

pub fn extract_query_param(uri: &str, key: &str) -> Option<String> {
    let query = uri.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (parts.next(), parts.next()) {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}

pub fn parse_range(range_str: &str, total_size: u64) -> Option<(u64, u64)> {
    if total_size == 0 { return None; }
    let trimmed = range_str.trim();
    let s = if trimmed.to_ascii_lowercase().starts_with("bytes=") {
        &trimmed[6..].trim()
    } else {
        trimmed
    };
    let parts: Vec<&str> = s.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start_str = parts[0].trim();
    let end_str = parts[1].trim();

    if start_str.is_empty() && !end_str.is_empty() {
        let suffix_len: u64 = end_str.parse().ok()?;
        if suffix_len == 0 { return None; }
        let start = total_size.saturating_sub(suffix_len);
        let end = total_size.saturating_sub(1);
        return Some((start, end));
    }

    let start: u64 = start_str.parse().ok()?;
    let end: u64 = if end_str.is_empty() {
        total_size.saturating_sub(1)
    } else {
        end_str.parse().ok()?
    };

    if start <= end && start < total_size {
        Some((start, std::cmp::min(end, total_size.saturating_sub(1))))
    } else {
        None
    }
}

pub fn get_mime_type(path: &PathBuf) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
        Some("mp4") => "video/mp4",
        Some("ts") => "video/mp2t",
        Some("mkv") => "video/x-matroska",
        Some("webm") => "video/webm",
        Some("avi") => "video/x-msvideo",
        Some("m3u8") => "application/vnd.apple.mpegurl",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        _ => "application/octet-stream",
    }
}

async fn handle_proxy_stream(
    stream: &mut TcpStream,
    method: &str,
    uri: &str,
    range_header: Option<&str>,
    origin: &str,
) {
    if method != "GET" && method != "HEAD" {
        let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\n\r\n").await;
        return;
    }

    let parsed = match url::Url::parse(&format!("http://localhost{uri}")) {
        Ok(u) => u,
        Err(_) => {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\n").await;
            return;
        }
    };

    let token = parsed.query_pairs().find(|(k, _)| k == "token").map(|(_, v)| v.into_owned());
    let Some(token) = token else {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    };

    if !verify_token_constant_time(get_media_token().as_bytes(), token.as_bytes()) {
        let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await;
        return;
    }

    let target_url = match parsed.query_pairs().find(|(k, _)| k == "url").map(|(_, v)| v.into_owned()) {
        Some(u) => u,
        None => {
            let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\nMissing url param").await;
            return;
        }
    };

    if !target_url.starts_with("http://") && !target_url.starts_with("https://") {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\n\r\nInvalid url scheme").await;
        return;
    }

    if let Ok(parsed_target) = url::Url::parse(&target_url) {
        if let Some(host_str) = parsed_target.host_str() {
            if let Ok(ip) = host_str.parse::<std::net::IpAddr>() {
                if anics_core::url_security::is_ip_private_or_reserved(&ip) {
                    let _ = stream.write_all(b"HTTP/1.1 403 Forbidden\r\n\r\nBlocked private target").await;
                    return;
                }
            }
        }
    }

    let referer = parsed.query_pairs().find(|(k, _)| k == "referer").map(|(_, v)| v.into_owned());

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            let _ = stream.write_all(b"HTTP/1.1 500 Internal Server Error\r\n\r\n").await;
            return;
        }
    };

    let mut req = if method == "HEAD" {
        client.head(&target_url)
    } else {
        client.get(&target_url)
    };

    req = req.header(
        reqwest::header::USER_AGENT,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    if let Some(ref_str) = referer.as_deref().filter(|s| !s.trim().is_empty()) {
        req = req.header(reqwest::header::REFERER, ref_str);
    }

    if let Some(range) = range_header {
        req = req.header(reqwest::header::RANGE, range);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(err) => {
            log::warn!("Proxy stream upstream error for {}: {}", target_url, err);
            let _ = stream.write_all(b"HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n").await;
            return;
        }
    };

    let status = resp.status();
    let status_code = status.as_u16();
    let status_line = if status_code == 206 {
        "206 Partial Content"
    } else if status_code == 200 {
        "200 OK"
    } else {
        &format!("{} {}", status_code, status.canonical_reason().unwrap_or("OK"))
    };

    let mut header_str = format!(
        "HTTP/1.1 {}\r\n\
Access-Control-Allow-Origin: {}\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Accept-Ranges: bytes\r\n\
Connection: close\r\n",
        status_line, origin
    );

    if let Some(ct) = resp.headers().get(reqwest::header::CONTENT_TYPE) {
        if let Ok(ct_val) = ct.to_str() {
            header_str.push_str(&format!("Content-Type: {}\r\n", ct_val));
        }
    } else {
        header_str.push_str("Content-Type: video/mp4\r\n");
    }

    if let Some(cl) = resp.headers().get(reqwest::header::CONTENT_LENGTH) {
        if let Ok(cl_val) = cl.to_str() {
            header_str.push_str(&format!("Content-Length: {}\r\n", cl_val));
        }
    }

    if let Some(cr) = resp.headers().get(reqwest::header::CONTENT_RANGE) {
        if let Ok(cr_val) = cr.to_str() {
            header_str.push_str(&format!("Content-Range: {}\r\n", cr_val));
        }
    }

    header_str.push_str("\r\n");

    if stream.write_all(header_str.as_bytes()).await.is_err() || method == "HEAD" {
        return;
    }

    let mut body_stream = resp.bytes_stream();
    while let Some(chunk_result) = body_stream.next().await {
        match chunk_result {
            Ok(chunk) => {
                if stream.write_all(&chunk).await.is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}

async fn handle_auth_request(
    stream: &mut TcpStream,
    method: &str,
    uri: &str,
    buffer: &[u8],
    _origin: &str,
) {
    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    if uri.starts_with("/auth/login") && method == "GET" {
        let html = r###"<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AniCS — Inicio de Sesión</title>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0b0d13; color: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #131722; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 20px; padding: 36px 30px; max-width: 440px; width: 100%; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7); text-align: center; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(124, 58, 237, 0.15); border: 1px solid rgba(124, 58, 237, 0.3); color: #c084fc; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 24px; }
    .google-btn { width: 100%; background: #ffffff; color: #0f172a; border: none; border-radius: 12px; padding: 13px 18px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 12px; transition: all 0.2s ease; }
    .google-btn:hover { background: #f8fafc; transform: translateY(-1px); }
    .error { margin-top: 14px; padding: 10px; border-radius: 8px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; font-size: 12px; display: none; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="badge">AniCS Cloud Sync</div>
    <h1>Autenticación Segura</h1>
    <p>Inicia sesión con tu cuenta de Google en este navegador para vincularla con AniCS de forma rápida y segura.</p>
    <button class="google-btn" id="loginBtn">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/>
        <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/>
      </svg>
      Continuar con Google
    </button>
    <div class="error" id="error"></div>
  </div>
  <script>
    const firebaseConfig = {
      apiKey: "AIzaSyCiIOVKoThwjMnc1coLu4qVWy4XIw5zRg8",
      authDomain: "anics-20677.firebaseapp.com",
      projectId: "anics-20677",
      storageBucket: "anics-20677.firebasestorage.app",
      messagingSenderId: "306937777600",
      appId: "1:306937777600:web:9905024518d1e3ba1f4c25",
    };
    firebase.initializeApp(firebaseConfig);
    const btn = document.getElementById('loginBtn');
    const errDiv = document.getElementById('error');
    const card = document.getElementById('card');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerText = 'Conectando con Google...';
      errDiv.style.display = 'none';
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const res = await firebase.auth().signInWithPopup(provider);
        const user = res.user;
        // GoogleAuthProvider.credential expects a Google ID token, not a
        // Firebase session ID token returned by user.getIdToken().
        const idToken = (res.credential && res.credential.idToken) ? res.credential.idToken : null;
        const accessToken = (res.credential && res.credential.accessToken) ? res.credential.accessToken : null;
        const callbackResponse = await fetch('/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            idToken: idToken,
            accessToken: accessToken
          })
        });
        if (!callbackResponse.ok) {
          throw new Error('AniCS no pudo recibir la autenticación. Reintenta el inicio de sesión.');
        }
        card.innerHTML = `
          <div style="padding: 10px 0;">
            <div style="font-size: 48px; color: #10b981; margin-bottom: 12px;">✓</div>
            <h1 style="color: #ffffff; font-size: 20px; margin-bottom: 8px;">¡Autenticación Exitosa!</h1>
            <p style="color: #94a3b8; font-size: 13px; margin-bottom: 16px;">
              Hola <strong>${user.displayName || user.email}</strong>, tu cuenta ha sido vinculada correctamente. Ya puedes cerrar esta pestaña y volver a AniCS.
            </p>
          </div>
        `;
        setTimeout(() => { try { window.close(); } catch(e) {} }, 3000);
      } catch (error) {
        btn.disabled = false;
        btn.innerText = 'Reintentar inicio con Google';
        errDiv.innerText = error.message || 'Error durante la autenticación.';
        errDiv.style.display = 'block';
      }
    });
  </script>
</body>
</html>"###;

        let response = format!(
            "HTTP/1.1 200 OK\r\n\
Content-Type: text/html; charset=utf-8\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\r\n{}",
            html.len(),
            html
        );
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    if uri.starts_with("/auth/callback") && method == "POST" {
        let req_str = String::from_utf8_lossy(buffer);
        if let Some(pos) = req_str.find("\r\n\r\n") {
            let body_str = &req_str[pos + 4..];
            if let Ok(data) = serde_json::from_str::<AuthCallbackData>(body_str.trim()) {
                *PENDING_AUTH.lock() = Some(data);
                let res_body = r#"{"status":"success"}"#;
                let res = format!(
                    "HTTP/1.1 200 OK\r\n\
Content-Type: application/json\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\r\n{}",
                    res_body.len(),
                    res_body
                );
                let _ = stream.write_all(res.as_bytes()).await;
                return;
            }
        }
        let err_res = "HTTP/1.1 400 Bad Request\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";
        let _ = stream.write_all(err_res.as_bytes()).await;
        return;
    }

    if uri.starts_with("/auth/status") && method == "GET" {
        let auth_opt = PENDING_AUTH.lock().clone();
        let body = match auth_opt {
            Some(user) => serde_json::json!({ "authenticated": true, "user": user }).to_string(),
            None => serde_json::json!({ "authenticated": false }).to_string(),
        };
        let res = format!(
            "HTTP/1.1 200 OK\r\n\
Content-Type: application/json\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(res.as_bytes()).await;
        return;
    }

    if uri.starts_with("/auth/clear") && (method == "POST" || method == "GET") {
        *PENDING_AUTH.lock() = None;
        let body = r#"{"status":"cleared"}"#;
        let res = format!(
            "HTTP/1.1 200 OK\r\n\
Content-Type: application/json\r\n\
Access-Control-Allow-Origin: *\r\n\
Content-Length: {}\r\n\
Connection: close\r\n\r\n{}",
            body.len(),
            body
        );
        let _ = stream.write_all(res.as_bytes()).await;
        return;
    }

    let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let _ = stream.write_all(not_found.as_bytes()).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_query_param() {
        let uri = "/video?path=C%3A%2Ftest.mp4&token=secret-token-123";
        assert_eq!(extract_query_param(uri, "token"), Some("secret-token-123".to_string()));
        assert_eq!(extract_query_param(uri, "path"), Some("C%3A%2Ftest.mp4".to_string()));
        assert_eq!(extract_query_param(uri, "nonexistent"), None);
    }

    #[test]
    fn test_parse_range() {
        assert_eq!(parse_range("bytes=0-499", 1000), Some((0, 499)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=-500", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=1500-2000", 1000), None);
    }

    #[test]
    fn test_mime_types() {
        assert_eq!(get_mime_type(&PathBuf::from("video.mp4")), "video/mp4");
        assert_eq!(get_mime_type(&PathBuf::from("video.mkv")), "video/x-matroska");
        assert_eq!(get_mime_type(&PathBuf::from("image.webp")), "image/webp");
        assert_eq!(get_mime_type(&PathBuf::from("data.db")), "application/octet-stream");
    }

    #[test]
    fn test_verify_token_constant_time() {
        assert!(verify_token_constant_time(b"any", b"any"));
        assert!(!verify_token_constant_time(b"any", b"bad"));
        assert!(!verify_token_constant_time(b"any", b""));
    }

    #[tokio::test]
    async fn media_authorization_regression() {
        let base = std::env::temp_dir().join(format!("anics_media_{}", uuid::Uuid::new_v4()));
        let allowed = base.join("downloads");
        std::fs::create_dir_all(&allowed).unwrap();
        register_download_root(&allowed);
        let video = allowed.join("video.mp4");
        let outside = base.join("private.txt");
        std::fs::write(&video, b"0123456789").unwrap();
        std::fs::write(&outside, b"private").unwrap();
        async fn request(uri: &str, range: &str) -> String {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let worker = tokio::spawn(async move {
                let (socket, peer) = listener.accept().await.unwrap();
                handle_connection(socket, peer).await;
            });
            let mut client = TcpStream::connect(address).await.unwrap();
            client.write_all(format!("GET {uri} HTTP/1.1\r\nHost: localhost\r\n{range}\r\n").as_bytes()).await.unwrap();
            let mut response = Vec::new();
            client.read_to_end(&mut response).await.unwrap();
            worker.await.unwrap();
            String::from_utf8(response).unwrap()
        }
        let path = urlencoding::encode(video.to_str().unwrap());
        assert!(request(&format!("/video?path={path}"), "").await.starts_with("HTTP/1.1 403"));
        assert!(request(&format!("/video?path={path}&token=wrong"), "").await.starts_with("HTTP/1.1 403"));
        let token = get_media_token();
        assert_eq!(hex::decode(token).unwrap().len(), 32);
        let url = format!("/video?path={path}&token={token}");
        let complete = request(&url, "").await;
        assert!(complete.starts_with("HTTP/1.1 200"));
        assert!(complete.ends_with("0123456789"));
        assert!(request(&format!("{url}&token={token}"), "").await.starts_with("HTTP/1.1 403"));
        let partial = request(&url, "Range: bytes=2-4\r\n").await;
        assert!(partial.starts_with("HTTP/1.1 206"));
        assert!(partial.ends_with("234"));
        for denied in [outside.clone(), allowed.join("../private.txt")] {
            let path = urlencoding::encode(denied.to_str().unwrap());
            assert!(request(&format!("/video?path={path}&token={token}"), "").await.starts_with("HTTP/1.1 403"));
        }
        let link = allowed.join("escape");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&base, &link).unwrap();
        #[cfg(windows)]
        {
            let result = std::process::Command::new("cmd").args(["/c", "mklink", "/J"]).arg(&link).arg(&base).output().unwrap();
            assert!(result.status.success(), "Unable to create test junction");
        }
        let path = urlencoding::encode(link.join("private.txt").to_str().unwrap()).into_owned();
        assert!(request(&format!("/video?path={path}&token={token}"), "").await.starts_with("HTTP/1.1 403"));
        #[cfg(windows)]
        std::fs::remove_dir(&link).unwrap();
        #[cfg(unix)]
        std::fs::remove_file(&link).unwrap();
        SERVER_PORT.store(54321, Ordering::Relaxed);
        let local_url = get_media_stream_url(video.to_str().unwrap());
        assert!(crate::core::validate_url_cached(&local_url).await.is_ok());
        assert!(crate::core::validate_url_cached(&local_url.replace(token, "wrong")).await.is_err());
        SERVER_PORT.store(0, Ordering::Relaxed);
        std::fs::remove_dir_all(base).unwrap();
    }
}
