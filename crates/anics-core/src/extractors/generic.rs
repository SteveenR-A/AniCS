use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<iframe[^>]+src=["'](https?://[^"']+)["']"#).unwrap()
});

static VIDEO_SOURCE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:src|file)\s*[:=]\s*["'](https?://[^"']+\.(?:m3u8|mp4)[^"']*)["']"#).unwrap()
});

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    // Preserve signed URLs without fetching the video as HTML.
    if let Some(media) = super::direct_media(url, referer) {
        return Ok(media);
    }

    // 2. Descargar página para inspección
    let html = fetch_html(url, referer)
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver(format!("No se pudo cargar el servidor en {url}")));
    }

    // A) Probar JsUnpacker
    if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        return Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: referer.map(|s| s.to_string()).or_else(|| Some(url.to_string())),
            user_agent: None,
            qualities: vec![],
        });
    }

    // B) Buscar regex directa de video/fuente
    if let Some(cap) = VIDEO_SOURCE_RE.captures(&html) {
        let stream_url = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream_url) {
            let media_type = if stream_url.contains(".m3u8") {
                MediaType::Hls
            } else {
                MediaType::Mp4
            };
            return Ok(ResolvedMedia {
                direct_url: stream_url,
                media_type,
                referer: referer.map(|s| s.to_string()).or_else(|| Some(url.to_string())),
                user_agent: None,
                qualities: vec![],
            });
        }
    }

    // C) Iframe anidado
    if let Some(cap) = IFRAME_RE.captures(&html) {
        let nested_url = cap[1].replace('\\', "");
        if nested_url.starts_with("http") && nested_url != url {
            return Box::pin(crate::extractors::resolve_url(&nested_url, Some(url))).await;
        }
    }

    Err(CoreError::Resolver(format!(
        "No se pudo determinar el flujo de video en servidor genérico: {url}"
    )))
}
