use async_trait::async_trait;
use scraper::{Html, Selector};

use crate::config::{CoreConfig, ExtractorKind, SourceConfig};
use crate::error::CoreResult;
use crate::models::*;

pub mod jkanime;
pub mod mundodonghua;
pub mod otakustv;

pub use jkanime::JKAnimeExtractor;
pub use mundodonghua::MundoDonghuaExtractor;
pub use otakustv::OtakusTVExtractor;

// ──────────────────────────────────────────
// Trait principal de extractor
// ──────────────────────────────────────────

#[async_trait]
pub trait AnimeExtractor: Send + Sync {
    /// Identificador único del extractor (ej: "jkanime", "mundodonghua")
    fn id(&self) -> &'static str;
    /// Nombre legible del extractor (ej: "JKAnime", "MundoDonghua")
    fn name(&self) -> &'static str;
    /// Dominio base (ej: "jkanime.net")
    fn base_url(&self) -> &str;

    /// Búsqueda simple por texto
    async fn search(&self, query: &str) -> CoreResult<Vec<AnimeResult>>;

    /// Últimos episodios emitidos (home/feed)
    async fn get_latest(&self, page: u32) -> CoreResult<Vec<AnimeResult>>;

    /// Estreno de la semana / horario plano
    async fn get_schedule(&self) -> CoreResult<Vec<AnimeResult>>;

    /// Horario estructurado agrupado por días de la semana
    async fn get_schedule_days(&self) -> CoreResult<Vec<ScheduleDay>> {
        let animes = self.get_schedule().await?;
        Ok(vec![ScheduleDay {
            day: "Semana".to_string(),
            animes,
        }])
    }

    /// Top y Ranking de animes más populares / mejor valorados
    async fn get_top(&self) -> CoreResult<Vec<AnimeResult>> {
        self.get_latest(1).await
    }

    /// Detalles completos de una serie incluyendo lista de episodios
    async fn get_details(&self, url: &str) -> CoreResult<AnimeDetails>;

    /// Lista de servidores de video disponibles para un episodio
    async fn get_servers(&self, episode_url: &str) -> CoreResult<Vec<VideoServer>>;

    /// Resuelve un servidor de video a una URL directa (HLS/MP4)
    async fn resolve_stream(&self, server: &VideoServer) -> CoreResult<ResolvedMedia>;

    /// Obtiene la lista de géneros disponibles en la fuente
    async fn get_genres(&self) -> CoreResult<Vec<GenreItem>>;

    /// Búsqueda avanzada con filtros (géneros, estado, tipo, año, etc.)
    async fn advanced_search(&self, filters: &SearchFilters) -> CoreResult<SearchResultPage> {
        let results = if let Some(q) = &filters.query {
            self.search(q).await?
        } else {
            vec![]
        };
        Ok(SearchResultPage {
            current_page: filters.page,
            total_pages: None,
            has_next: false,
            results,
        })
    }
}

// ──────────────────────────────────────────
// Factory de extractores desacoplada
// ──────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CustomSourceConfig {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub r#type: String,
}

pub fn create_extractor_from_source(source: &SourceConfig) -> Box<dyn AnimeExtractor> {
    match source.extractor {
        ExtractorKind::JKAnime => Box::new(JKAnimeExtractor::with_base_url(source.base_url.clone())),
        ExtractorKind::MundoDonghua => Box::new(MundoDonghuaExtractor::with_base_url(source.base_url.clone())),
        ExtractorKind::OtakusTV => Box::new(OtakusTVExtractor::with_base_url(source.base_url.clone())),
    }
}

pub fn create_extractor_with_config(id: &str, config: &CoreConfig) -> Option<Box<dyn AnimeExtractor>> {
    if let Some(source) = config.sources.iter().find(|s| s.id == id) {
        return Some(create_extractor_from_source(source));
    }
    match id {
        "jkanime" => Some(Box::new(JKAnimeExtractor::new())),
        "mundodonghua" => Some(Box::new(MundoDonghuaExtractor::new())),
        "otakustv" => Some(Box::new(OtakusTVExtractor::new())),
        _ => None,
    }
}

pub fn all_extractors_with_config(config: &CoreConfig) -> Vec<Box<dyn AnimeExtractor>> {
    config
        .sources
        .iter()
        .map(create_extractor_from_source)
        .collect()
}

pub fn create_default_extractor(id: &str) -> Option<Box<dyn AnimeExtractor>> {
    create_extractor_with_config(id, &CoreConfig::default())
}

pub fn all_default_extractors() -> Vec<Box<dyn AnimeExtractor>> {
    all_extractors_with_config(&CoreConfig::default())
}

// ──────────────────────────────────────────
// Helpers de parsing HTML compartidos
// ──────────────────────────────────────────

/// Parsea HTML y selecciona nodos de forma segura
pub fn select_nodes<'a>(
    document: &'a Html,
    selector_str: &str,
) -> Vec<scraper::ElementRef<'a>> {
    if let Ok(sel) = Selector::parse(selector_str) {
        document.select(&sel).collect()
    } else {
        vec![]
    }
}

pub fn inner_text(el: &scraper::ElementRef) -> String {
    el.text()
        .collect::<String>()
        .trim()
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn attr(el: &scraper::ElementRef, attr_name: &str) -> String {
    el.value()
        .attr(attr_name)
        .unwrap_or("")
        .trim()
        .to_string()
}

pub fn normalize_url(href: &str, base: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else if href.starts_with("//") {
        format!("https:{href}")
    } else if href.starts_with('/') {
        if let Ok(base_url) = url::Url::parse(base) {
            let origin = format!("{}://{}", base_url.scheme(), base_url.host_str().unwrap_or(""));
            format!("{origin}{href}")
        } else {
            href.to_string()
        }
    } else {
        href.to_string()
    }
}
