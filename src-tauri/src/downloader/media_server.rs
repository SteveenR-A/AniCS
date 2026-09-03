use std::io::SeekFrom;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use once_cell::sync::OnceCell;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

static SERVER_PORT: OnceCell<u16> = OnceCell::new();
static MEDIA_TOKEN: OnceCell<String> = OnceCell::new();
static APP_HANDLE: OnceCell<AppHandle> = OnceCell::new();

/// Compara dos tokens en tiempo constante mediante hashing SHA-256 para evitar fugas de longitud y timing attacks
pub fn verify_token_constant_time(expected: &[u8], provided: &[u8]) -> bool {
    if expected.is_empty() || provided.is_empty() {
        return false;
    }
    let h_exp = Sha256::digest(expected);
    let h_prov = Sha256::digest(provided);
    h_exp.ct_eq(&h_prov).into()
}

/// Obtiene el puerto asignado al servidor local de streaming
pub fn get_server_port() -> u16 {
    SERVER_PORT.get().copied().unwrap_or(0)
}

/// Obtiene el token de sesión efímero del servidor de medios
pub fn get_media_token() -> &'static str {
    MEDIA_TOKEN.get().map(|s| s.as_str()).unwrap_or("")
}

/// Genera una URL de streaming local compatible con HTML5 <video> protegida con token
pub fn get_media_stream_url(file_path: &str) -> String {
    let port = get_server_port();
    let token = get_media_token();
    let encoded_path = urlencoding::encode(file_path);
    if port > 0 && !token.is_empty() {
        format!("http://127.0.0.1:{}/video?path={}&token={}", port, encoded_path, token)
    } else if port > 0 {
        format!("http://127.0.0.1:{}/video?path={}", port, encoded_path)
    } else {
        file_path.to_string()
    }
}

pub const PREFERRED_PORT: u16 = 41725;

/// Inicia el servidor HTTP de streaming local en segundo plano
pub async fn start_media_server(app_handle: AppHandle) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let _ = APP_HANDLE.set(app_handle);

    // Intentar enlazar el puerto fijo dedicado para CSP exacto sin comodines (con reintento)
    let mut listener_opt = None;
    for attempt in 0..3 {
        match TcpListener::bind(format!("127.0.0.1:{}", PREFERRED_PORT)).await {
            Ok(l) => {
                listener_opt = Some(l);
                break;
            }
            Err(e) => {
                if attempt < 2 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                } else {
                    log::warn!("[MediaServer] No se pudo enlazar el puerto preferido {}: {}. Usando puerto dinámico.", PREFERRED_PORT, e);
                }
            }
        }
    }

    let listener = match listener_opt {
        Some(l) => l,
        None => TcpListener::bind("127.0.0.1:0").await?,
    };
    let local_addr = listener.local_addr()?;
    let port = local_addr.port();
    let _ = SERVER_PORT.set(port);

    let token = uuid::Uuid::new_v4().to_string();
    let _ = MEDIA_TOKEN.set(token);

    log::info!("Local media streaming server started on port {} with session token", port);

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

/// Valida si una ruta solicitada está dentro de los directorios permitidos y tiene extensión multimedia
pub fn is_path_allowed(file_path: &Path, app_handle: &AppHandle) -> bool {
    // 1. Resolver ruta canónica (si no se puede resolver, el archivo no existe o la ruta es inválida)
    let canonical = match file_path.canonicalize() {
        Ok(c) => c,
        Err(_) => return false,
    };

    // 2. Validar extensión de archivo permitida
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    let allowed_extensions = [
        "mp4", "mkv", "ts", "webm", "avi", "mov", "flv", "m3u8", "jpg", "jpeg", "png", "webp",
    ];
    if !allowed_extensions.contains(&ext.as_str()) {
        log::warn!("Access denied: extension .{} not allowed for media streaming", ext);
        return false;
    }

    // 3. Obtener directorios base permitidos
    let mut allowed_dirs: Vec<PathBuf> = Vec::new();

    // Carpeta de descargas por defecto
    if let Ok(dir) = crate::commands::download_cmd::get_default_download_dir(app_handle.clone()) {
        if let Ok(canon) = Path::new(&dir).canonicalize() {
            allowed_dirs.push(canon);
        }
    }

    // Carpeta de descargas personalizada si está configurada
    if let Ok(Some(custom_dir)) = crate::storage::get_setting("download_dir") {
        if let Ok(canon) = Path::new(&custom_dir).canonicalize() {
            allowed_dirs.push(canon);
        }
    }

    // Carpeta de caché de imágenes
    if let Ok(cache_dir) = app_handle.path().app_cache_dir() {
        if let Ok(canon) = cache_dir.canonicalize() {
            allowed_dirs.push(canon);
        }
    }

    // Carpeta de portadas internas
    if let Ok(data_dir) = app_handle.path().app_data_dir() {
        let covers_dir = data_dir.join("covers");
        if let Ok(canon) = covers_dir.canonicalize() {
            allowed_dirs.push(canon);
        } else if let Ok(canon) = data_dir.canonicalize() {
            allowed_dirs.push(canon);
        }
    }

    // Directorio compartido de Android si existe
    #[cfg(target_os = "android")]
    {
        if let Ok(canon) = Path::new("/storage/emulated/0/Anime").canonicalize() {
            allowed_dirs.push(canon);
        }
    }

    allowed_dirs.iter().any(|base| canonical.starts_with(base))
}

