use bytes::Bytes;
use futures::future::join_all;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex};
use reqwest::header;

use crate::core::{AppError, AppResult, DownloadProgress, DownloadStatus};
use crate::scrapers::HTTP_CLIENT;

const WINDOW_SIZE: usize = 8; // Fragmentos HLS concurrentes en vuelo

/// Resultado del análisis de un manifiesto HLS
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ParsedPlaylist {
    pub segment_urls: Vec<String>,
    pub total_duration_secs: f64,
}

/// Motor de descarga HLS con ventana deslizante.
/// Descarga segmentos .ts en paralelo y los escribe en orden secuencial.
pub struct HlsEngine {
    pub download_id: String,
    pub stream_url: String,
    pub referer: Option<String>,
    pub output_path: PathBuf,
    pub progress_tx: mpsc::UnboundedSender<DownloadProgress>,
}

impl HlsEngine {
    pub fn new(
        download_id: impl Into<String>,
        stream_url: impl Into<String>,
        referer: Option<String>,
        output_path: PathBuf,
        progress_tx: mpsc::UnboundedSender<DownloadProgress>,
    ) -> Self {
        let s_url = stream_url.into();
        let auto_referer = referer.or_else(|| {
            if s_url.contains("playmudos") || s_url.contains("jkanime") {
                Some("https://jkanime.net/".to_string())
            } else if s_url.contains("mdplayer") || s_url.contains("mundodonghua") {
                Some("https://www.mundodonghua.com/".to_string())
            } else {
                None
            }
        });

        Self {
            download_id: download_id.into(),
            stream_url: s_url,
            referer: auto_referer,
            output_path,
            progress_tx,
        }
    }

    /// Analiza el manifiesto HLS y obtiene la mejor playlist de calidad
    pub async fn parse_playlist(&self) -> AppResult<ParsedPlaylist> {
        let content = self.fetch_url(&self.stream_url).await?;

        // Si es un master manifest (contiene #EXT-X-STREAM-INF), seleccionar la mejor calidad
        if content.contains("#EXT-X-STREAM-INF") {
            return self.parse_master_and_select_best(&content).await;
        }

        // Es directamente un media playlist
        self.parse_media_playlist(&content, &self.stream_url).await
    }

    async fn parse_master_and_select_best(&self, master: &str) -> AppResult<ParsedPlaylist> {
        let mut best_bandwidth = 0u64;
        let mut best_url = String::new();

        let mut lines = master.lines().peekable();
        while let Some(line) = lines.next() {
            let trimmed = line.trim();
            if trimmed.starts_with("#EXT-X-STREAM-INF") {
                let bw: u64 = if let Some(bw_str) = trimmed.split("BANDWIDTH=").nth(1) {
                    bw_str.split(',').next().unwrap_or("0").parse().unwrap_or(0)
                } else {
                    0
                };

                // Encontrar la siguiente línea que no sea un comentario/etiqueta
                while let Some(next_line) = lines.next() {
                    let next_trimmed = next_line.trim();
                    if !next_trimmed.starts_with('#') && !next_trimmed.is_empty() {
                        if bw >= best_bandwidth || best_url.is_empty() {
                            best_bandwidth = bw;
                            best_url = resolve_relative_url(next_trimmed, &self.stream_url);
                        }
                        break;
                    }
                }
            }
        }

        if best_url.is_empty() {
            return Err(AppError::Download("No stream variants found in master playlist".to_string()));
        }

        let media_html = self.fetch_url(&best_url).await?;
        self.parse_media_playlist(&media_html, &best_url).await
    }

    async fn parse_media_playlist(&self, content: &str, base_url: &str) -> AppResult<ParsedPlaylist> {
        let mut segments = vec![];
        let mut total_duration = 0.0f64;

        let mut lines = content.lines().peekable();
        while let Some(line) = lines.next() {
            let trimmed = line.trim();
            if trimmed.starts_with("#EXTINF:") {
                if let Ok(dur) = trimmed[8..].split(',').next().unwrap_or("0").trim().parse::<f64>() {
                    total_duration += dur;
                }
                while let Some(seg_line) = lines.next() {
                    let seg_trimmed = seg_line.trim();
                    if !seg_trimmed.starts_with('#') && !seg_trimmed.is_empty() {
                        segments.push(resolve_relative_url(seg_trimmed, base_url));
                        break;
                    }
                }
            }
        }

        if segments.is_empty() {
            return Err(AppError::Download("No segments found in HLS playlist".to_string()));
        }

        Ok(ParsedPlaylist {
            segment_urls: segments,
            total_duration_secs: total_duration,
        })
    }

    /// Descarga todos los segmentos con ventana deslizante concurrente
    pub async fn download(&self, playlist: &ParsedPlaylist) -> AppResult<PathBuf> {
        if let Some(parent) = self.output_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(AppError::Io)?;
        }

