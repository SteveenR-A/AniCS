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

    #[error("{0}")]
    Generic(String),
}

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}

// Alias de resultado para comodidad
pub type AppResult<T> = Result<T, AppError>;
