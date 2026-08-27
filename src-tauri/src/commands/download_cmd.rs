use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;

use crate::core::*;
use crate::downloader::HlsEngine;
use crate::AppState;

type DownloadMap = Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>;

pub struct DownloadManager {
    pub tasks: DownloadMap,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Iniciar una descarga HLS
#[tauri::command]
pub async fn start_download(
    anime_title: String,
    episode_number: u32,
    stream_url: String,
    referer: Option<String>,
    output_dir: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let download_id = Uuid::new_v4().to_string();

    // Determinar directorio de descarga
    let base_dir = if let Some(dir) = output_dir {
        PathBuf::from(dir)
    } else {
        app_handle
            .path()
            .download_dir()
            .map_err(|e| e.to_string())?
            .join("AniCS")
    };

    let safe_title: String = anime_title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect();

    let output_path = base_dir
        .join(&safe_title)
        .join(format!("Ep{:03}.ts", episode_number));

    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<DownloadProgress>();

    let dl_id_clone = download_id.clone();
    let app_handle_clone = app_handle.clone();

    // Escuchar eventos de progreso y emitirlos al frontend
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_handle_clone.emit("download-progress", &progress);
        }
    });

    let engine = HlsEngine::new(
        download_id.clone(),
        stream_url,
        referer,
        output_path,
        progress_tx.clone(),
    );

    let dl_id_for_task = download_id.clone();
    let app_handle_finish = app_handle.clone();

    let handle = tokio::spawn(async move {
        match engine.parse_playlist().await {
            Ok(playlist) => {
                match engine.download(&playlist).await {
                    Ok(path) => {
                        let _ = app_handle_finish.emit("download-completed", serde_json::json!({
                            "id": dl_id_for_task,
                            "path": path.to_string_lossy(),
                        }));
                        let _ = progress_tx.send(DownloadProgress {
                            id: dl_id_for_task,
                            progress: 100.0,
                            speed_kbps: 0.0,
                            downloaded_bytes: 0,
                            total_bytes: None,
                            status: DownloadStatus::Completed,
                            error: None,
                        });
                    }
                    Err(e) => {
                        let _ = progress_tx.send(DownloadProgress {
                            id: dl_id_for_task.clone(),
                            progress: 0.0,
                            speed_kbps: 0.0,
                            downloaded_bytes: 0,
                            total_bytes: None,
                            status: DownloadStatus::Failed,
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
            Err(e) => {
                let _ = progress_tx.send(DownloadProgress {
                    id: dl_id_for_task.clone(),
                    progress: 0.0,
                    speed_kbps: 0.0,
                    downloaded_bytes: 0,
                    total_bytes: None,
                    status: DownloadStatus::Failed,
                    error: Some(format!("Playlist parse error: {e}")),
                });
            }
        }
    });

    // Guardar handle para permitir cancelación
    state.download_manager.tasks.lock().await.insert(dl_id_clone, handle);

    Ok(download_id)
}

/// Cancelar una descarga en curso
#[tauri::command]
pub async fn cancel_download(
    download_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut tasks = state.download_manager.tasks.lock().await;
    if let Some(handle) = tasks.remove(&download_id) {
        handle.abort();
    }
    Ok(())
}
