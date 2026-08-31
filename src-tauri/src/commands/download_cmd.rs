use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, oneshot, Mutex};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::core::*;
use crate::downloader::HlsEngine;
use crate::storage;
use crate::AppState;

pub struct DownloadHandle {
    pub task: tokio::task::JoinHandle<()>,
    pub cancel_tx: oneshot::Sender<()>,
}

type DownloadMap = Arc<Mutex<HashMap<String, DownloadHandle>>>;

pub struct DownloadManager {
    pub tasks: DownloadMap,
    pub semaphore: Arc<tokio::sync::Semaphore>,
}

impl DownloadManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
            semaphore: Arc::new(tokio::sync::Semaphore::new(2)), // Máximo 2 descargas concurrentes activas
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEpisodeItem {
    pub file_path: String,
    pub file_name: String,
    pub episode_number: u32,
    pub file_size: u64,
    pub file_size_formatted: String,
    pub modified_at: String,
    pub watch_progress: f64,
    pub watch_status: String, // "unseen" | "in_progress" | "completed"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAnimeFolder {
    pub anime_title: String,
    pub folder_path: String,
    pub total_episodes: usize,
    pub total_size: u64,
    pub total_size_formatted: String,
    pub cover_image: Option<String>,
    pub episodes: Vec<LocalEpisodeItem>,
}

pub enum PauseReason {
    Completed,
    UserPaused,
}

pub fn sanitize_anime_folder_name(name: &str) -> String {
    let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let cleaned: String = name
        .chars()
        .map(|c| if invalid_chars.contains(&c) { ' ' } else { c })
        .collect();
    let result = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if result.is_empty() {
        "Anime".to_string()
    } else {
        result
    }
}

/// Obtiene los bytes reales ya descargados en disco (.part o fragmentos .hls_parts)
pub async fn get_existing_download_progress(output_path: &Path) -> u64 {
    // 1. Comprobar si existe archivo parcial .part (MP4 directo o ensamblado)
    let part_path = PathBuf::from(format!("{}.part", output_path.to_string_lossy()));
    if let Ok(meta) = tokio::fs::metadata(&part_path).await {
        if meta.len() > 0 {
            return meta.len();
        }
    }

    // 2. Comprobar si existe carpeta de fragmentos HLS
    let hls_parts_dir = PathBuf::from(format!("{}.hls_parts", output_path.to_string_lossy()));
    if hls_parts_dir.is_dir() {
        let mut total = 0u64;
        if let Ok(mut entries) = tokio::fs::read_dir(&hls_parts_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(meta) = entry.metadata().await {
                    if meta.is_file() {
                        total += meta.len();
                    }
                }
            }
        }
        if total > 0 {
            return total;
        }
    }

    0
}

