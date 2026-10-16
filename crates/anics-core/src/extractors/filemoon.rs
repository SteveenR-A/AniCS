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

fn extract_media(html: &str, page_url: &str) -> Option<ResolvedMedia> {
    let stream_url = extract_stream(html)?;
    Some(ResolvedMedia {
        media_type: super::direct_media_type(&stream_url).unwrap_or(MediaType::Hls),
        direct_url: stream_url,
        referer: Some(page_url.to_string()),
        user_agent: None,
        qualities: vec![],
    })
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://filemoon.sx/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Filemoon vacía o no disponible".to_string()));
    }
    if html.contains("<title>Byse Frontend</title>") {
        return Err(CoreError::Resolver("Este espejo de Filemoon requiere su reproductor web. Abre el enlace en el navegador o elige otro servidor.".to_string()));
    }

    // 1. Probar extracción directa o desempaquetada
    if let Some(media) = extract_media(&html, url) {
        return Ok(media);
    }

    // 2. Si tiene iframe anidado (común en Filemoon -> Bysekoze)
    if let Some(cap) = IFRAME_RE.captures(&html) {
        let iframe_url = cap[1].replace('\\', "");
        if super::detect_host(&iframe_url) == super::VideoHost::Filemoon {
            let nested_html = fetch_html(&iframe_url, Some(url))
                .await
                .map_err(CoreError::Network)?;

            if let Some(media) = extract_media(&nested_html, &iframe_url) {
                return Ok(media);
            }
        }
    }

    Err(CoreError::Resolver("No se pudo extraer el stream de Filemoon".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirror_streams_keep_their_page_referer_and_actual_media_type() {
        let page = "https://bysesukior.com/e/123";
        for (stream, expected_type) in [
            ("https://cdn.example.com/video.mp4?token=a%2Fb", MediaType::Mp4),
            ("https://cdn.example.com/master.m3u8?token=a%2Fb", MediaType::Hls),
        ] {
            let html = format!(r#"<script>var player = {{file: "{stream}"}};</script>"#);
            let media = extract_media(&html, page).unwrap();
            assert_eq!(media.direct_url, stream);
            assert_eq!(media.media_type, expected_type);
            assert_eq!(media.referer.as_deref(), Some(page));
        }
    }
}
