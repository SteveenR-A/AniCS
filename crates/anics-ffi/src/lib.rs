use parking_lot::RwLock;

use anics_core::config::CoreConfig;
use anics_core::models as m;
use anics_core::scrapers::{create_extractor_with_config, AnimeExtractor};
use anics_core::unpacker::JsUnpacker;

uniffi::setup_scaffolding!();

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum NativeFfiError {
    #[error("Network error: {msg}")]
    Network { msg: String },
    #[error("Timeout error: {msg}")]
    Timeout { msg: String },
    #[error("Parse error: {msg}")]
    Parse { msg: String },
    #[error("Source not found: {source_id}")]
    SourceNotFound { source_id: String },
    #[error("Server unavailable: {msg}")]
    ServerUnavailable { msg: String },
    #[error("Security violation: {msg}")]
    Security { msg: String },
    #[error("Operation cancelled")]
    Cancelled,
    #[error("Error: {msg}")]
    Generic { msg: String },
}

impl From<anics_core::error::CoreError> for NativeFfiError {
    fn from(e: anics_core::error::CoreError) -> Self {
        match e {
            anics_core::error::CoreError::Network(err) => {
                if err.is_timeout() {
                    NativeFfiError::Timeout {
                        msg: err.to_string(),
                    }
                } else {
                    NativeFfiError::Network {
                        msg: err.to_string(),
                    }
                }
            }
            anics_core::error::CoreError::Timeout(msg) => NativeFfiError::Timeout { msg },
            anics_core::error::CoreError::Parse(msg) => NativeFfiError::Parse { msg },
            anics_core::error::CoreError::Scraper(msg) => NativeFfiError::Parse { msg },
            anics_core::error::CoreError::NotFound(msg) => {
                NativeFfiError::SourceNotFound { source_id: msg }
            }
            anics_core::error::CoreError::Resolver(msg) => {
                NativeFfiError::ServerUnavailable { msg }
            }
            anics_core::error::CoreError::Security(msg) => NativeFfiError::Security { msg },
            anics_core::error::CoreError::Cancelled => NativeFfiError::Cancelled,
            anics_core::error::CoreError::RateLimit(msg) => NativeFfiError::Network { msg: msg },
            anics_core::error::CoreError::Download(msg) => NativeFfiError::Network { msg: msg },
            anics_core::error::CoreError::Generic(msg) => NativeFfiError::Generic { msg },
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeAnimeResult {
    pub title: String,
    pub url: String,
    pub thumbnail_url: String,
    pub description: Option<String>,
    pub episode: Option<String>,
    pub anime_type: Option<String>,
    pub status: Option<String>,
    pub genres: Option<Vec<String>>,
    pub year: Option<String>,
    pub rating: Option<f32>,
    pub source: String,
    pub profile_id: Option<String>,
}

impl From<m::AnimeResult> for NativeAnimeResult {
    fn from(r: m::AnimeResult) -> Self {
        Self {
            title: r.title,
            url: r.url,
            thumbnail_url: r.thumbnail_url,
            description: r.description,
            episode: r.episode,
            anime_type: r.anime_type,
            status: r.status,
            genres: r.genres,
            year: r.year,
            rating: r.rating,
            source: r.source,
            profile_id: r.profile_id,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeAnimeDetails {
    pub title: String,
    pub url: String,
    pub thumbnail_url: String,
    pub synopsis: String,
    pub genres: Vec<String>,
    pub status: Option<String>,
    pub anime_type: Option<String>,
    pub studio: Option<String>,
    pub duration: Option<String>,
    pub total_episodes: Option<String>,
    pub season: Option<String>,
    pub broadcast: Option<String>,
    pub languages: Option<String>,
    pub year: Option<String>,
    pub rating: Option<f32>,
    pub episodes: Vec<NativeEpisode>,
    pub source: String,
}

impl From<m::AnimeDetails> for NativeAnimeDetails {
    fn from(d: m::AnimeDetails) -> Self {
        Self {
            title: d.title,
            url: d.url,
            thumbnail_url: d.thumbnail_url,
            synopsis: d.synopsis,
            genres: d.genres,
            status: d.status,
            anime_type: d.anime_type,
            studio: d.studio,
            duration: d.duration,
            total_episodes: d.total_episodes,
            season: d.season,
            broadcast: d.broadcast,
            languages: d.languages,
            year: d.year,
            rating: d.rating,
            episodes: d.episodes.into_iter().map(Into::into).collect(),
            source: d.source,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeEpisode {
    pub number: u32,
    pub title: Option<String>,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub watched: bool,
    pub watch_progress: Option<f64>,
}

impl From<m::Episode> for NativeEpisode {
    fn from(e: m::Episode) -> Self {
        Self {
            number: e.number,
            title: e.title,
            url: e.url,
            thumbnail_url: e.thumbnail_url,
            watched: e.watched,
            watch_progress: e.watch_progress,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeVideoServer {
    pub name: String,
    pub url: String,
    pub is_direct: bool,
    pub referer: Option<String>,
}

impl From<m::VideoServer> for NativeVideoServer {
    fn from(s: m::VideoServer) -> Self {
        Self {
            name: s.name,
            url: s.url,
            is_direct: s.is_direct,
            referer: s.referer,
        }
    }
}

impl From<NativeVideoServer> for m::VideoServer {
    fn from(s: NativeVideoServer) -> Self {
        Self {
            name: s.name,
            url: s.url,
            is_direct: s.is_direct,
            referer: s.referer,
        }
    }
}

#[derive(uniffi::Enum, Clone, Debug, PartialEq, Eq)]
pub enum NativeMediaType {
    Hls,
    Mp4,
    Unknown,
}

impl From<m::MediaType> for NativeMediaType {
    fn from(t: m::MediaType) -> Self {
        match t {
            m::MediaType::Hls => NativeMediaType::Hls,
            m::MediaType::Mp4 => NativeMediaType::Mp4,
            m::MediaType::Unknown => NativeMediaType::Unknown,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeQuality {
    pub label: String,
    pub url: String,
    pub bandwidth: Option<u64>,
}

impl From<m::Quality> for NativeQuality {
    fn from(q: m::Quality) -> Self {
        Self {
            label: q.label,
            url: q.url,
            bandwidth: q.bandwidth,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeResolvedMedia {
    pub direct_url: String,
    pub media_type: NativeMediaType,
    pub referer: Option<String>,
    pub user_agent: Option<String>,
    pub qualities: Vec<NativeQuality>,
}

impl From<m::ResolvedMedia> for NativeResolvedMedia {
    fn from(r: m::ResolvedMedia) -> Self {
        Self {
            direct_url: r.direct_url,
            media_type: r.media_type.into(),
            referer: r.referer,
            user_agent: r.user_agent,
            qualities: r.qualities.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeGenreItem {
    pub name: String,
    pub slug: String,
}

impl From<m::GenreItem> for NativeGenreItem {
    fn from(g: m::GenreItem) -> Self {
        Self {
            name: g.name,
            slug: g.slug,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeScheduleDay {
    pub day: String,
    pub animes: Vec<NativeAnimeResult>,
}

impl From<m::ScheduleDay> for NativeScheduleDay {
    fn from(s: m::ScheduleDay) -> Self {
        Self {
            day: s.day,
            animes: s.animes.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeSearchFilters {
    pub query: Option<String>,
    pub genre: Option<String>,
    pub status: Option<String>,
    pub anime_type: Option<String>,
    pub year: Option<String>,
    pub order_by: Option<String>,
    pub page: u32,
}

impl From<NativeSearchFilters> for m::SearchFilters {
    fn from(f: NativeSearchFilters) -> Self {
        Self {
            query: f.query,
            genre: f.genre,
            status: f.status,
            anime_type: f.anime_type,
            year: f.year,
            order_by: f.order_by,
            page: f.page,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeSearchResultPage {
    pub results: Vec<NativeAnimeResult>,
    pub current_page: u32,
    pub total_pages: Option<u32>,
    pub has_next: bool,
}

impl From<m::SearchResultPage> for NativeSearchResultPage {
    fn from(p: m::SearchResultPage) -> Self {
        Self {
            results: p.results.into_iter().map(Into::into).collect(),
            current_page: p.current_page,
            total_pages: p.total_pages,
            has_next: p.has_next,
        }
    }
}

#[derive(uniffi::Record, Clone, Debug)]
pub struct NativeSourceConfig {
    pub id: String,
    pub name: String,
    pub base_url: String,
}

#[derive(uniffi::Object)]
pub struct NativeCatalogClient {
    config: RwLock<CoreConfig>,
}

// Kotlin supplies an executor, but reqwest, DNS, timers and spawned searches
// still need Tokio. UniFFI enters its shared Tokio runtime when polling these futures.
#[uniffi::export(async_runtime = "tokio")]
impl NativeCatalogClient {
    #[uniffi::constructor]
    pub fn new(settings_json: Option<String>) -> Self {
        let config = if let Some(raw) = settings_json {
            let map: std::collections::HashMap<String, String> =
                serde_json::from_str(&raw).unwrap_or_default();
            CoreConfig::from_settings(&map)
        } else {
            CoreConfig::default()
        };
        Self {
            config: RwLock::new(config),
        }
    }

    pub fn update_settings(&self, settings_json: String) {
        let map: std::collections::HashMap<String, String> =
            serde_json::from_str(&settings_json).unwrap_or_default();
        *self.config.write() = CoreConfig::from_settings(&map);
    }

    pub fn get_available_sources(&self) -> Vec<NativeSourceConfig> {
        let cfg = self.config.read();
        cfg.sources
            .iter()
            .map(|s| NativeSourceConfig {
                id: s.id.clone(),
                name: s.name.clone(),
                base_url: s.base_url.clone(),
            })
            .collect()
    }

    pub async fn get_latest(
        &self,
        source: String,
        page: u32,
    ) -> Result<Vec<NativeAnimeResult>, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let results = ext.get_latest(page).await?;
        Ok(results.into_iter().map(Into::into).collect())
    }

    pub async fn search(
        &self,
        query: String,
        source: Option<String>,
    ) -> Result<Vec<NativeAnimeResult>, NativeFfiError> {
        if let Some(src) = source {
            let ext = self.get_extractor(&src)?;
            let results = ext.search(&query).await?;
            Ok(results.into_iter().map(Into::into).collect())
        } else {
            // Agregar concurrentemente de todas las fuentes
            let cfg = self.config.read().clone();
            let mut handles = Vec::new();
            for src in &cfg.sources {
                if let Some(ext) = create_extractor_with_config(&src.id, &cfg) {
                    let q = query.clone();
                    handles.push(tokio::spawn(async move {
                        ext.search(&q).await.unwrap_or_default()
                    }));
                }
            }
            let mut all_results = Vec::new();
            for h in handles {
                if let Ok(res) = h.await {
                    all_results.extend(res.into_iter().map(Into::into));
                }
            }
            Ok(all_results)
        }
    }

    pub async fn get_top(&self, source: String) -> Result<Vec<NativeAnimeResult>, NativeFfiError> {
        let results = self.get_extractor(&source)?.get_top().await?;
        Ok(results.into_iter().map(Into::into).collect())
    }

    pub async fn advanced_search(
        &self,
        filters: NativeSearchFilters,
        source: String,
    ) -> Result<NativeSearchResultPage, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let page = ext.advanced_search(&filters.into()).await?;
        Ok(page.into())
    }

    pub async fn get_details(
        &self,
        url: String,
        source: String,
    ) -> Result<NativeAnimeDetails, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let details = ext.get_details(&url).await?;
        Ok(details.into())
    }

    pub async fn get_servers(
        &self,
        episode_url: String,
        source: String,
    ) -> Result<Vec<NativeVideoServer>, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let servers = ext.get_servers(&episode_url).await?;
        Ok(servers.into_iter().map(Into::into).collect())
    }

    pub async fn resolve_stream(
        &self,
        server: NativeVideoServer,
        source: String,
    ) -> Result<NativeResolvedMedia, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let media = ext.resolve_stream(&server.into()).await?;
        Ok(media.into())
    }

    pub async fn get_schedule_days(
        &self,
        source: String,
    ) -> Result<Vec<NativeScheduleDay>, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let days = ext.get_schedule_days().await?;
        Ok(days.into_iter().map(Into::into).collect())
    }

    pub async fn get_genres(
        &self,
        source: String,
    ) -> Result<Vec<NativeGenreItem>, NativeFfiError> {
        let ext = self.get_extractor(&source)?;
        let genres = ext.get_genres().await?;
        Ok(genres.into_iter().map(Into::into).collect())
    }

    pub fn unpack_js(&self, script: String) -> Option<String> {
        JsUnpacker::unpack(&script)
    }

    pub fn extract_stream_url(&self, html: String) -> Option<String> {
        JsUnpacker::extract_stream_url(&html)
    }
}

impl NativeCatalogClient {
    fn get_extractor(&self, source: &str) -> Result<Box<dyn AnimeExtractor>, NativeFfiError> {
        let cfg = self.config.read();
        create_extractor_with_config(source, &cfg).ok_or_else(|| NativeFfiError::SourceNotFound {
            source_id: source.to_string(),
        })
    }
}