fn spawn_download(
    download_id: String,
    task_record: DownloadTask,
    app_handle: AppHandle,
    semaphore: Arc<tokio::sync::Semaphore>,
    mut cancel_rx: oneshot::Receiver<()>,
    tasks_map: DownloadMap,
) -> tokio::task::JoinHandle<()> {
    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<DownloadProgress>();
    let app_handle_clone = app_handle.clone();
    let app_handle_finish = app_handle.clone();
    let dl_id_task = download_id.clone();
    let dl_id_cleanup = download_id.clone();

    // Reenviar eventos de progreso hacia Tauri Event y actualizar DB periódicamente
    tokio::spawn(async move {
        let mut last_db_update = std::time::Instant::now();
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_handle_clone.emit("download-progress", &progress);

            if last_db_update.elapsed().as_millis() >= 800
                || progress.status == DownloadStatus::Completed
                || progress.status == DownloadStatus::Failed
                || progress.status == DownloadStatus::Paused
            {
                let status_str = match progress.status {
                    DownloadStatus::Queued => "queued",
                    DownloadStatus::Downloading => "downloading",
                    DownloadStatus::Paused => "paused",
                    DownloadStatus::Completed => "completed",
                    DownloadStatus::Failed => "failed",
                    DownloadStatus::Canceled => "canceled",
                };
                let _ = storage::update_download_progress_db(
                    &progress.id,
                    status_str,
                    progress.progress,
                    progress.downloaded_bytes,
                    progress.total_bytes,
                    progress.error.as_deref(),
                );
                last_db_update = std::time::Instant::now();
            }
        }
    });

    tokio::spawn(async move {
        // 1. Notificar en cola
        let _ = progress_tx.send(DownloadProgress {
            id: dl_id_task.clone(),
            progress: task_record.progress,
            speed_kbps: 0.0,
            downloaded_bytes: task_record.downloaded_bytes,
            total_bytes: task_record.total_bytes,
            status: DownloadStatus::Queued,
            error: None,
        });

        // 2. Esperar turno en el semáforo
        let _permit = tokio::select! {
            _ = &mut cancel_rx => {
                let _ = storage::update_download_progress_db(
                    &dl_id_task, "paused", task_record.progress, task_record.downloaded_bytes, task_record.total_bytes, None
                );
                let _ = app_handle_finish.emit("download-paused", serde_json::json!({ "id": dl_id_task }));
                tasks_map.lock().await.remove(&dl_id_cleanup);
                return;
            }
            permit_res = semaphore.acquire() => {
                match permit_res {
                    Ok(p) => p,
                    Err(_) => {
                        tasks_map.lock().await.remove(&dl_id_cleanup);
                        return;
                    }
                }
            }
        };

        // 3. Notificar inicio de descarga
        let _ = progress_tx.send(DownloadProgress {
            id: dl_id_task.clone(),
            progress: task_record.progress,
            speed_kbps: 0.0,
            downloaded_bytes: task_record.downloaded_bytes,
            total_bytes: task_record.total_bytes,
            status: DownloadStatus::Downloading,
            error: None,
        });

        let output_path = PathBuf::from(&task_record.output_path);
        let stream_url = task_record.stream_url.clone();
        let referer = task_record.referer.clone();

        let is_mp4 = stream_url.contains(".mp4")
            || stream_url.contains("mediafire.com")
            || stream_url.contains("mp4upload")
            || stream_url.contains("streamtape");

        if is_mp4 {
            let is_mediafire_page = stream_url.contains("mediafire.com")
                && !stream_url.starts_with("https://download")
                && !stream_url.starts_with("http://download")
                && !stream_url.ends_with(".mp4")
                && !stream_url.ends_with(".mkv");

            let actual_url = if is_mediafire_page {
                resolve_mediafire_url(&stream_url).await.unwrap_or_else(|| stream_url.clone())
            } else {
                stream_url.clone()
            };

            match download_direct_mp4(
                &dl_id_task,
                &actual_url,
                referer.as_deref(),
                &output_path,
                task_record.downloaded_bytes,
                &progress_tx,
                &mut cancel_rx,
            ).await {
                Ok(PauseReason::UserPaused) => {
                    let _ = app_handle_finish.emit("download-paused", serde_json::json!({ "id": dl_id_task }));
                }
                Ok(PauseReason::Completed) => {
                    let _ = app_handle_finish.emit("download-completed", serde_json::json!({
                        "id": dl_id_task,
                        "path": output_path.to_string_lossy(),
                    }));
                    let _ = progress_tx.send(DownloadProgress {
                        id: dl_id_task.clone(),
                        progress: 100.0,
                        speed_kbps: 0.0,
                        downloaded_bytes: task_record.downloaded_bytes,
                        total_bytes: task_record.total_bytes,
                        status: DownloadStatus::Completed,
                        error: None,
                    });
                }
                Err(e) => {
                    let current_bytes = get_existing_download_progress(&output_path).await;
                    let prog = if current_bytes > 0 && task_record.total_bytes.unwrap_or(0) > 0 {
                        ((current_bytes as f32 / task_record.total_bytes.unwrap() as f32) * 100.0).min(99.0)
                    } else if current_bytes > 0 {
                        task_record.progress.max(1.0)
                    } else {
                        task_record.progress
                    };

                    let _ = progress_tx.send(DownloadProgress {
                        id: dl_id_task.clone(),
                        progress: prog,
                        speed_kbps: 0.0,
                        downloaded_bytes: current_bytes,
                        total_bytes: task_record.total_bytes,
                        status: DownloadStatus::Failed,
                        error: Some(e.to_string()),
                    });
                }
            }
        } else {
            // Descarga HLS
            let engine = HlsEngine::new(
                dl_id_task.clone(),
                stream_url,
                referer,
                output_path.clone(),
                progress_tx.clone(),
            );

            match engine.parse_playlist().await {
                Ok(playlist) => {
                    match engine.download(&playlist, &mut cancel_rx).await {
                        Ok(PauseReason::UserPaused) => {
                            let _ = app_handle_finish.emit("download-paused", serde_json::json!({ "id": dl_id_task }));
                        }
                        Ok(PauseReason::Completed) => {
                            let _ = app_handle_finish.emit("download-completed", serde_json::json!({
                                "id": dl_id_task,
                                "path": output_path.to_string_lossy(),
                            }));
                            let _ = progress_tx.send(DownloadProgress {
                                id: dl_id_task.clone(),
                                progress: 100.0,
                                speed_kbps: 0.0,
                                downloaded_bytes: task_record.downloaded_bytes,
                                total_bytes: task_record.total_bytes,
                                status: DownloadStatus::Completed,
                                error: None,
                            });
                        }
                        Err(e) => {
                            let current_bytes = get_existing_download_progress(&output_path).await;
                            let prog = if current_bytes > 0 && task_record.total_bytes.unwrap_or(0) > 0 {
                                ((current_bytes as f32 / task_record.total_bytes.unwrap() as f32) * 100.0).min(99.0)
                            } else if current_bytes > 0 {
                                task_record.progress.max(1.0)
                            } else {
                                task_record.progress
                            };

                            let _ = progress_tx.send(DownloadProgress {
                                id: dl_id_task.clone(),
                                progress: prog,
                                speed_kbps: 0.0,
                                downloaded_bytes: current_bytes,
                                total_bytes: task_record.total_bytes,
                                status: DownloadStatus::Failed,
                                error: Some(e.to_string()),
                            });
                        }
                    }
                }
                Err(e) => {
                    let current_bytes = get_existing_download_progress(&output_path).await;
                    let _ = progress_tx.send(DownloadProgress {
                        id: dl_id_task.clone(),
                        progress: task_record.progress,
                        speed_kbps: 0.0,
                        downloaded_bytes: current_bytes,
                        total_bytes: task_record.total_bytes,
                        status: DownloadStatus::Failed,
                        error: Some(format!("Error en stream HLS: {e}")),
                    });
                }
            }
        }

        tasks_map.lock().await.remove(&dl_id_cleanup);
    })
}

/// Iniciar una descarga y persistirla en SQLite
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
        if !dir.trim().is_empty() {
            PathBuf::from(dir)
        } else {
            PathBuf::from(get_default_download_dir(app_handle.clone())?)
        }
    } else {
        PathBuf::from(get_default_download_dir(app_handle.clone())?)
    };

    let safe_title = sanitize_anime_folder_name(&anime_title);
    let anime_folder = base_dir.join(&safe_title);
    if let Err(e) = fs::create_dir_all(&anime_folder) {
        log::warn!("No se pudo crear la carpeta {}: {}", anime_folder.display(), e);
    }

    let output_path = anime_folder.join(format!("Ep{:03}.mp4", episode_number));
    let output_path_str = output_path.to_string_lossy().to_string();

    let task_record = DownloadTask {
        id: download_id.clone(),
        anime_title,
        episode_number,
        stream_url,
        referer,
        output_path: output_path_str,
        status: "queued".to_string(),
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: None,
        error: None,
        created_at: Utc::now().to_rfc3339(),
    };

    // Guardar en base de datos SQLite
    storage::save_download_task(&task_record).map_err(|e| e.to_string())?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let tasks_map = state.download_manager.tasks.clone();
    let handle = spawn_download(
        download_id.clone(),
        task_record,
        app_handle,
        state.download_manager.semaphore.clone(),
        cancel_rx,
        tasks_map.clone(),
    );

    tasks_map.lock().await.insert(download_id.clone(), DownloadHandle { task: handle, cancel_tx });
    Ok(download_id)
}

/// Pausar una descarga activa
#[tauri::command]
pub async fn pause_download(
    download_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut tasks = state.download_manager.tasks.lock().await;
    if let Some(handle) = tasks.remove(&download_id) {
        let _ = handle.cancel_tx.send(());
    } else {
        // Si no estaba en el mapa de tareas en memoria, actualizar directamente en SQLite
        let _ = storage::update_download_progress_db(&download_id, "paused", 0.0, 0, None, None);
    }
    Ok(())
}

