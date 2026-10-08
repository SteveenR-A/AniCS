use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};

static MP4_SRC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)src\s*:\s*["'](https?://[^"']+\.mp4[^"']*)["']"#).unwrap()
});

static PLAYER_SRC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)player\.src\(\s*\{?\s*src:\s*["'](https?://[^"']+)["']"#).unwrap()
});

static SOURCE_TAG_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<source[^>]+src=["'](https?://[^"']+\.mp4[^"']*)["']"#).unwrap()
});

static CDN_DIRECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(https?://[a-zA-Z0-9.\-_:]+\.mp4upload\.com(?::\d+)?/[^\s"'<>]+\.mp4[^\s"'<>]*)"#).unwrap()
});

pub fn extract_stream(html: &str) -> Option<String> {
    if let Some(cap) = MP4_SRC_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    if let Some(cap) = PLAYER_SRC_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    if let Some(cap) = SOURCE_TAG_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    if let Some(cap) = CDN_DIRECT_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    None
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let req_referer = referer.unwrap_or("https://www.mp4upload.com/");
    let html = fetch_html(url, Some(req_referer))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Mp4upload vacía o no disponible".to_string()));
    }

    if let Some(stream_url) = extract_stream(&html) {
        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type: MediaType::Mp4,
            referer: Some("https://www.mp4upload.com/".to_string()),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el video MP4 directo de Mp4upload".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_mp4upload_src() {
        let html = r#"<script>player.src({src: "https://a4.mp4upload.com:183/d/abcd/video.mp4"});</script>"#;
        assert_eq!(
            extract_stream(html).as_deref(),
            Some("https://a4.mp4upload.com:183/d/abcd/video.mp4")
        );
    }
}
