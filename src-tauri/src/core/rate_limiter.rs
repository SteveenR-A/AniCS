use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use reqwest::header::HeaderMap;

use crate::core::{AppError, AppResult};

/// Token Bucket para regular el tráfico saliente hacia la API de GitHub
pub struct GitHubRateLimiter {
    capacity: f64,
    tokens: Mutex<f64>,
    fill_rate_per_sec: f64,
    last_update: Mutex<Instant>,
    forced_wait_until: Mutex<Option<Instant>>,
}

impl GitHubRateLimiter {
    /// Crea un nuevo limitador con capacidad y tasa de recarga por segundo
    pub fn new(capacity: u32, per_minute: u32) -> Self {
        let cap = capacity as f64;
        let rate = per_minute as f64 / 60.0;
        Self {
            capacity: cap,
            tokens: Mutex::new(cap),
            fill_rate_per_sec: rate,
            last_update: Mutex::new(Instant::now()),
            forced_wait_until: Mutex::new(None),
        }
    }

    /// Intenta adquirir un permiso de petición. Si está agotado o en periodo de enfriamiento,
    /// espera de forma asíncrona hasta un máximo razonable o retorna error.
    pub async fn acquire(&self) -> AppResult<()> {
        // 1. Comprobar si hay un tiempo forzado de espera por cabecera x-ratelimit-reset
        let wait_dur_opt = {
            let wait_guard = self.forced_wait_until.lock();
            if let Some(until) = *wait_guard {
                if Instant::now() < until {
                    let wait_dur = until.duration_since(Instant::now());
                    if wait_dur > Duration::from_secs(45) {
                        return Err(AppError::RateLimit(format!(
                            "Límite de la API de GitHub alcanzado. Reintente en {} segundos.",
                            wait_dur.as_secs()
                        )));
                    }
                    Some(wait_dur)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(wait_dur) = wait_dur_opt {
            tokio::time::sleep(wait_dur).await;
        }

        // 2. Comprobar tokens disponibles con refill dinámico
        loop {
            {
                let mut tokens = self.tokens.lock();
                let mut last = self.last_update.lock();
                let now = Instant::now();
                let elapsed = now.duration_since(*last).as_secs_f64();
                *last = now;

                *tokens = (*tokens + elapsed * self.fill_rate_per_sec).min(self.capacity);

                if *tokens >= 1.0 {
                    *tokens -= 1.0;
                    return Ok(());
                }
            }

            // Si no hay suficientes tokens, esperar el intervalo necesario para un token
            let wait_ms = ((1.0 / self.fill_rate_per_sec) * 1000.0) as u64;
            tokio::time::sleep(Duration::from_millis(wait_ms.min(2000))).await;
        }
    }

    /// Actualiza el estado del limitador según las cabeceras devueltas por GitHub
    pub fn update_from_headers(&self, headers: &HeaderMap) {
        if let Some(remaining_val) = headers.get("x-ratelimit-remaining") {
            if let Ok(rem_str) = remaining_val.to_str() {
                if let Ok(rem) = rem_str.parse::<u32>() {
                    if rem == 0 {
                        // Extraer timestamp UNIX de reset
                        if let Some(reset_val) = headers.get("x-ratelimit-reset") {
                            if let Ok(reset_str) = reset_val.to_str() {
                                if let Ok(reset_epoch) = reset_str.parse::<u64>() {
                                    let now_epoch = SystemTime::now()
                                        .duration_since(UNIX_EPOCH)
                                        .map(|d| d.as_secs())
                                        .unwrap_or(0);

                                    if reset_epoch > now_epoch {
                                        let diff_secs = reset_epoch - now_epoch;
                                        // Añadir 2 segundos de margen (jitter)
                                        let wait_dur = Duration::from_secs(diff_secs + 2);
                                        let mut wait_guard = self.forced_wait_until.lock();
                                        *wait_guard = Some(Instant::now() + wait_dur);
                                        log::warn!(
                                            "[GitHubRateLimiter] Cuota de API agotada. Enfriamiento forzado: {}s",
                                            diff_secs + 2
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

pub static GITHUB_RATE_LIMITER: Lazy<Arc<GitHubRateLimiter>> =
    Lazy::new(|| Arc::new(GitHubRateLimiter::new(30, 30)));

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_acquire() {
        let limiter = GitHubRateLimiter::new(2, 60);
        assert!(limiter.acquire().await.is_ok());
        assert!(limiter.acquire().await.is_ok());
    }

    #[test]
    fn test_update_headers_zero_remaining() {
        let limiter = GitHubRateLimiter::new(10, 60);
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        let future_epoch = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 10;
        headers.insert(
            "x-ratelimit-reset",
            future_epoch.to_string().parse().unwrap(),
        );

        limiter.update_from_headers(&headers);
        let guard = limiter.forced_wait_until.lock();
        assert!(guard.is_some());
    }
}