/// Pausar todas las descargas activas (e.g. al salir del foco de la app)
#[tauri::command]
pub async fn pause_all_downloads(
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut tasks = state.download_manager.tasks.lock().await;
    for (_id, handle) in tasks.drain() {
        let _ = handle.cancel_tx.send(());
    }
    drop(tasks);
    let _ = storage::mark_active_downloads_as_paused_db();
    Ok(())
}

/// Reanudar una descarga pausada o interrumpida
#[tauri::command]
pub async fn resume_download(
    download_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let all = storage::get_all_downloads_db().map_err(|e| e.to_string())?;
    let task_record = all.into_iter()
        .find(|t| t.id == download_id)
        .ok_or_else(|| "Descarga no encontrada".to_string())?;

    // Si ya está activa en memoria, no volver a iniciar
    let mut tasks = state.download_manager.tasks.lock().await;
    if tasks.contains_key(&download_id) {
        return Ok(());
    }

    let mut record = task_record;
    record.status = "queued".to_string();
    record.error = None;
    storage::save_download_task(&record).map_err(|e| e.to_string())?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let tasks_map = state.download_manager.tasks.clone();
    let handle = spawn_download(
        download_id.clone(),
        record,
        app_handle,
        state.download_manager.semaphore.clone(),
        cancel_rx,
        tasks_map.clone(),
    );

    tasks.insert(download_id, DownloadHandle { task: handle, cancel_tx });
    Ok(())
}

/// Reiniciar/Reintentar una descarga fallida (reanudando inteligentemente desde disco si hay fragmentos previos)
#[tauri::command]
pub async fn retry_download(
    download_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let all = storage::get_all_downloads_db().map_err(|e| e.to_string())?;
    let task_record = all.into_iter()
        .find(|t| t.id == download_id)
        .ok_or_else(|| "Descarga no encontrada".to_string())?;

    // No borramos .part ni .hls_parts: comprobamos bytes existentes en disco para reanudar
    let p = Path::new(&task_record.output_path);
    let existing_bytes = get_existing_download_progress(p).await;

    let mut record = task_record;
    if existing_bytes > 0 {
        record.downloaded_bytes = existing_bytes;
        if let Some(tot) = record.total_bytes {
            if tot > 0 {
                record.progress = ((existing_bytes as f32 / tot as f32) * 100.0).min(99.0);
            }
        }
    }
    record.status = "queued".to_string();
    record.error = None;
    storage::save_download_task(&record).map_err(|e| e.to_string())?;

    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    let tasks_map = state.download_manager.tasks.clone();
    let handle = spawn_download(
        download_id.clone(),
        record,
        app_handle,
        state.download_manager.semaphore.clone(),
        cancel_rx,
        tasks_map.clone(),
    );

    state.download_manager.tasks.lock().await.insert(download_id, DownloadHandle { task: handle, cancel_tx });
    Ok(())
}

/// Cancelar una descarga en curso y marcarla como cancelada
#[tauri::command]
pub async fn cancel_download(
    download_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut tasks = state.download_manager.tasks.lock().await;
    if let Some(handle) = tasks.remove(&download_id) {
        let _ = handle.cancel_tx.send(());
    }
    let _ = storage::delete_download_task_db(&download_id);
    Ok(())
}

/// Eliminar el registro de una descarga de SQLite (y opcionalmente sus archivos parciales o finales)
#[tauri::command]
pub async fn delete_download_record(
    download_id: String,
    delete_file: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut tasks = state.download_manager.tasks.lock().await;
    if let Some(handle) = tasks.remove(&download_id) {
        let _ = handle.cancel_tx.send(());
    }
    drop(tasks);

    if delete_file {
        if let Ok(all) = storage::get_all_downloads_db() {
            if let Some(task) = all.iter().find(|t| t.id == download_id) {
                let p = Path::new(&task.output_path);
                if p.exists() {
                    let _ = fs::remove_file(p);
                }
                let part_p = PathBuf::from(format!("{}.part", task.output_path));
                if part_p.exists() {
                    let _ = fs::remove_file(part_p);
                }
                let hls_parts_dir = PathBuf::from(format!("{}.hls_parts", task.output_path));
                if hls_parts_dir.exists() {
                    let _ = fs::remove_dir_all(hls_parts_dir);
                }
            }
        }
    }

    storage::delete_download_task_db(&download_id).map_err(|e| e.to_string())?;
    Ok(())
}

/// Devuelve todas las descargas registradas en SQLite
#[tauri::command]
pub fn get_all_downloads() -> Result<Vec<DownloadTask>, String> {
    storage::get_all_downloads_db().map_err(|e| e.to_string())
}

