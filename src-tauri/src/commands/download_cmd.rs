use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalVideoFile {
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_size_formatted: String,
    pub anime_title: String,
    pub episode_number: Option<u32>,
    pub modified_at: String,
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

/// Obtiene el directorio de descargas predeterminado
#[tauri::command]
pub fn get_default_download_dir(app_handle: AppHandle) -> Result<String, String> {
    let dir = app_handle
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?
        .join("AniCS");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    Ok(dir.to_string_lossy().to_string())
}

/// Escanea la carpeta de descargas buscando archivos de video locales
#[tauri::command]
pub async fn scan_local_downloads(
    folder_path: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<LocalVideoFile>, String> {
    let base_dir = if let Some(dir) = folder_path {
        PathBuf::from(dir)
    } else {
        app_handle
            .path()
            .download_dir()
            .map_err(|e| e.to_string())?
            .join("AniCS")
    };

    if !base_dir.exists() {
        let _ = fs::create_dir_all(&base_dir);
        return Ok(vec![]);
    }

    let mut files = vec![];
    scan_dir_recursive(&base_dir, &mut files, 0);

    // Ordenar de más reciente a más antiguo
    files.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));

    Ok(files)
}

/// Elimina un archivo descargado localmente
#[tauri::command]
pub fn delete_local_download(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
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

/// Limpia la caché de imágenes en disco
#[tauri::command]
pub fn clear_image_cache(app_handle: AppHandle) -> Result<serde_json::Value, String> {
    let freed = crate::storage::clear_image_cache(&app_handle)
        .map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "freedBytes": freed,
        "freedFormatted": format_bytes(freed),
    }))
}

fn scan_dir_recursive(dir: &Path, files: &mut Vec<LocalVideoFile>, depth: usize) {
    if depth > 4 { return; }
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_dir_recursive(&path, files, depth + 1);
            } else if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ["mp4", "mkv", "ts", "webm", "avi"].contains(&ext_lower.as_str()) {
                        if let Ok(meta) = entry.metadata() {
                            let file_size = meta.len();
                            // Ignorar archivos vacíos menores a 10KB
                            if file_size > 10240 {
                                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("video").to_string();
                                let (anime_title, episode_number) = parse_anime_from_filename(&file_name, path.parent());
                                
                                let modified_at = meta.modified().ok()
                                    .and_then(|m| {
                                        let dt: DateTime<Utc> = m.into();
                                        Some(dt.format("%Y-%m-%d %H:%M").to_string())
                                    })
                                    .unwrap_or_else(|| "Reciente".to_string());

                                files.push(LocalVideoFile {
                                    file_path: path.to_string_lossy().to_string(),
                                    file_name,
                                    file_size,
                                    file_size_formatted: format_bytes(file_size),
                                    anime_title,
                                    episode_number,
                                    modified_at,
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
    // 1. Si la carpeta contenedora tiene el nombre del anime (ej. "Naruto Shippuden/Ep001.ts")
    if let Some(parent) = parent_dir {
        if let Some(dir_name) = parent.file_name().and_then(|n| n.to_str()) {
            if dir_name != "AniCS" && dir_name != "Downloads" && !dir_name.is_empty() {
                let ep_num = extract_episode_num(filename);
                let clean_title = dir_name.replace('_', " ").trim().to_string();
                return (clean_title, ep_num);
            }
        }
    }

    // 2. Extraer del nombre de archivo directamente
    let stem = Path::new(filename).file_stem().and_then(|s| s.to_str()).unwrap_or(filename);
    let ep_num = extract_episode_num(stem);

    // Limpieza de etiquetas comunes [1080p], (Sub Español), etc.
    let mut clean = stem.replace('_', " ");
    for tag in &["[1080p]", "[720p]", "[480p]", "(Sub Español)", "(Sub)", "[HD]", ".mp4", ".ts", ".mkv"] {
        clean = clean.replace(tag, "");
    }
    
    // Si contiene "Ep", "Cap", "Episodio", extraer la parte del título anterior
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
    let re = regex::Regex::new(r#"(?:ep|cap|episodio|\b)(\d{1,4})\b"#).ok()?;
    for cap in re.captures_iter(&text.to_lowercase()) {
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
