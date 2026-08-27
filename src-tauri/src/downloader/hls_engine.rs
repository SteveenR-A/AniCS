use bytes::Bytes;
use futures::future::join_all;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;
use tokio::sync::{mpsc, Mutex};

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
        Self {
            download_id: download_id.into(),
            stream_url: stream_url.into(),
            referer,
            output_path,
            progress_tx,
        }
    }

    /// Analiza el manifiesto HLS y obtiene la mejor playlist de calidad
    pub async fn parse_playlist(&self) -> AppResult<ParsedPlaylist> {
        let html = self.fetch_url(&self.stream_url).await?;

        // Si es un master manifest (contiene #EXT-X-STREAM-INF), seleccionar la mejor calidad
        if html.contains("#EXT-X-STREAM-INF") {
            return self.parse_master_and_select_best(&html).await;
        }

        // Es directamente un media playlist
        self.parse_media_playlist(&html, &self.stream_url).await
    }

    async fn parse_master_and_select_best(&self, master: &str) -> AppResult<ParsedPlaylist> {
        let mut best_bandwidth = 0u64;
        let mut best_url = String::new();

        let mut lines = master.lines().peekable();
        while let Some(line) = lines.next() {
            if line.starts_with("#EXT-X-STREAM-INF") {
                // Extraer BANDWIDTH
                if let Some(bw_str) = line.split("BANDWIDTH=").nth(1) {
                    let bw: u64 = bw_str.split(',').next().unwrap_or("0")
                        .parse().unwrap_or(0);
                    if bw >= best_bandwidth {
                        best_bandwidth = bw;
                        if let Some(url_line) = lines.next() {
                            best_url = resolve_relative_url(url_line, &self.stream_url);
                        }
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
            if line.starts_with("#EXTINF:") {
                // Duración del segmento
                if let Ok(dur) = line[8..].split(',').next().unwrap_or("0").trim().parse::<f64>() {
                    total_duration += dur;
                }
                if let Some(seg_url) = lines.next() {
                    if !seg_url.starts_with('#') {
                        segments.push(resolve_relative_url(seg_url.trim(), base_url));
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

    /// Descarga todos los segmentos y los escribe secuencialmente en el archivo de salida.
    pub async fn download(&self, playlist: &ParsedPlaylist) -> AppResult<PathBuf> {
        let output = self.output_path.with_extension("ts");
        let idx_path = output.with_extension("ts.idx");

        // Crear directorio si no existe
        if let Some(parent) = output.parent() {
            tokio::fs::create_dir_all(parent).await
                .map_err(AppError::Io)?;
        }

        // Cargar checkpoint de reanudación
        let start_segment = if output.exists() && idx_path.exists() {
            tokio::fs::read_to_string(&idx_path).await
                .ok()
                .and_then(|s| s.trim().parse::<usize>().ok())
                .unwrap_or(0)
        } else {
            0
        };

        let segments = &playlist.segment_urls;
        let total = segments.len();
        let mut downloaded_bytes = 0u64;

        if start_segment >= total {
            return Ok(output);
        }

        // Abrir archivo para escritura (append si reanudamos)
        let file_mode = if start_segment > 0 {
            OpenOptions::new().append(true).open(&output).await
        } else {
            File::create(&output).await
        };

        let file = Arc::new(Mutex::new(
            file_mode.map_err(AppError::Io)?
        ));

        let start = std::time::Instant::now();
        let mut next_idx = start_segment;

        // Mapa de buffers en memoria: índice -> datos descargados
        let buffer: Arc<Mutex<BTreeMap<usize, Bytes>>> = Arc::new(Mutex::new(BTreeMap::new()));
        let mut write_cursor = start_segment;

        while next_idx < total {
            // Lanzar WINDOW_SIZE descargas en paralelo
            let window_end = (next_idx + WINDOW_SIZE).min(total);
            let futs: Vec<_> = (next_idx..window_end)
                .map(|i| {
                    let url = segments[i].clone();
                    let referer = self.referer.clone();
                    async move {
                        let data = download_segment(&url, referer.as_deref()).await;
                        (i, data)
                    }
                })
                .collect();

            let results = join_all(futs).await;

            // Almacenar en buffer
            {
                let mut buf = buffer.lock().await;
                for (i, data) in results {
                    if let Ok(bytes) = data {
                        buf.insert(i, bytes);
                    }
                }
            }

            // Escribir todos los segmentos consecutivos desde write_cursor
            {
                let mut buf = buffer.lock().await;
                let mut f = file.lock().await;
                while let Some(data) = buf.remove(&write_cursor) {
                    downloaded_bytes += data.len() as u64;
                    f.write_all(&data).await.map_err(AppError::Io)?;
                    write_cursor += 1;
                }
            }

            // Guardar checkpoint
            tokio::fs::write(&idx_path, write_cursor.to_string()).await.ok();

            // Calcular y emitir progreso
            let progress = write_cursor as f32 / total as f32 * 100.0;
            let elapsed = start.elapsed().as_secs_f64();
            let speed_kbps = if elapsed > 0.0 {
                (downloaded_bytes as f64 / 1024.0) / elapsed
            } else {
                0.0
            };

            let _ = self.progress_tx.send(DownloadProgress {
                id: self.download_id.clone(),
                progress,
                speed_kbps,
                downloaded_bytes,
                total_bytes: None,
                status: DownloadStatus::Downloading,
                error: None,
            });

            next_idx = window_end;
        }

        // Limpiar checkpoint al completar
        tokio::fs::remove_file(&idx_path).await.ok();

        Ok(output)
    }

    async fn fetch_url(&self, url: &str) -> AppResult<String> {
        use reqwest::header;

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
    use reqwest::header;

    let mut req = HTTP_CLIENT.get(url);
    if let Some(ref_url) = referer {
        req = req.header(header::REFERER, ref_url);
    }

    req.send().await
        .map_err(AppError::Network)?
        .bytes().await
        .map_err(AppError::Network)
}

fn resolve_relative_url(url: &str, base: &str) -> String {
    if url.starts_with("http://") || url.starts_with("https://") {
        return url.to_string();
    }
    if url.starts_with("//") {
        return format!("https:{url}");
    }
    if url.starts_with('/') {
        // Extraer origen del base
        if let Some(origin_end) = base[8..].find('/') {
            return format!("{}{url}", &base[..8 + origin_end]);
        }
    }
    // URL relativa a la ruta base
    if let Some(last_slash) = base.rfind('/') {
        format!("{}/{url}", &base[..last_slash])
    } else {
        url.to_string()
    }
}