/// Descarga directa MP4 con soporte de Range Requests y señal de cancelación
async fn download_direct_mp4(
    download_id: &str,
    url: &str,
    referer: Option<&str>,
    output_path: &Path,
    already_downloaded: u64,
    progress_tx: &mpsc::UnboundedSender<DownloadProgress>,
    cancel_rx: &mut oneshot::Receiver<()>,
) -> AppResult<PauseReason> {
    use reqwest::header;
    use tokio::io::AsyncWriteExt;
    use futures::StreamExt;
    use std::time::Instant;

    let mut downloaded = already_downloaded;
    let mut total_bytes: Option<u64> = None;
    let mut consecutive_stalls = 0u32;
    const MAX_STALL_RETRIES: u32 = 3;
    let start_time = Instant::now();
    let mut last_emit = Instant::now();

    'connection_loop: loop {
        let mut req = crate::scrapers::DOWNLOAD_CLIENT.get(url);

        if let Some(r) = referer {
            req = req.header(header::REFERER, r);
        } else if url.contains("jkanime") {
            req = req.header(header::REFERER, "https://jkanime.net/");
        }

        let part_path = PathBuf::from(format!("{}.part", output_path.to_string_lossy()));

        let offset = if downloaded > 0 && part_path.exists() {
            req = req.header(header::RANGE, format!("bytes={}-", downloaded));
            downloaded
        } else {
            0
        };

        let connect_fut = req.send();
        let resp = match tokio::time::timeout(std::time::Duration::from_secs(15), connect_fut).await {
            Ok(Ok(r)) => r,
            Ok(Err(e)) => {
                consecutive_stalls += 1;
                if consecutive_stalls > MAX_STALL_RETRIES {
                    return Err(AppError::Network(e));
                }
                tokio::time::sleep(std::time::Duration::from_millis(1000 * consecutive_stalls as u64)).await;
                continue 'connection_loop;
            }
            Err(_) => {
                consecutive_stalls += 1;
                if consecutive_stalls > MAX_STALL_RETRIES {
                    return Err(AppError::Download("El servidor no responde al conectar (Timeout)".to_string()));
                }
                tokio::time::sleep(std::time::Duration::from_millis(1000 * consecutive_stalls as u64)).await;
                continue 'connection_loop;
            }
        };

        let status = resp.status();
        let supports_range = status.as_u16() == 206;
        if !status.is_success() {
            return Err(AppError::Download(format!("HTTP error {}", status)));
        }

        let content_type = resp.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();
        if content_type.contains("text/html") {
            return Err(AppError::Download(
                "El servidor devolvió HTML en vez del archivo. La URL ha expirado o no es directa.".to_string(),
            ));
        }

        if total_bytes.is_none() {
            if let Some(len) = resp.content_length() {
                total_bytes = Some(if supports_range { len + offset } else { len });
            }
        }

        let mut file = if supports_range && offset > 0 {
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(&part_path)
                .await
                .map_err(AppError::Io)?
        } else {
            downloaded = 0;
            if let Some(parent) = part_path.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            tokio::fs::File::create(&part_path)
                .await
                .map_err(AppError::Io)?
        };

        let mut stream = resp.bytes_stream();

        loop {
            tokio::select! {
                _ = &mut *cancel_rx => {
                    file.flush().await.map_err(AppError::Io)?;
                    let _ = progress_tx.send(DownloadProgress {
                        id: download_id.to_string(),
                        progress: total_bytes.map(|t| (downloaded as f32 / t as f32) * 100.0).unwrap_or(0.0),
                        speed_kbps: 0.0,
                        downloaded_bytes: downloaded,
                        total_bytes,
                        status: DownloadStatus::Paused,
                        error: None,
                    });
                    return Ok(PauseReason::UserPaused);
                }
                chunk_res = tokio::time::timeout(std::time::Duration::from_secs(12), stream.next()) => {
                    match chunk_res {
                        Err(_timeout) => {
                            // No llegaron datos durante 12s
                            let _ = file.flush().await;
                            consecutive_stalls += 1;
                            if consecutive_stalls > MAX_STALL_RETRIES {
                                return Err(AppError::Download(
                                    "El servidor de video se detuvo y no envió más datos (Timeout)".to_string(),
                                ));
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(800 * consecutive_stalls as u64)).await;
                            continue 'connection_loop;
                        }
                        Ok(None) => {
                            // Flujo finalizado con éxito: renombrar .part a .mp4 final
                            file.flush().await.map_err(AppError::Io)?;
                            drop(file);

                            if downloaded < 10240 {
                                let _ = tokio::fs::remove_file(&part_path).await;
                                return Err(AppError::Download(
                                    "La descarga finalizó sin datos suficientes o el archivo está incompleto".to_string(),
                                ));
                            }

                            if let Err(_) = tokio::fs::rename(&part_path, output_path).await {
                                tokio::fs::copy(&part_path, output_path).await.map_err(AppError::Io)?;
                                let _ = tokio::fs::remove_file(&part_path).await;
                            }
                            return Ok(PauseReason::Completed);
                        }
                        Ok(Some(Err(e))) => {
                            let _ = file.flush().await;
                            consecutive_stalls += 1;
                            if consecutive_stalls > MAX_STALL_RETRIES {
                                return Err(AppError::Network(e));
                            }
                            tokio::time::sleep(std::time::Duration::from_millis(800 * consecutive_stalls as u64)).await;
                            continue 'connection_loop;
                        }
                        Ok(Some(Ok(chunk))) => {
                            consecutive_stalls = 0;
                            file.write_all(&chunk).await.map_err(AppError::Io)?;
                            downloaded += chunk.len() as u64;

                            if last_emit.elapsed().as_millis() >= 300 {
                                let elapsed = start_time.elapsed().as_secs_f64();
                                let speed = if elapsed > 0.0 {
                                    ((downloaded - already_downloaded) as f64 / 1024.0) / elapsed
                                } else {
                                    0.0
                                };

                                let progress = total_bytes
                                    .filter(|&t| t > 0)
                                    .map(|t| (downloaded as f32 / t as f32) * 100.0)
                                    .unwrap_or(0.0);

                                let _ = progress_tx.send(DownloadProgress {
                                    id: download_id.to_string(),
                                    progress,
                                    speed_kbps: speed,
                                    downloaded_bytes: downloaded,
                                    total_bytes,
                                    status: DownloadStatus::Downloading,
                                    error: None,
                                });
                                last_emit = Instant::now();
                            }
                        }
                    }
                }
            }
        }
    }
}

