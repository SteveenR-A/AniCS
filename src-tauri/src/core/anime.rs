use serde::{Deserialize, Serialize};

// ──────────────────────────────────────────
// Modelos de Dominio
// ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnimeResult {
    pub title: String,
    pub url: String,
    pub thumbnail_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub episode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub anime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genres: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f32>,
    /// ID del extractor que generó este resultado
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AnimeDetails {
    pub title: String,
    pub url: String,
    pub thumbnail_url: String,
    pub synopsis: String,
    pub genres: Vec<String>,
    pub status: Option<String>,
    pub anime_type: Option<String>,
    pub year: Option<String>,
    pub rating: Option<f32>,
    pub episodes: Vec<Episode>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub number: u32,
    pub title: Option<String>,
    pub url: String,
    pub thumbnail_url: Option<String>,
    pub watched: bool,
    pub watch_progress: Option<f64>, // 0.0 - 1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoServer {
    pub name: String,
    pub url: String,
    pub is_direct: bool,
    pub referer: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedMedia {
    pub direct_url: String,
    pub media_type: MediaType,
    pub referer: Option<String>,
    pub user_agent: Option<String>,
    pub qualities: Vec<Quality>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Hls,
    Mp4,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Quality {
    pub label: String,
    pub url: String,
    pub bandwidth: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilters {
    pub query: Option<String>,
    pub genre: Option<String>,
    pub status: Option<String>,
    pub anime_type: Option<String>,
    pub year: Option<String>,
    pub order_by: Option<String>,
    pub page: u32,
}

impl Default for SearchFilters {
    fn default() -> Self {
        Self {
            query: None,
            genre: None,
            status: None,
            anime_type: None,
            year: None,
            order_by: None,
            page: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultPage {
    pub results: Vec<AnimeResult>,
    pub current_page: u32,
    pub total_pages: Option<u32>,
    pub has_next: bool,
}

// ──────────────────────────────────────────
// Historial y Favoritos
// ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub anime_title: String,
    pub anime_url: String,
    pub thumbnail_url: String,
    pub episode_number: u32,
    pub episode_url: String,
    pub watch_progress: f64,
    pub watched_at: String,
    pub source: String,
}

// ──────────────────────────────────────────
// Descargas
// ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct DownloadTask {
    pub id: String,
    pub anime_title: String,
    pub episode_number: u32,
    pub stream_url: String,
    pub referer: Option<String>,
    pub output_path: String,
    pub status: DownloadStatus,
    pub progress: f32,
    pub speed_kbps: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub id: String,
    pub progress: f32,
    pub speed_kbps: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub status: DownloadStatus,
    pub error: Option<String>,
}
