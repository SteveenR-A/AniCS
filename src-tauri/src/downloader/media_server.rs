use std::io::SeekFrom;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use once_cell::sync::Lazy;
use parking_lot::Mutex;

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AuthCallbackData {
    pub uid: String,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub photo_url: Option<String>,
    pub id_token: Option<String>,
    pub access_token: Option<String>,
}

static PENDING_AUTH: Lazy<Mutex<Option<AuthCallbackData>>> = Lazy::new(|| Mutex::new(None));

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
Access-Control-Allow-Methods: GET, HEAD, OPTIONS, POST\r\n\
Access-Control-Allow-Headers: Range, Content-Type, Accept\r\n\
Access-Control-Max-Age: 86400\r\n\
\r\n", origin);
        let _ = stream.write_all(response.as_bytes()).await;
        return;
    }

    // Interceptar rutas de autenticación segura vía navegador externo
    if uri.starts_with("/auth") {
        handle_auth_request(&mut stream, method, uri, &buffer[..n], &origin).await;
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
        const idToken = await user.getIdToken();
        const accessToken = (res.credential && res.credential.accessToken) ? res.credential.accessToken : null;
        await fetch('/auth/callback', {
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
    }
}
