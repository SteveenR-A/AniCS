use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
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

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

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

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}

impl From<anics_core::error::CoreError> for AppError {
    fn from(e: anics_core::error::CoreError) -> Self {
        match e {
            anics_core::error::CoreError::Network(err) => AppError::Network(err),
            anics_core::error::CoreError::Parse(msg) => AppError::Parse(msg),
            anics_core::error::CoreError::Scraper(msg) => AppError::Scraper(msg),
            anics_core::error::CoreError::Resolver(msg) => AppError::Resolver(msg),
            anics_core::error::CoreError::Download(msg) => AppError::Download(msg),
            anics_core::error::CoreError::NotFound(msg) => AppError::NotFound(msg),
            anics_core::error::CoreError::Cancelled => AppError::Cancelled,
            anics_core::error::CoreError::Security(msg) => AppError::Security(msg),
            anics_core::error::CoreError::RateLimit(msg) => AppError::RateLimit(msg),
            anics_core::error::CoreError::Timeout(msg) => AppError::Timeout(msg),
            anics_core::error::CoreError::Generic(msg) => AppError::Generic(msg),
        }
    }
}

// Alias de resultado para comodidad
pub type AppResult<T> = Result<T, AppError>;
