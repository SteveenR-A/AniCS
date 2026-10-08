use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

pub fn extract_stream(html: &str) -> Option<String> {
    let text = if JsUnpacker::is_packed(html) {
        JsUnpacker::unpack(html).unwrap_or_else(|| html.to_string())
    } else {
        html.to_string()
    };

    JsUnpacker::extract_stream_url(&text)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let html = fetch_html(url, referer.or(Some("https://luluvdo.com/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de Lulustream vacía o no disponible".to_string()));
    }

    if let Some(stream_url) = extract_stream(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        let stream_referer = if let Ok(parsed) = url::Url::parse(url) {
            format!("{}://{}/", parsed.scheme(), parsed.host_str().unwrap_or("luluvdo.com"))
        } else {
            "https://luluvdo.com/".to_string()
        };

        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(stream_referer),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el stream de Lulustream".to_string()))
    }
}
