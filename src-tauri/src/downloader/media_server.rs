use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use std::io::SeekFrom;

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

/// Obtiene el puerto asignado al servidor local de streaming
pub fn get_server_port() -> u16 {
    SERVER_PORT.load(Ordering::Relaxed)
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
pub async fn start_media_server() -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
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

    if method == "OPTIONS" {
        let response = "HTTP/1.1 204 No Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: GET, HEAD, OPTIONS\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\
\r\n";
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
    if !file_path.exists() {
        let response = "HTTP/1.1 404 Not Found\r\n\r\nFile not found";
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    let metadata = match tokio::fs::metadata(&file_path).await {
        Ok(m) => m,
        Err(_) => {
            let response = "HTTP/1.1 500 Internal Server Error\r\n\r\n";
            let _ = stream.write_all(response.as_bytes()).await;
            return;
        }
    };

    let total_size = metadata.len();
    let mime_type = get_mime_type(&file_path);

    // Buscar cabecera Range: bytes=start-end
    let mut range_header: Option<&str> = None;
    for line in lines {
        if line.to_lowercase().starts_with("range:") {
            range_header = Some(line["range:".len()..].trim());
            break;
        }
    }

    if let Some(range_str) = range_header {
        if let Some((start, end)) = parse_range(range_str, total_size) {
            let content_length = end - start + 1;
            let header = format!(
                "HTTP/1.1 206 Partial Content\r\n\
Access-Control-Allow-Origin: *\r\n\
Accept-Ranges: bytes\r\n\
Content-Range: bytes {}-{}/{}\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
                start, end, total_size, content_length, mime_type
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
Access-Control-Allow-Origin: *\r\n\
Accept-Ranges: bytes\r\n\
Content-Length: {}\r\n\
Content-Type: {}\r\n\
\r\n",
        total_size, mime_type
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

fn extract_query_param(uri: &str, key: &str) -> Option<String> {
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

fn parse_range(range_str: &str, total_size: u64) -> Option<(u64, u64)> {
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
        _ => "application/octet-stream",
    }
}
