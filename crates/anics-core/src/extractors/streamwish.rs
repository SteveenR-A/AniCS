use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static FILE_M3U8_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)file\s*:\s*["'](https?://[^"']+\.m3u8[^"']*)["']"#).unwrap()
});

static SOURCES_M3U8_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)(?:source|sources|src)\s*:\s*\[\s*\{?\s*(?:file|src)\s*:\s*["'](https?://[^"']+\.m3u8[^"']*)["']"#).unwrap()
});

pub fn extract_stream(html: &str) -> Option<String> {
    // 1. Desempaquetar con JsUnpacker si tiene eval(function(p,a,c,k,e,d)...)
    let text = if JsUnpacker::is_packed(html) {
        JsUnpacker::unpack(html).unwrap_or_else(|| html.to_string())
    } else {
        html.to_string()
    };

    if let Some(cap) = FILE_M3U8_RE.captures(&text) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    if let Some(cap) = SOURCES_M3U8_RE.captures(&text) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    // 2. Fallback general del unpacker
    JsUnpacker::extract_stream_url(&text)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://embedwish.com/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Streamwish vacía o no disponible".to_string()));
    }

    if let Some(stream_url) = extract_stream(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        // Streamwish exige el Referer del reproductor para no retornar 403
        let stream_referer = if let Ok(parsed) = url::Url::parse(url) {
            format!("{}://{}/", parsed.scheme(), parsed.host_str().unwrap_or("embedwish.com"))
        } else {
            "https://embedwish.com/".to_string()
        };

        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(stream_referer),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el stream HLS/MP4 de Streamwish".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_streamwish_file() {
        let html = r#"jwplayer("vplayer").setup({file: "https://delivery.streamwish.com/hls/test.m3u8"});"#;
        assert_eq!(
            extract_stream(html).as_deref(),
            Some("https://delivery.streamwish.com/hls/test.m3u8")
        );
    }
}