/// Resuelve un enlace de MediaFire obteniendo el URL de descarga directa del archivo
async fn resolve_mediafire_url(page_url: &str) -> Option<String> {
    use regex::Regex;
    let html = crate::scrapers::HTTP_CLIENT
        .get(page_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send().await.ok()?.text().await.ok()?;

    let re1 = Regex::new(r#"href=["'](https?://download\d*\.mediafire\.com/[^"']+)["']"#).ok()?;
    if let Some(cap) = re1.captures(&html) {
        return cap.get(1).map(|m| m.as_str().to_string());
    }
    let re2 = Regex::new(r#"id=["']downloadButton["'][^>]+href=["']([^"']+)["']"#).ok();
    if let Some(re) = re2 {
        if let Some(cap) = re.captures(&html) {
            return cap.get(1).map(|m| m.as_str().to_string());
        }
    }
    None
}

/// Obtiene el directorio de descargas predeterminado.
/// - Windows/PC: C:\Users\<user>\Videos\AniCS   (compatible con la versión C#)
/// - Android:    /storage/emulated/0/Anime        (crea si no existe)
#[tauri::command]
pub fn get_default_download_dir(app_handle: AppHandle) -> Result<String, String> {
    // 1. Si el usuario ya guardó una carpeta personalizada, usarla y asegurar que exista
    if let Ok(Some(saved_dir)) = storage::get_setting("download_dir") {
        if !saved_dir.trim().is_empty() {
            let p = Path::new(&saved_dir);
            let _ = fs::create_dir_all(p);
            return Ok(saved_dir);
        }
    }

    // 2. Selección por plataforma en tiempo de compilación
    #[cfg(target_os = "android")]
    {
        // Probar si /storage/emulated/0/Anime es accesible; si no, usar la carpeta de datos de la app
        let shared_path = PathBuf::from("/storage/emulated/0/Anime");
        let path = if fs::create_dir_all(&shared_path).is_ok() && shared_path.exists() {
            shared_path
        } else if let Ok(app_dir) = app_handle.path().app_data_dir() {
            let p = app_dir.join("Anime");
            let _ = fs::create_dir_all(&p);
            p
        } else {
            let p = PathBuf::from("/storage/emulated/0/Android/data/com.anics.app/files/Anime");
            let _ = fs::create_dir_all(&p);
            p
        };
        let path_str = path.to_string_lossy().to_string();
        let _ = storage::set_setting("download_dir", &path_str);
        return Ok(path_str);
    }

    // 3. Windows / macOS / Linux: preferir Videos\AniCS (compatible con C#)
    #[cfg(not(target_os = "android"))]
    {
        // Comprobar Videos/AniCS con contenido (herencia de la versión C#)
        if let Ok(vid_dir) = app_handle.path().video_dir() {
            let videos_anics = vid_dir.join("AniCS");
            if videos_anics.exists() {
                if let Ok(mut entries) = fs::read_dir(&videos_anics) {
                    if entries.next().is_some() {
                        let path_str = videos_anics.to_string_lossy().to_string();
                        let _ = storage::set_setting("download_dir", &path_str);
                        return Ok(path_str);
                    }
                }
            }
        }

        // Comprobar Downloads/AniCS con contenido
        if let Ok(dl_dir) = app_handle.path().download_dir() {
            let dl_anics = dl_dir.join("AniCS");
            if dl_anics.exists() {
                if let Ok(mut entries) = fs::read_dir(&dl_anics) {
                    if entries.next().is_some() {
                        let path_str = dl_anics.to_string_lossy().to_string();
                        let _ = storage::set_setting("download_dir", &path_str);
                        return Ok(path_str);
                    }
                }
            }
        }

        // Fallback: crear Videos\AniCS si video_dir está disponible, si no Downloads\AniCS
        let fallback = if let Ok(vid_dir) = app_handle.path().video_dir() {
            vid_dir.join("AniCS")
        } else if let Ok(dl_dir) = app_handle.path().download_dir() {
            dl_dir.join("AniCS")
        } else {
            PathBuf::from("Downloads/AniCS")
        };

        let _ = fs::create_dir_all(&fallback);
        let path_str = fallback.to_string_lossy().to_string();
        let _ = storage::set_setting("download_dir", &path_str);
        Ok(path_str)
    }
}

/// Guarda la carpeta de descargas personalizada en ajustes
#[tauri::command]
pub fn set_download_dir(folder_path: String) -> Result<(), String> {
    storage::set_setting("download_dir", &folder_path)
        .map_err(|e| e.to_string())
}

/// Escanea la carpeta de descargas buscando subcarpetas de animes y agrupando sus episodios
#[tauri::command]
pub async fn scan_local_downloads(
    folder_path: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<LocalAnimeFolder>, String> {
    let base_dir = if let Some(dir) = folder_path {
        PathBuf::from(dir)
    } else {
        PathBuf::from(get_default_download_dir(app_handle.clone())?)
    };

    if !base_dir.exists() {
        let _ = fs::create_dir_all(&base_dir);
        return Ok(vec![]);
    }

    // Mapa: Nombre de Anime -> Lista de Episodios
    let mut groups: HashMap<String, (PathBuf, Vec<LocalEpisodeItem>)> = HashMap::new();

    // Obtener historial completo para mapear progreso
    let history_list = storage::get_history(500, 0).unwrap_or_default();
    let mut path_history_map: HashMap<String, f64> = HashMap::new();
    let mut title_history_map: HashMap<String, f64> = HashMap::new();

    for h in &history_list {
        let norm_path = h.episode_url.replace('\\', "/").to_lowercase();
        path_history_map.entry(norm_path).or_insert(h.watch_progress);

        let key = format!("{}-{}", h.anime_title.to_lowercase().trim(), h.episode_number);
        title_history_map.entry(key).or_insert(h.watch_progress);
    }

    // 1. Escanear subdirectorios (cada subdirectorio representa un Anime)
    if let Ok(mut entries) = tokio::fs::read_dir(&base_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("Anime").to_string();
                let clean_title = sanitize_anime_folder_name(&folder_name.replace('_', " "));

                let mut episodes = vec![];
                scan_episodes_in_dir(&path, &clean_title, &mut episodes, &path_history_map, &title_history_map).await;

                if !episodes.is_empty() {
                    // Ordenar episodios ascendentemente por número
                    episodes.sort_by_key(|e| e.episode_number);
                    groups.insert(clean_title, (path, episodes));
                }
            } else if path.is_file() {
                // Archivo suelto en raíz (ignorar archivos temporales o incompletos)
                let file_name_lower = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if file_name_lower.ends_with(".part") || file_name_lower.ends_with(".tmp") || file_name_lower.ends_with(".downloading") {
                    continue;
                }

                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ["mp4", "mkv", "ts", "webm", "avi"].contains(&ext.to_lowercase().as_str()) {
                        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("video").to_string();
                        let (anime_title, ep_num) = parse_anime_from_filename(&file_name, None);
                        let ep_number = ep_num.unwrap_or(1);

                        let file_size = tokio::fs::metadata(&path).await.map(|m| m.len()).unwrap_or(0);
                        let modified_at = tokio::fs::metadata(&path).await.ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|m| {
                                let dt: DateTime<Utc> = m.into();
                                Some(dt.format("%Y-%m-%d %H:%M").to_string())
                            })
                            .unwrap_or_else(|| "Reciente".to_string());

                        let (progress, watch_status) = get_watch_info(&path, &anime_title, ep_number, &path_history_map, &title_history_map);

                        let item = LocalEpisodeItem {
                            file_path: path.to_string_lossy().to_string(),
                            file_name,
                            episode_number: ep_number,
                            file_size,
                            file_size_formatted: format_bytes(file_size),
                            modified_at,
                            watch_progress: progress,
                            watch_status,
                        };

                        let entry = groups.entry(anime_title.clone()).or_insert_with(|| (base_dir.clone(), vec![]));
                        entry.1.push(item);
                    }
                }
            }
        }
    }

    // Si estamos en Android, también escanear /storage/emulated/0/Anime si existe y es diferente de base_dir
    #[cfg(target_os = "android")]
    {
        let shared_anime = PathBuf::from("/storage/emulated/0/Anime");
        if shared_anime.exists() && shared_anime != base_dir {
            if let Ok(mut entries) = tokio::fs::read_dir(&shared_anime).await {
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.is_dir() {
                        let folder_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("Anime").to_string();
                        let clean_title = sanitize_anime_folder_name(&folder_name.replace('_', " "));
                        let mut episodes = vec![];
                        scan_episodes_in_dir(&path, &clean_title, &mut episodes, &path_history_map, &title_history_map).await;
                        if !episodes.is_empty() {
                            episodes.sort_by_key(|e| e.episode_number);
                            groups.insert(clean_title, (path, episodes));
                        }
                    }
                }
            }
        }
    }

    let history_list = storage::get_history(500, 0).unwrap_or_default();
    let favorites_list = storage::get_favorites().unwrap_or_default();

    let mut result = vec![];
    for (anime_title, (folder_path, mut episodes)) in groups {
        episodes.sort_by_key(|e| e.episode_number);
        let total_size: u64 = episodes.iter().map(|e| e.file_size).sum();
        let total_episodes = episodes.len();

        // 1. Buscar si existe un poster.jpg o cover.png en la carpeta que sea válido (> 100 bytes)
        let local_cover = [
            folder_path.join("poster.jpg"),
            folder_path.join("cover.jpg"),
            folder_path.join("poster.png"),
            folder_path.join("cover.png"),
        ].iter().find(|p| {
            p.exists() && p.metadata().map(|m| m.len() > 100).unwrap_or(false)
        }).map(|p| p.to_string_lossy().to_string());

        // 2. Buscar en historial o favoritos de SQLite
        let db_cover = history_list.iter()
            .find(|h| h.anime_title.eq_ignore_ascii_case(&anime_title) || h.anime_title.to_lowercase().contains(&anime_title.to_lowercase()))
            .map(|h| h.thumbnail_url.clone())
            .or_else(|| {
                favorites_list.iter()
                    .find(|f| f.title.eq_ignore_ascii_case(&anime_title) || f.title.to_lowercase().contains(&anime_title.to_lowercase()))
                    .map(|f| f.thumbnail_url.clone())
            });

        // 3. Fallback inteligente a CDN con slug normalizado
        let slug = anime_title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == ' ' { c } else { ' ' })
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("-");

        let fallback_cover = if !slug.is_empty() {
            Some(format!("https://cdn.jkdesa.com/assets/images/animes/image/{}.jpg", slug))
        } else {
            None
        };

        let cover_image = local_cover.or(db_cover).or(fallback_cover);

        result.push(LocalAnimeFolder {
            anime_title,
            folder_path: folder_path.to_string_lossy().to_string(),
            total_episodes,
            total_size,
            total_size_formatted: format_bytes(total_size),
            cover_image,
            episodes,
        });
    }

    // Ordenar animes alfabéticamente
    result.sort_by(|a, b| a.anime_title.cmp(&b.anime_title));

    Ok(result)
}

