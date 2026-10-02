use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Exportable catalog failures, independent of SQLite/Tauri error types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CatalogErrorCode {
    Network,
    Timeout,
    Parse,
    SourceNotFound,
    ServerUnavailable,
    Cancelled,
    Security,
    RateLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Error)]
#[error("{message}")]
#[serde(rename_all = "camelCase")]
pub struct CatalogError {
    pub code: CatalogErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
}

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Scraper error: {0}")]
    Scraper(String),

    #[error("Resolver error: {0}")]
    Resolver(String),

    #[error("Download error: {0}")]
    Download(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Cancelled")]
    Cancelled,

    #[error("Security error: {0}")]
    Security(String),

    #[error("Rate limit exceeded: {0}")]
    RateLimit(String),

    #[error("Timeout: {0}")]
    Timeout(String),

    #[error("{0}")]
    Generic(String),
}

impl From<CoreError> for CatalogError {
    fn from(e: CoreError) -> Self {
        let (code, msg) = match &e {
            CoreError::Network(m) => {
                if m.is_timeout() {
                    (CatalogErrorCode::Timeout, m.to_string())
                } else {
                    (CatalogErrorCode::Network, m.to_string())
                }
            }
            CoreError::Timeout(m) => (CatalogErrorCode::Timeout, m.clone()),
            CoreError::Parse(m) => (CatalogErrorCode::Parse, m.clone()),
            CoreError::Scraper(m) => (CatalogErrorCode::Parse, m.clone()),
            CoreError::Resolver(m) => (CatalogErrorCode::ServerUnavailable, m.clone()),
            CoreError::NotFound(m) => (CatalogErrorCode::SourceNotFound, m.clone()),
            CoreError::Cancelled => (CatalogErrorCode::Cancelled, "Cancelled".to_string()),
            CoreError::Security(m) => (CatalogErrorCode::Security, m.clone()),
            CoreError::RateLimit(m) => (CatalogErrorCode::RateLimit, m.clone()),
            CoreError::Download(m) => (CatalogErrorCode::Network, m.clone()),
            CoreError::Generic(m) => (CatalogErrorCode::Network, m.clone()),
        };
        CatalogError {
            code,
            message: msg,
            source_id: None,
        }
    }
}

pub type AppError = CoreError;
pub type AppResult<T> = Result<T, CoreError>;
pub type CoreResult<T> = Result<T, CoreError>;
