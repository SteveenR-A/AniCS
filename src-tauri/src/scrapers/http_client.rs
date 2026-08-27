use once_cell::sync::Lazy;
use reqwest::{
    header::{self, HeaderMap, HeaderValue},
    Client, ClientBuilder,
};

/// Pool de User-Agents modernos para rotación automática en cada petición
const USER_AGENTS: &[&str] = &[
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36",
];

static UA_COUNTER: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Obtiene el siguiente User-Agent en rotación round-robin
pub fn next_user_agent() -> &'static str {
    let idx = UA_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed) % USER_AGENTS.len();
    USER_AGENTS[idx]
}

/// Cliente HTTP compartido con configuración de seguridad y rendimiento óptimos.
/// Creado una sola vez y reutilizado en toda la app (connection pooling interno).
pub static HTTP_CLIENT: Lazy<Client> = Lazy::new(|| {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCEPT,
        HeaderValue::from_static("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("es-419,es;q=0.9,en;q=0.8"),
    );
    headers.insert(
        header::ACCEPT_ENCODING,
        HeaderValue::from_static("gzip, deflate, br"),
    );

    ClientBuilder::new()
        .default_headers(headers)
        .timeout(std::time::Duration::from_secs(20))
        .connect_timeout(std::time::Duration::from_secs(10))
        .gzip(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(USER_AGENTS[0])
        .build()
        .expect("Failed to create HTTP client")
});

/// Descarga el HTML de una URL con rotación automática de User-Agent y
/// lógica de reintento con backoff exponencial para errores 429/5xx.
pub async fn fetch_html(url: &str, referer: Option<&str>) -> Result<String, reqwest::Error> {
    const MAX_ATTEMPTS: u32 = 3;
    let mut last_err = None;

    for attempt in 0..MAX_ATTEMPTS {
        let mut req = HTTP_CLIENT
            .get(url)
            .header(header::USER_AGENT, next_user_agent());

        if let Some(ref_url) = referer {
            req = req.header(header::REFERER, ref_url);
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();

                // Reintentar en 429 / 5xx
                if (status == 429 || status >= 500) && attempt < MAX_ATTEMPTS - 1 {
                    let delay_ms = (2u64.pow(attempt) * 600)
                        + (rand_millis() % 400);
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                    continue;
                }

                if !resp.status().is_success() {
                    return Ok(String::new());
                }

                return resp.text().await;
            }
            Err(e) if attempt < MAX_ATTEMPTS - 1 => {
                last_err = Some(e);
                let delay_ms = (2u64.pow(attempt) * 750) + (rand_millis() % 450);
                tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
            }
            Err(e) => return Err(e),
        }
    }

    Err(last_err.unwrap())
}

/// Pequeño helper para jitter aleatorio sin dependencia pesada
fn rand_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_millis() as u64)
        .unwrap_or(150)
}
