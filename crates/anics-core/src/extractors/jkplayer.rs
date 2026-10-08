use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static M3U8_DIRECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(https?://[^\s"'\\<>]+\.m3u8[^\s"'\\<>]*)"#).unwrap()
});

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<iframe[^>]+src=["'](https?://[^"']+)["']"#).unwrap()
});

pub fn extract_m3u8(html: &str) -> Option<String> {
    if let Some(m) = M3U8_DIRECT_RE.find(html) {
        let stream = m.as_str().replace('\\', "").replace('\'', "").replace('"', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }
    None
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer)
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de reproductor JKAnime vacía".to_string()));
    }

    // 1. Buscar .m3u8 directo en HTML (Magi / Desu)
    if let Some(stream_url) = extract_m3u8(&html) {
        return Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type: MediaType::Hls,
            referer: Some(url.to_string()),
            user_agent: None,
            qualities: vec![],
        });
    }

    // 2. Probar JsUnpacker
    if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };
        return Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(url.to_string()),
            user_agent: None,
            qualities: vec![],
        });
    }

    // 3. Iframe anidado (por ejemplo, /jkplayer/c1 envolviendo Mp4upload u otros)
    if let Some(cap) = IFRAME_RE.captures(&html) {
        let nested_url = cap[1].replace('\\', "");
        return Box::pin(crate::extractors::resolve_url(&nested_url, Some(url))).await;
    }

    Err(CoreError::Resolver("No se pudo resolver el reproductor de JKAnime".to_string()))
}
