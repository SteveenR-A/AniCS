use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static SOURCES_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)sources\s*:\s*\[\s*\{?\s*file\s*:\s*["'](https?://[^"']+)["']"#).unwrap()
});

static FILE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)file\s*:\s*["'](https?://[^"']+\.m3u8[^"']*)["']"#).unwrap()
});

pub fn extract_stream(html: &str) -> Option<String> {
    let text = if JsUnpacker::is_packed(html) {
        JsUnpacker::unpack(html).unwrap_or_else(|| html.to_string())
    } else {
        html.to_string()
    };

    if let Some(cap) = SOURCES_RE.captures(&text) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    if let Some(cap) = FILE_RE.captures(&text) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    JsUnpacker::extract_stream_url(&text)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://vidhidepro.com/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Vidhide vacía o no disponible".to_string()));
    }

    if let Some(stream_url) = extract_stream(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        let stream_referer = if let Ok(parsed) = url::Url::parse(url) {
            format!("{}://{}/", parsed.scheme(), parsed.host_str().unwrap_or("vidhidepro.com"))
        } else {
            "https://vidhidepro.com/".to_string()
        };

        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(stream_referer),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el stream de Vidhide".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_vidhide_sources() {
        let html = r#"var player = jwplayer("vplayer").setup({ sources: [ { file: "https://node1.vidhidepro.com/hls/master.m3u8" } ] });"#;
        assert_eq!(
            extract_stream(html).as_deref(),
            Some("https://node1.vidhidepro.com/hls/master.m3u8")
        );
    }
}