/// Elimina un archivo de episodio descargado localmente
#[tauri::command]
pub fn delete_local_download(file_path: String, app_handle: AppHandle) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        // Validation to prevent Path Traversal
        let base_dir_str = get_default_download_dir(app_handle)?;
        let base_canonical = Path::new(&base_dir_str)
            .canonicalize()
            .map_err(|_| "Invalid base download directory".to_string())?;

        let target_canonical = path
            .canonicalize()
            .map_err(|_| "Invalid target path".to_string())?;

        let is_valid = target_canonical.starts_with(&base_canonical)
            || (cfg!(target_os = "android") && {
                Path::new("/storage/emulated/0/Anime")
                    .canonicalize()
                    .map(|p| target_canonical.starts_with(&p))
                    .unwrap_or(false)
            });

        if !is_valid {
            return Err("Access denied: path is outside the download directory".to_string());
        }

        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Elimina una carpeta completa de anime y todos sus videos
#[tauri::command]
pub fn delete_local_anime_folder(folder_path: String, app_handle: AppHandle) -> Result<(), String> {
    let path = Path::new(&folder_path);
    if path.exists() && path.is_dir() {
        // Validation to prevent Path Traversal
        let base_dir_str = get_default_download_dir(app_handle)?;
        let base_canonical = Path::new(&base_dir_str)
            .canonicalize()
            .map_err(|_| "Invalid base download directory".to_string())?;

        let target_canonical = path
            .canonicalize()
            .map_err(|_| "Invalid target folder path".to_string())?;

        if target_canonical == base_canonical {
            return Err("Access denied: cannot delete root download directory".to_string());
        }

        let is_valid = target_canonical.starts_with(&base_canonical)
            || (cfg!(target_os = "android") && {
                Path::new("/storage/emulated/0/Anime")
                    .canonicalize()
                    .map(|p| target_canonical != p && target_canonical.starts_with(&p))
                    .unwrap_or(false)
            });

        if !is_valid {
            return Err("Access denied: folder path is outside the download directory".to_string());
        }

        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Obtiene o almacena en caché local una imagen
#[tauri::command]
pub async fn cache_image(url: String, app_handle: AppHandle) -> Result<String, String> {
    crate::storage::get_cached_image(&url, &app_handle)
        .await
        .map_err(|e| e.to_string())
}

/// Guarda la portada de un anime en disco como poster.jpg dentro de la carpeta del anime.
/// Esto garantiza disponibilidad offline permanente sin depender del CDN.
#[tauri::command]
pub async fn save_local_anime_cover(
    folder_path: String,
    cover_url: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    if cover_url.is_empty() || !cover_url.starts_with("http") {
        return Err("URL de portada inválida".to_string());
    }

    let anime_folder = Path::new(&folder_path);
    if !anime_folder.exists() {
        return Err(format!("Carpeta no existe: {}", folder_path));
    }

    // 1. Asegurarnos de que esté descargada y en caché
    let _ = crate::storage::get_cached_image(&cover_url, &app_handle)
        .await
        .map_err(|e| e.to_string())?;

    // 2. Localizar el archivo en el directorio de caché de imágenes
    let cache_dir = crate::storage::get_image_cache_dir(&app_handle)
        .map_err(|e| e.to_string())?;
    let filename = crate::storage::hash_image_url(&cover_url);
    let cached_file = cache_dir.join(&filename);

    if !cached_file.exists() {
        return Err("No se pudo guardar la imagen en caché".to_string());
    }

    // 3. Determinar la extensión y el nombre del poster
    let ext = cached_file
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg");
    let poster_path = anime_folder.join(format!("poster.{}", ext));

    // 4. Si ya existe un poster válido e idéntico (> 100 bytes y mismo tamaño), no re-copiar
    if poster_path.exists() {
        if let (Ok(src_meta), Ok(dst_meta)) = (fs::metadata(&cached_file), fs::metadata(&poster_path)) {
            if src_meta.len() == dst_meta.len() && dst_meta.len() > 100 {
                return Ok(poster_path.to_string_lossy().to_string());
            }
        }
    }

    // 5. Copiar desde la caché al directorio del anime (sobrescribe archivos dañados/vacíos)
    fs::copy(&cached_file, &poster_path)
        .map_err(|e| format!("Error copiando portada: {}", e))?;


    Ok(poster_path.to_string_lossy().to_string())
}

/// Obtiene estadísticas del tamaño de la caché de imágenes
#[tauri::command]
pub fn get_cache_stats(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let (total_bytes, file_count) = crate::storage::get_cache_stats(&app_handle)
        .map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "totalBytes": total_bytes,
        "totalFormatted": format_bytes(total_bytes),
        "fileCount": file_count,
    }))
}

