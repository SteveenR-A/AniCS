use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<iframe[^>]+src=["'](https?://[^"']+)["']"#).unwrap()
});

pub fn extract_stream(html: &str) -> Option<String> {
    let text = if JsUnpacker::is_packed(html) {
        JsUnpacker::unpack(html).unwrap_or_else(|| html.to_string())
    } else {
        html.to_string()
    };

    JsUnpacker::extract_stream_url(&text)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://filemoon.sx/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Filemoon vacía o no disponible".to_string()));
    }

    // 1. Probar extracción directa o desempaquetada
    if let Some(stream_url) = extract_stream(&html) {
        let stream_referer = if url.contains("bysekoze") {
            "https://bysekoze.com/".to_string()
        } else {
            "https://filemoon.sx/".to_string()
        };

        return Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type: MediaType::Hls,
            referer: Some(stream_referer),
            user_agent: None,
            qualities: vec![],
        });
    }

    // 2. Si tiene iframe anidado (común en Filemoon -> Bysekoze)
    if let Some(cap) = IFRAME_RE.captures(&html) {
        let iframe_url = cap[1].replace('\\', "");
        if iframe_url.contains("bysekoze") || iframe_url.contains("filemoon") {
            let nested_html = fetch_html(&iframe_url, Some(url))
                .await
                .map_err(CoreError::Network)?;

            if let Some(stream_url) = extract_stream(&nested_html) {
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Hls,
                    referer: Some(iframe_url),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }
    }

    Err(CoreError::Resolver("No se pudo extraer el stream de Filemoon".to_string()))
}