        let mut file = File::create(&self.output_path).await.map_err(AppError::Io)?;
        let total_segments = playlist.segment_urls.len();
        let downloaded_bytes = Arc::new(Mutex::new(0u64));
        let completed_segments = Arc::new(Mutex::new(0usize));
        let buffer: Arc<Mutex<BTreeMap<usize, Bytes>>> = Arc::new(Mutex::new(BTreeMap::new()));
        let mut next_write_index = 0usize;

        let start_time = Instant::now();
        let last_emit = Arc::new(Mutex::new(Instant::now()));

        let referer = self.referer.clone();
        let segments = playlist.segment_urls.clone();

        for chunk_start in (0..total_segments).step_by(WINDOW_SIZE) {
            let chunk_end = (chunk_start + WINDOW_SIZE).min(total_segments);
            let mut tasks = vec![];

            for (offset, seg_url) in segments[chunk_start..chunk_end].iter().enumerate() {
                let seg_idx = chunk_start + offset;
                let url = seg_url.clone();
                let ref_url = referer.clone();
                let buf = buffer.clone();
                let dl_bytes = downloaded_bytes.clone();
                let comp_segs = completed_segments.clone();
                let tx = self.progress_tx.clone();
                let dl_id = self.download_id.clone();
                let last_e = last_emit.clone();

                tasks.push(tokio::spawn(async move {
                    // Reintentos automáticos
                    let mut attempts = 0;
                    loop {
                        attempts += 1;
                        match download_segment(&url, ref_url.as_deref()).await {
                            Ok(bytes) => {
                                let byte_len = bytes.len() as u64;
                                {
                                    let mut b = buf.lock().await;
                                    b.insert(seg_idx, bytes);
                                }
                                {
                                    let mut db = dl_bytes.lock().await;
                                    *db += byte_len;
                                }
                                {
                                    let mut cs = comp_segs.lock().await;
                                    *cs += 1;
                                    let progress = (*cs as f32 / total_segments as f32) * 100.0;

                                    let mut le = last_e.lock().await;
                                    if le.elapsed().as_millis() >= 300 {
                                        let elapsed_secs = start_time.elapsed().as_secs_f64();
                                        let speed = if elapsed_secs > 0.0 {
                                            let current_bytes = *dl_bytes.lock().await;
                                            (current_bytes as f64 / 1024.0) / elapsed_secs
                                        } else {
                                            0.0
                                        };

                                        let _ = tx.send(DownloadProgress {
                                            id: dl_id.clone(),
                                            progress,
                                            speed_kbps: speed,
                                            downloaded_bytes: *dl_bytes.lock().await,
                                            total_bytes: None,
                                            status: DownloadStatus::Downloading,
                                            error: None,
                                        });
                                        *le = Instant::now();
                                    }
                                }
                                break;
                            }
                            Err(e) => {
                                if attempts >= 4 {
                                    return Err(e);
                                }
                                tokio::time::sleep(tokio::time::Duration::from_millis(500 * attempts)).await;
                            }
                        }
                    }
                    Ok::<(), AppError>(())
                }));
            }

            // Esperar que termine el lote actual
            let results = join_all(tasks).await;
            for res in results {
                res.map_err(|e| AppError::Download(e.to_string()))??;
            }

            // Escribir en orden secuencial
            let mut b = buffer.lock().await;
            while let Some(bytes) = b.remove(&next_write_index) {
                file.write_all(&bytes).await.map_err(AppError::Io)?;
                next_write_index += 1;
            }
        }

        file.flush().await.map_err(AppError::Io)?;
        Ok(self.output_path.clone())
    }

    async fn fetch_url(&self, url: &str) -> AppResult<String> {
        let mut req = HTTP_CLIENT.get(url);
        if let Some(ref ref_url) = self.referer {
            req = req.header(header::REFERER, ref_url.as_str());
        }
        req.send().await
            .map_err(AppError::Network)?
            .text().await
            .map_err(AppError::Network)
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async fn download_segment(url: &str, referer: Option<&str>) -> AppResult<Bytes> {
    let mut req = HTTP_CLIENT.get(url);
    if let Some(ref_url) = referer {
        req = req.header(header::REFERER, ref_url);
    }

    let resp = req.send().await.map_err(AppError::Network)?;
    if !resp.status().is_success() {
        return Err(AppError::Download(format!("Segment error: {}", resp.status())));
    }

    resp.bytes().await.map_err(AppError::Network)
}

fn resolve_relative_url(url: &str, base: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    if url.starts_with("//") {
        return format!("https:{url}");
    }
    if url.starts_with('/') {
        if let Some(origin_end) = base[8..].find('/') {
            return format!("{}{url}", &base[..8 + origin_end]);
        }
    }
    if let Some(last_slash) = base.rfind('/') {
        format!("{}/{url}", &base[..last_slash])
    } else {
        url.to_string()
    }
}