/// Limpia la caché de imágenes en disco y memoria
#[tauri::command]
pub fn clear_image_cache(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let freed = crate::storage::clear_image_cache(&app_handle)
        .map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "freedBytes": freed,
        "freedFormatted": format_bytes(freed),
    }))
}

/// Precarga un lote de URLs de imágenes en paralelo y retorna un Map con los Data URIs en RAM.
#[tauri::command]
pub async fn preload_images_batch(
    urls: Vec<String>,
    app_handle: AppHandle,
) -> Result<HashMap<String, String>, String> {
    Ok(crate::storage::get_cached_images_batch(urls, &app_handle).await)
}


fn get_watch_info(
    file_path: &Path,
    anime_title: &str,
    ep_number: u32,
    path_history_map: &HashMap<String, f64>,
    title_history_map: &HashMap<String, f64>,
) -> (f64, String) {
    let norm_path = file_path.to_string_lossy().replace('\\', "/").to_lowercase();
    let title_key = format!("{}-{}", anime_title.to_lowercase().trim(), ep_number);

    let progress = path_history_map.get(&norm_path)
        .or_else(|| title_history_map.get(&title_key))
        .cloned()
        .unwrap_or(0.0);

    let watch_status = if progress >= 0.85 {
        "completed"
    } else if progress > 0.001 {
        "in_progress"
    } else {
        "unseen"
    }.to_string();

    (progress, watch_status)
}

