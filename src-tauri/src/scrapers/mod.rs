pub mod http_client;
pub mod jkanime;
pub mod mundodonghua;
pub mod otakustv;

pub use http_client::{fetch_html, DOWNLOAD_CLIENT, HTTP_CLIENT};
pub use jkanime::JKAnimeExtractor;
pub use mundodonghua::MundoDonghuaExtractor;
pub use otakustv::OtakusTVExtractor;

pub use anics_core::scrapers::{
    all_default_extractors, all_extractors_with_config, attr, create_default_extractor,
    create_extractor_from_source, create_extractor_with_config, inner_text, normalize_url,
    select_nodes, AnimeExtractor, CustomSourceConfig,
};

pub fn get_custom_sources() -> Vec<CustomSourceConfig> {
    crate::storage::get_setting("custom_sources")
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str::<Vec<CustomSourceConfig>>(&raw).ok())
        .unwrap_or_default()
}

pub fn create_extractor(id: &str) -> Option<Box<dyn AnimeExtractor>> {
    match id {
        "jkanime" => {
            let base = crate::storage::get_setting("jkanime_base_url")
                .ok()
                .flatten()
                .unwrap_or_else(|| "https://jkanime.org".to_string());
            Some(Box::new(JKAnimeExtractor::with_base_url(base)))
        }
        "mundodonghua" => {
            let base = crate::storage::get_setting("mundodonghua_base_url")
                .ok()
                .flatten()
                .unwrap_or_else(|| "https://www.mundodonghua.com".to_string());
            Some(Box::new(MundoDonghuaExtractor::with_base_url(base)))
        }
        "otakustv" => {
            let base = crate::storage::get_setting("otakustv_base_url")
                .ok()
                .flatten()
                .unwrap_or_else(|| "https://www.otakustv.net".to_string());
            Some(Box::new(OtakusTVExtractor::with_base_url(base)))
        }
        custom_id if custom_id.starts_with("custom_") => {
            let custom_sources = get_custom_sources();
            if let Some(idx_str) = custom_id.strip_prefix("custom_") {
                if let Ok(idx) = idx_str.parse::<usize>() {
                    if let Some(cfg) = custom_sources.get(idx) {
                        let base = cfg.url.clone();
                        let t = cfg.r#type.to_lowercase();
                        return if t.contains("donghua") {
                            Some(Box::new(MundoDonghuaExtractor::with_base_url(base)))
                        } else if t.contains("otakustv") || t.contains("respaldo") {
                            Some(Box::new(OtakusTVExtractor::with_base_url(base)))
                        } else {
                            Some(Box::new(JKAnimeExtractor::with_base_url(base)))
                        };
                    }
                }
            }
            None
        }
        _ => None,
    }
}

pub fn all_extractors() -> Vec<Box<dyn AnimeExtractor>> {
    vec![
        create_extractor("jkanime").unwrap(),
        create_extractor("mundodonghua").unwrap(),
        create_extractor("otakustv").unwrap(),
    ]
}
