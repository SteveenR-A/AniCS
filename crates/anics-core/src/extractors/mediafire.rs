use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};

static DOWNLOAD_BTN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)<a[^>]+(?:id="downloadButton"|aria-label="Download file")[^>]+href=["'](https?://[^"']+)["']"#).unwrap()
});

static DIRECT_DL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)href\s*=\s*["'](https?://download\d+\.mediafire\.com/[^"']+)["']"#).unwrap()
});

pub fn extract_download_url(html: &str) -> Option<String> {
    if let Some(cap) = DIRECT_DL_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    if let Some(cap) = DOWNLOAD_BTN_RE.captures(html) {
        return Some(cap[1].to_string());
    }
    None
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    // Si ya es un enlace directo de descarga de Mediafire
    if url.contains("download") && url.contains(".mediafire.com/") {
        return Ok(ResolvedMedia {
            direct_url: url.to_string(),
            media_type: MediaType::Mp4,
            referer: None,
            user_agent: None,
            qualities: vec![],
        });
    }

    let html = fetch_html(url, referer)
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Mediafire vacía o inaccesible".to_string()));
    }

    if let Some(dl_url) = extract_download_url(&html) {
        Ok(ResolvedMedia {
            direct_url: dl_url,
            media_type: MediaType::Mp4,
            referer: None,
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el enlace de descarga de Mediafire".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_mediafire_button() {
        let html = r#"<a class="input popsok" id="downloadButton" href="https://download123.mediafire.com/xyz/anime.mp4">Download</a>"#;
        assert_eq!(
            extract_download_url(html).as_deref(),
            Some("https://download123.mediafire.com/xyz/anime.mp4")
        );
    }
}