async fn handle_connection(mut stream: TcpStream, _addr: SocketAddr) {
    let mut buffer = [0u8; 4096];
    let n = match stream.read(&mut buffer).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let request = String::from_utf8_lossy(&buffer[..n]);
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

    // Extraer origen y referer para política CORS restringida y defensa anti-CSRF
    let mut origin_header: Option<&str> = None;
    let mut referer_header: Option<&str> = None;
    let mut range_header: Option<&str> = None;

    for line in lines {
        let lower = line.to_lowercase();
        if lower.starts_with("origin:") {
            origin_header = Some(line["origin:".len()..].trim());
        } else if lower.starts_with("referer:") {
            referer_header = Some(line["referer:".len()..].trim());
        } else if lower.starts_with("range:") {
            range_header = Some(line["range:".len()..].trim());
        }
    }

    // 1. Bloqueo temprano si se envía un Origin no autorizado desde un navegador externo (Anti-CSRF)
    if let Some(o) = origin_header {
        if o != "tauri://localhost" && o != "http://tauri.localhost" && o != "http://localhost:1420" {
            log::warn!("[MediaServer] Solicitud bloqueada por Origin no autorizado");
            let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nUnauthorized Origin";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    }

    // 2. Bloqueo si el Referer proviene de un dominio web externo ajeno a Tauri
    if let Some(ref_str) = referer_header {
        if !ref_str.starts_with("tauri://localhost")
            && !ref_str.starts_with("http://tauri.localhost")
            && !ref_str.starts_with("http://localhost:1420")
            && !ref_str.starts_with("http://127.0.0.1:")
        {
            log::warn!("[MediaServer] Solicitud bloqueada por Referer no autorizado");
            let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nUnauthorized Referer";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    }

    // Cabecera CORS estricta: sólo permitir orígenes legítimos del WebView
    let cors_allow_origin = match origin_header {
        Some(o) if o == "tauri://localhost" || o == "http://tauri.localhost" || o == "http://localhost:1420" => {
            format!("Access-Control-Allow-Origin: {}\r\n", o)
        }
        None => "Access-Control-Allow-Origin: tauri://localhost\r\n".to_string(),
        _ => String::new(),
    };

    if method == "OPTIONS" {
        let response = format!(
            "HTTP/1.1 204 No Content\r\n\
{}Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\
\r\n",
            cors_allow_origin
        );
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    if method != "GET" && method != "HEAD" {
        let response = "HTTP/1.1 405 Method Not Allowed\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // 3. Validar presencia y coincidencia del token de sesión en tiempo constante
    let expected_token = get_media_token();
    let provided_token = extract_query_param(uri, "token").unwrap_or_default();
    if expected_token.is_empty() || !verify_token_constant_time(expected_token.as_bytes(), provided_token.as_bytes()) {
        log::warn!("[MediaServer] Intento de acceso no autorizado: token inválido o ausente");
        let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nMissing or invalid token";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // 4. Extraer parámetro `path` de la URL /video?path=...
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

    let file_path = PathBuf::from(&file_path_str);

    // 5. Inspeccionar metadatos de symlink SIN resolver: Bloquear cualquier enlace simbólico
    let symlink_meta = match tokio::fs::symlink_metadata(&file_path).await {
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

    if symlink_meta.file_type().is_symlink() {
        log::warn!("[MediaServer] Acceso denegado: se detectó enlace simbólico no permitido");
        let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nSymlinks are not allowed";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // 6. Validar que la ruta canónica esté dentro de las carpetas autorizadas de la app
    if let Some(app) = APP_HANDLE.get() {
        if !is_path_allowed(&file_path, app) {
            log::warn!("[MediaServer] Acceso denegado: ruta fuera de los directorios permitidos de la app");
            let response = "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nAccess denied: path outside allowed directory";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    }

    let metadata = match tokio::fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(_) => {
            let response = "HTTP/1.1 404 Not Found\r\n\r\nFile not found";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    };

    let total_size = metadata.len();
    let mime_type = get_mime_type(&file_path);

    // 5. Manejar cabecera Range: bytes=start-end
    if let Some(range_str) = range_header {
        if let Some((start, end)) = parse_range(range_str, total_size) {
            let content_length = end - start + 1;
            let header = format!(
                "HTTP/1.1 206 Partial Content\r\n\
{}Accept-Ranges: bytes\r\n\
Content-Range: bytes {}-{}/{}\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
                cors_allow_origin, start, end, total_size, content_length, mime_type
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
    }

    // Respuesta completa 200 OK
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
{}Accept-Ranges: bytes\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
        cors_allow_origin, total_size, mime_type
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

fn get_mime_type(path: &PathBuf) -> &'static str {
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
        let secret = b"my-secret-token-12345";
        let valid = b"my-secret-token-12345";
        let invalid = b"my-secret-token-wrong";
        let empty = b"";

        assert!(verify_token_constant_time(secret, valid));
        assert!(!verify_token_constant_time(secret, invalid));
        assert!(!verify_token_constant_time(secret, empty));
        assert!(!verify_token_constant_time(empty, valid));
    }
}