async fn scan_episodes_in_dir(
    dir: &Path,
    anime_title: &str,
    episodes: &mut Vec<LocalEpisodeItem>,
    path_history_map: &HashMap<String, f64>,
    title_history_map: &HashMap<String, f64>,
) {
    if let Ok(mut entries) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            if path.is_file() {
                let file_name_lower = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
                if file_name_lower.ends_with(".part") || file_name_lower.ends_with(".tmp") || file_name_lower.ends_with(".downloading") {
                    continue;
                }

                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ["mp4", "mkv", "ts", "webm", "avi"].contains(&ext.to_lowercase().as_str()) {
                        if let Ok(meta) = tokio::fs::metadata(&path).await {
                            let file_size = meta.len();
                            if file_size > 10240 {
                                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("video").to_string();
                                let ep_number = extract_episode_num(&file_name).unwrap_or(1);

                                let modified_at = meta.modified().ok()
                                    .and_then(|m| {
                                        let dt: DateTime<Utc> = m.into();
                                        Some(dt.format("%Y-%m-%d %H:%M").to_string())
                                    })
                                    .unwrap_or_else(|| "Reciente".to_string());

                                let (progress, watch_status) = get_watch_info(&path, anime_title, ep_number, path_history_map, title_history_map);

                                episodes.push(LocalEpisodeItem {
                                    file_path: path.to_string_lossy().to_string(),
                                    file_name,
                                    episode_number: ep_number,
                                    file_size,
                                    file_size_formatted: format_bytes(file_size),
                                    modified_at,
                                    watch_progress: progress,
                                    watch_status,
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

fn parse_anime_from_filename(filename: &str, parent_dir: Option<&Path>) -> (String, Option<u32>) {
    if let Some(parent) = parent_dir {
        if let Some(dir_name) = parent.file_name().and_then(|n| n.to_str()) {
            if dir_name != "AniCS" && dir_name != "Downloads" && !dir_name.is_empty() {
                let ep_num = extract_episode_num(filename);
                let clean_title = dir_name.replace('_', " ").trim().to_string();
                return (clean_title, ep_num);
            }
        }
    }

    let stem = Path::new(filename).file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
    let ep_num = extract_episode_num(stem);

    let mut clean = stem.replace('_', " ");
    for tag in &["[1080p]", "[720p]", "[480p]", "(Sub Español)", "(Sub)", "[HD]", ".mp4", ".ts", ".mkv"] {
        clean = clean.replace(tag, "");
    }
    
    if let Some(pos) = clean.to_lowercase().find("ep") {
        clean = clean[..pos].trim_end_matches(&['-', ' ', '_'][..]).to_string();
    } else if let Some(pos) = clean.to_lowercase().find("cap") {
        clean = clean[..pos].trim_end_matches(&['-', ' ', '_'][..]).to_string();
    }

    let title = if clean.trim().is_empty() {
        stem.to_string()
    } else {
        clean.trim().to_string()
    };

    (title, ep_num)
}

fn extract_episode_num(text: &str) -> Option<u32> {
    static RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r#"(?:ep|cap|episodio|\b)(\d{1,4})\b"#).expect("Invalid episode regex")
    });
    for cap in RE.captures_iter(&text.to_lowercase()) {
        if let Some(m) = cap.get(1) {
            if let Ok(num) = m.as_str().parse::<u32>() {
                return Some(num);
            }
        }
    }
    None
}

fn format_bytes(bytes: u64) -> String {
    if bytes == 0 { return "0 B".to_string(); }
    let k = 1024f64;
    let sizes = ["B", "KB", "MB", "GB", "TB"];
    let i = (bytes as f64).log(k).floor() as usize;
    let i = i.min(sizes.len() - 1);
    format!("{:.1} {}", (bytes as f64) / k.powi(i as i32), sizes[i])
}

/// Descarga el instalador (.exe o .apk) internamente en segundo plano con progreso y lo ejecuta automáticamente
#[tauri::command]
pub async fn download_and_run_installer(
    url: String,
    filename: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    let repo = crate::storage::database::get_setting("github_repo")
        .unwrap_or_default()
        .unwrap_or_else(|| "SteveenR-A/AniCS".to_string());

    let parsed_url = match url::Url::parse(&url) {
        Ok(parsed) => parsed,
        Err(_) => return Err("URL inválida".to_string()),
    };

    if parsed_url.host_str() != Some("github.com") {
        return Err("URL de descarga no autorizada (dominio inválido)".to_string());
    }

    let expected_path_prefix = format!("/{}/releases/download/", repo);
    if !parsed_url.path().starts_with(&expected_path_prefix) {
        return Err("URL de descarga no autorizada (ruta inválida)".to_string());
    }

    let safe_filename = match std::path::Path::new(&filename).file_name() {
        Some(name) => name.to_string_lossy().into_owned(),
        None => return Err("Nombre de archivo inválido".to_string()),
    };

    if !safe_filename.ends_with(".exe") && !safe_filename.ends_with(".apk") {
        return Err("Extensión de archivo no permitida".to_string());
    }

    let filename = safe_filename;

    let dest_path = {
        #[cfg(target_os = "android")]
        {
            let cache_dir = app_handle.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("/data/user/0/com.anics.app/cache"));
            let _ = fs::create_dir_all(&cache_dir);
            // Limpiar cualquier APK descargado previamente para que nunca se acumulen en el almacenamiento
            if let Ok(entries) = fs::read_dir(&cache_dir) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() && p.extension().map(|e| e.eq_ignore_ascii_case("apk")).unwrap_or(false) {
                        let _ = fs::remove_file(p);
                    }
                }
            }
            cache_dir.join(&filename)
        }
        #[cfg(not(target_os = "android"))]
        {
            let temp_dir = std::env::temp_dir();
            // Limpiar cualquier instalador de actualización previo
            let old_installer = temp_dir.join(&filename);
            if old_installer.exists() {
                let _ = fs::remove_file(old_installer);
            }
            temp_dir.join(&filename)
        }
    };

    let client = &crate::scrapers::DOWNLOAD_CLIENT;
    let response = client
        .get(&url)
        .header("User-Agent", "AniCS-Updater")
        .send()
        .await
        .map_err(|e| format!("Error conectando con servidor de actualización: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Error HTTP al descargar instalador: {}", response.status()));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Error creando archivo temporal: {}", e))?;

    let mut stream = response.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error descargando paquete: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error guardando instalador: {}", e))?;

        downloaded += chunk.len() as u64;
        let progress = if total_bytes > 0 {
            (downloaded as f64 / total_bytes as f64) * 100.0
        } else {
            0.0
        };

        let _ = app_handle.emit("update-download-progress", serde_json::json!({
            "downloaded": downloaded,
            "total": total_bytes,
            "progress": progress,
            "filename": filename,
        }));
    }

    file.flush().await.map_err(|e| e.to_string())?;
    // Liberar explícitamente el handle de archivo en el SO antes de ejecutar el instalador
    drop(file);

    // Ejecutar el instalador en Windows
    #[cfg(target_os = "windows")]
    {
        if filename.ends_with(".exe") {
            // Dar tiempo al sistema operativo y al antivirus para desbloquear el archivo recién escrito
            let mut launched = false;
            let mut last_err = None;

            for attempt in 0..5 {
                if attempt > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                }

                match std::process::Command::new(&dest_path).spawn() {
                    Ok(_) => {
                        launched = true;
                        break;
                    }
                    Err(e) => {
                        last_err = Some(e);
                    }
                }
            }

            if !launched {
                if let Some(err) = last_err {
                    return Err(format!("Error ejecutando instalador: {}", err));
                }
            }
        }
    }

    Ok(dest_path.to_string_lossy().to_string())
}

/// Obtiene la URL de streaming HTTP local con soporte de Range Requests para reproducir videos locales
#[tauri::command]
pub fn get_local_media_url(file_path: String) -> String {
    crate::downloader::media_server::get_media_stream_url(&file_path)
}


#[cfg(test)]
mod tests {
    // use super::*;

    #[test]
    fn test_filename_validation() {
        let repo = "SteveenR-A/AniCS";

        let valid_url_str = format!("https://github.com/{}/releases/download/v1.0.0/installer.exe", repo);
        let valid_url = url::Url::parse(&valid_url_str).unwrap();
        assert_eq!(valid_url.host_str(), Some("github.com"));
        assert!(valid_url.path().starts_with(&format!("/{}/releases/download/", repo)));

        let malicious_url_str = format!("https://github.com/{}/releases/download/../../../malicious/releases/download/v1.0/malware.exe", repo);
        let malicious_url = url::Url::parse(&malicious_url_str).unwrap();
        assert_eq!(malicious_url.host_str(), Some("github.com"));
        // The path should be normalized and won't start with the repo anymore
        assert!(!malicious_url.path().starts_with(&format!("/{}/releases/download/", repo)));

        let filename1 = "installer.exe";
        let safe1 = std::path::Path::new(filename1).file_name().unwrap().to_string_lossy();
        assert_eq!(safe1, "installer.exe");
        assert!(safe1.ends_with(".exe"));

        let filename2 = "../malicious.exe";
        let safe2 = std::path::Path::new(filename2).file_name().unwrap().to_string_lossy();
        assert_eq!(safe2, "malicious.exe");

        let filename3 = "installer.txt";
        let safe3 = std::path::Path::new(filename3).file_name().unwrap().to_string_lossy();
        assert!(!safe3.ends_with(".exe") && !safe3.ends_with(".apk"));
    }
}
