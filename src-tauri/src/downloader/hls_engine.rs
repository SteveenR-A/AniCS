use bytes::Bytes;
use futures::future::join_all;
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

    /// Descarga todos los segmentos con persistencia granular de fragmentos y ventana deslizante concurrente
    pub async fn download(
        &self,
        playlist: &ParsedPlaylist,
        cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
    ) -> AppResult<crate::commands::download_cmd::PauseReason> {
        use crate::commands::download_cmd::PauseReason;

        if let Some(parent) = self.output_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(AppError::Io)?;
        }

        let parts_dir = PathBuf::from(format!("{}.hls_parts", self.output_path.to_string_lossy()));
        tokio::fs::create_dir_all(&parts_dir).await.map_err(AppError::Io)?;

        let total_segments = playlist.segment_urls.len();
        if total_segments == 0 {
            return Err(AppError::Download("La playlist HLS no contiene fragmentos".to_string()));
        }

        // 1. Escanear fragmentos preexistentes en disco para reanudación instantánea sin descargar desde cero
        let mut initial_downloaded_bytes = 0u64;
        let mut initial_completed = 0usize;
        let mut existing_map = std::collections::HashSet::new();

        for seg_idx in 0..total_segments {
            let seg_path = parts_dir.join(format!("seg_{:05}.ts", seg_idx));
            if let Ok(meta) = tokio::fs::metadata(&seg_path).await {
                if meta.len() > 0 {
                    initial_downloaded_bytes += meta.len();
                    initial_completed += 1;
                    existing_map.insert(seg_idx);
                }
            }
        }

        let downloaded_bytes = Arc::new(Mutex::new(initial_downloaded_bytes));
        let completed_segments = Arc::new(Mutex::new(initial_completed));

        let start_time = Instant::now();
        let last_emit = Arc::new(Mutex::new(Instant::now()));

        // Emitir progreso inicial si ya teníamos segmentos guardados de intentos anteriores
        if initial_completed > 0 {
            let initial_progress = (initial_completed as f32 / total_segments as f32) * 100.0;
            let estimated_total = Some((initial_downloaded_bytes / initial_completed as u64) * total_segments as u64);
            let _ = self.progress_tx.send(DownloadProgress {
                id: self.download_id.clone(),
                progress: initial_progress,
                speed_kbps: 0.0,
                downloaded_bytes: initial_downloaded_bytes,
                total_bytes: estimated_total,
                status: DownloadStatus::Downloading,
                error: None,
            });
        }

        let referer = self.referer.clone();
        let segments = playlist.segment_urls.clone();

        // 2. Descargar fragmentos faltantes
        for chunk_start in (0..total_segments).step_by(WINDOW_SIZE) {
            // Comprobar señal de cancelación antes de iniciar cada lote
            if let Ok(Some(())) = cancel_rx.try_recv().map(Some) {
                let cur_bytes = *downloaded_bytes.lock().await;
                let cur_comp = *completed_segments.lock().await;
                let cur_prog = (cur_comp as f32 / total_segments as f32) * 100.0;
                let _ = self.progress_tx.send(DownloadProgress {
                    id: self.download_id.clone(),
                    progress: cur_prog,
                    speed_kbps: 0.0,
                    downloaded_bytes: cur_bytes,
                    total_bytes: None,
                    status: DownloadStatus::Paused,
                    error: None,
                });
                return Ok(PauseReason::UserPaused);
            }

            let chunk_end = (chunk_start + WINDOW_SIZE).min(total_segments);
            let mut tasks = vec![];

            for (offset, seg_url) in segments[chunk_start..chunk_end].iter().enumerate() {
                let seg_idx = chunk_start + offset;
                if existing_map.contains(&seg_idx) {
                    continue;
                }

                let url = seg_url.clone();
                let ref_url = referer.clone();
                let seg_path = parts_dir.join(format!("seg_{:05}.ts", seg_idx));
                let dl_bytes = downloaded_bytes.clone();
                let comp_segs = completed_segments.clone();
                let tx = self.progress_tx.clone();
                let dl_id = self.download_id.clone();
                let last_e = last_emit.clone();

                tasks.push(tokio::spawn(async move {
                    let mut attempts = 0;
                    loop {
                        attempts += 1;
                        match download_segment(&url, ref_url.as_deref()).await {
                            Ok(bytes) => {
                                let byte_len = bytes.len() as u64;
                                // Guardar fragmento individual en disco inmediatamente
                                tokio::fs::write(&seg_path, &bytes).await.map_err(AppError::Io)?;

                                {
                                    let mut db = dl_bytes.lock().await;
                                    *db += byte_len;
                                }
                                {
                                    let mut cs = comp_segs.lock().await;
                                    *cs += 1;
                                    let completed = *cs;
                                    let progress = (completed as f32 / total_segments as f32) * 100.0;

                                    let mut le = last_e.lock().await;
                                    if le.elapsed().as_millis() >= 300 {
                                        let elapsed_secs = start_time.elapsed().as_secs_f64();
                                        let current_bytes = *dl_bytes.lock().await;
                                        let speed = if elapsed_secs > 0.0 {
                                            (current_bytes as f64 / 1024.0) / elapsed_secs
                                        } else {
                                            0.0
                                        };

                                        let estimated_total = if completed > 0 {
                                            Some((current_bytes / completed as u64) * total_segments as u64)
                                        } else {
                                            None
                                        };

                                        let _ = tx.send(DownloadProgress {
                                            id: dl_id.clone(),
                                            progress,
                                            speed_kbps: speed,
                                            downloaded_bytes: current_bytes,
                                            total_bytes: estimated_total,
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

            if !tasks.is_empty() {
                let results = join_all(tasks).await;
                for res in results {
                    res.map_err(|e| AppError::Download(e.to_string()))??;
                }
            }
        }

        // 3. Ensamblar todos los fragmentos en orden secuencial en el archivo .part final
        let part_path = PathBuf::from(format!("{}.part", self.output_path.to_string_lossy()));
        let mut final_file = File::create(&part_path).await.map_err(AppError::Io)?;

        for seg_idx in 0..total_segments {
            let seg_path = parts_dir.join(format!("seg_{:05}.ts", seg_idx));
            let seg_bytes = tokio::fs::read(&seg_path).await.map_err(AppError::Io)?;
            final_file.write_all(&seg_bytes).await.map_err(AppError::Io)?;
        }

        final_file.flush().await.map_err(AppError::Io)?;
        drop(final_file);

        let final_bytes = *downloaded_bytes.lock().await;
        if final_bytes < 10240 {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(AppError::Download(
                "La descarga finalizó sin datos suficientes o el archivo está incompleto".to_string(),
            ));
        }

        // Renombrar .part a .mp4
        if let Err(_) = tokio::fs::rename(&part_path, &self.output_path).await {
            tokio::fs::copy(&part_path, &self.output_path).await.map_err(AppError::Io)?;
            let _ = tokio::fs::remove_file(&part_path).await;
        }

        // Limpiar la carpeta temporal de fragmentos solo al completarse el 100%
        let _ = tokio::fs::remove_dir_all(&parts_dir).await;

        Ok(PauseReason::Completed)
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

    let fetch_fut = async {
        let resp = req.send().await.map_err(AppError::Network)?;
        if !resp.status().is_success() {
            return Err(AppError::Download(format!("Segment error: {}", resp.status())));
        }
        resp.bytes().await.map_err(AppError::Network)
    };

    match tokio::time::timeout(std::time::Duration::from_secs(12), fetch_fut).await {
        Ok(res) => res,
        Err(_) => Err(AppError::Download(
            "Timeout al descargar segmento de video (el servidor dejó de responder)".to_string(),
        )),
    }
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
