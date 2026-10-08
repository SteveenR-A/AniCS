use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static UQLOAD_SRC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"sources\s*:\s*\[\s*['"](https?://[^'"]+)['"]"#).unwrap()
});

static VIDEO_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<(?:video|source)[^>]+src=["'](https?://[^"']+)["']"#).unwrap()
});

pub fn extract_stream(html: &str) -> Option<String> {
    if let Some(cap) = UQLOAD_SRC_RE.captures(html) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    if let Some(cap) = VIDEO_TAG_RE.captures(html) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    JsUnpacker::extract_stream_url(html)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://uqload.com/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Uqload vacía o no disponible".to_string()));
    }

    if let Some(stream_url) = extract_stream(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        let stream_referer = if let Ok(parsed) = url::Url::parse(url) {
            format!("{}://{}/", parsed.scheme(), parsed.host_str().unwrap_or("uqload.com"))
        } else {
            "https://uqload.com/".to_string()
        };

        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(stream_referer),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el video de Uqload".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_uqload_sources() {
        let html = r#"sources: ["https://m5.uqload.to/v.mp4"]"#;
        assert_eq!(
            extract_stream(html).as_deref(),
            Some("https://m5.uqload.to/v.mp4")
        );
    }
}
