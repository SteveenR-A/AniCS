use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ExtractorKind {
    JKAnime,
    MundoDonghua,
    OtakusTV,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceConfig {
    /// Catalog identity, including legacy custom_<index> IDs.
    pub id: String,
    pub name: String,
    /// Parser/resolver implementation; independent of identity and display name.
    pub extractor: ExtractorKind,
    pub base_url: String,
    pub mirror_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogHttpConfig {
    pub request_timeout_ms: u32,
    pub connect_timeout_ms: u32,
    pub max_redirects: u32,
    /// Includes the first request, rather than just retries.
    pub max_attempts: u32,
}

impl Default for CatalogHttpConfig {
    fn default() -> Self {
        Self {
            request_timeout_ms: 20_000,
            connect_timeout_ms: 10_000,
            max_redirects: 10,
            max_attempts: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoreConfig {
    pub sources: Vec<SourceConfig>,
    pub http: CatalogHttpConfig,
}

/// Shape of the existing custom_sources setting; not a new persistence schema.
#[derive(Deserialize)]
struct StoredCustomSource {
    name: String,
    url: String,
    #[serde(default)]
    r#type: String,
}

impl Default for CoreConfig {
    fn default() -> Self {
        Self::from_settings(&HashMap::new())
    }
}

impl CoreConfig {
    /// Builds a detached snapshot supplied by a platform adapter.
    /// Preserves legacy defaults, ordering and malformed-custom-setting fallback.
    /// This is not URL authorization; adapters must validate before I/O.
    pub fn from_settings(settings: &HashMap<String, String>) -> Self {
        let domain = |key: &str, fallback: &str| {
            settings
                .get(key)
                .cloned()
                .unwrap_or_else(|| fallback.to_owned())
        };
        let mirrors = vec![
            "https://jkanime.org".to_owned(),
            "https://jkanime.bz".to_owned(),
            "https://jkanime.net".to_owned(),
        ];
        let mut sources = vec![
            SourceConfig {
                id: "jkanime".into(),
                name: "Anime".into(),
                extractor: ExtractorKind::JKAnime,
                base_url: domain("jkanime_base_url", "https://jkanime.org"),
                mirror_urls: mirrors.clone(),
            },
            SourceConfig {
                id: "mundodonghua".into(),
                name: "Donghua".into(),
                extractor: ExtractorKind::MundoDonghua,
                base_url: domain("mundodonghua_base_url", "https://www.mundodonghua.com"),
                mirror_urls: vec![],
            },
            SourceConfig {
                id: "otakustv".into(),
                name: "OtakusTV".into(),
                extractor: ExtractorKind::OtakusTV,
                base_url: domain("otakustv_base_url", "https://www.otakustv.net"),
                mirror_urls: vec![],
            },
        ];
        let custom: Vec<StoredCustomSource> = settings
            .get("custom_sources")
            .and_then(|raw| serde_json::from_str(raw).ok())
            .unwrap_or_default();
        for (index, custom) in custom.into_iter().enumerate() {
            let kind = custom.r#type.to_lowercase();
            let extractor = if kind.contains("donghua") {
                ExtractorKind::MundoDonghua
            } else if kind.contains("otakustv") || kind.contains("respaldo") {
                ExtractorKind::OtakusTV
            } else {
                ExtractorKind::JKAnime
            };
            let mirror_urls = if extractor == ExtractorKind::JKAnime {
                mirrors.clone()
            } else {
                vec![]
            };
            sources.push(SourceConfig {
                id: format!("custom_{index}"),
                name: custom.name,
                extractor,
                base_url: custom.url,
                mirror_urls,
            });
        }
        Self {
            sources,
            http: CatalogHttpConfig::default(),
        }
    }
}
