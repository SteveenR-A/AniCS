use async_trait::async_trait;
use scraper::{Html, Selector};

use crate::core::*;

pub mod http_client;
pub mod jkanime;
pub mod mundodonghua;

pub use http_client::{fetch_html, HTTP_CLIENT, DOWNLOAD_CLIENT};
pub use jkanime::JKAnimeExtractor;
pub use mundodonghua::MundoDonghuaExtractor;

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
    async fn search(&self, query: &str) -> AppResult<Vec<AnimeResult>>;

    /// Últimos episodios emitidos (home/feed)
    async fn get_latest(&self, page: u32) -> AppResult<Vec<AnimeResult>>;

    /// Estreno de la semana / horario plano
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>>;

    /// Horario estructurado agrupado por días de la semana
    async fn get_schedule_days(&self) -> AppResult<Vec<ScheduleDay>> {
        let animes = self.get_schedule().await?;
        Ok(vec![ScheduleDay {
            day: "Semana".to_string(),
            animes,
        }])
    }

    /// Top y Ranking de animes más populares / mejor valorados
    async fn get_top(&self) -> AppResult<Vec<AnimeResult>> {
        self.get_latest(1).await
    }

    /// Detalles completos de una serie incluyendo lista de episodios
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails>;

    /// Lista de servidores de video disponibles para un episodio
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>>;

    /// Resuelve un servidor de video a una URL directa (HLS/MP4)
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia>;

    /// Obtiene la lista de géneros disponibles en la fuente
    async fn get_genres(&self) -> AppResult<Vec<GenreItem>>;

    /// Búsqueda avanzada con filtros (géneros, estado, tipo, año, etc.)
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        // Implementación por defecto: búsqueda simple si no se sobreescribe
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
// Factory de extractores
// ──────────────────────────────────────────

pub fn create_extractor(id: &str) -> Option<Box<dyn AnimeExtractor>> {
    match id {
        "jkanime" => Some(Box::new(JKAnimeExtractor::new())),
        "mundodonghua" => Some(Box::new(MundoDonghuaExtractor::new())),
        _ => None,
    }
}

pub fn all_extractors() -> Vec<Box<dyn AnimeExtractor>> {
    vec![
        Box::new(JKAnimeExtractor::new()),
        Box::new(MundoDonghuaExtractor::new()),
    ]
}

// ──────────────────────────────────────────
// Helpers de parsing HTML compartidos
// ──────────────────────────────────────────

/// Parsea HTML y selecciona nodos de forma segura
#[allow(dead_code)]
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

#[allow(dead_code)]
pub fn inner_text(el: &scraper::ElementRef) -> String {
    el.text()
        .collect::<String>()
        .trim()
        .replace('\n', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[allow(dead_code)]
pub fn attr(el: &scraper::ElementRef, attr_name: &str) -> String {
    el.value()
        .attr(attr_name)
        .unwrap_or("")
        .trim()
        .to_string()
}

#[allow(dead_code)]
pub fn normalize_url(href: &str, base: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else if href.starts_with("//") {
        format!("https:{href}")
    } else if href.starts_with('/') {
        // Extraer scheme + host del base_url
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
