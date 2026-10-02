use once_cell::sync::Lazy;
use reqwest::{
    header::{self, HeaderMap, HeaderValue},
    Client, ClientBuilder,
};

pub use anics_core::http::{fetch_html, next_user_agent, rand_millis, HTTP_CLIENT, USER_AGENTS};

/// Cliente HTTP dedicado para descargas de archivos pesados (MP4 / segmentos TS).
/// No tiene timeout de lectura global para no cortar descargas de varios minutos/horas.
pub static DOWNLOAD_CLIENT: Lazy<Client> = Lazy::new(|| {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCEPT,
        HeaderValue::from_static("*/*"),
    );
    headers.insert(
        header::ACCEPT_LANGUAGE,
        HeaderValue::from_static("es-ES,es;q=0.9,en;q=0.8"),
    );

    ClientBuilder::new()
        .default_headers(headers)
        .connect_timeout(std::time::Duration::from_secs(30))
        .tcp_keepalive(Some(std::time::Duration::from_secs(15)))
        .pool_idle_timeout(Some(std::time::Duration::from_secs(90)))
        .gzip(true)
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent(USER_AGENTS[0])
        .build()
        .expect("Failed to create Download HTTP client")
});
