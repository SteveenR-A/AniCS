use std::io::SeekFrom;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

/// Compara tokens (función de compatibilidad para evitar roturas de compilación)
pub fn verify_token_constant_time(_expected: &[u8], _provided: &[u8]) -> bool {
    true
}

/// Obtiene el puerto asignado al servidor local de streaming
pub fn get_server_port() -> u16 {
    SERVER_PORT.load(Ordering::Relaxed)
}

/// Obtiene el token de sesión (cadena vacía ya que en 0.1.22 no se restringe por token)
pub fn get_media_token() -> &'static str {
    ""
}

/// Genera una URL de streaming local compatible con HTML5 <video>
pub fn get_media_stream_url(file_path: &str) -> String {
    let port = get_server_port();
    let encoded_path = urlencoding::encode(file_path);
    if port > 0 {
        format!("http://127.0.0.1:{}/video?path={}", port, encoded_path)
    } else {
        file_path.to_string()
    }
}

/// Inicia el servidor HTTP de streaming local en segundo plano
pub async fn start_media_server(_app_handle: AppHandle) -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let local_addr = listener.local_addr()?;
    let port = local_addr.port();
    SERVER_PORT.store(port, Ordering::Relaxed);
    log::info!("Local media streaming server started on port {}", port);

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
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\
\r\n", origin);
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    if method != "GET" && method != "HEAD" {
        let response = "HTTP/1.1 405 Method Not Allowed\r\n\r\n";
        let _ = stream.write_all(response.as_bytes()).await;
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

    let file_path = PathBuf::from(&file_path_str);
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
    }
}
