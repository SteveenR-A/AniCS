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
use crate::storage;
use crate::AppState;

type DownloadMap = Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>;

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

/// Iniciar una descarga (soporta tanto HLS .m3u8 como archivos directos MP4/MKV)
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

    let safe_title: String = anime_title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' { c } else { '_' })
        .collect();

    let anime_folder = base_dir.join(&safe_title);
    if let Err(e) = fs::create_dir_all(&anime_folder) {
        log::warn!("No se pudo crear la carpeta {}: {}", anime_folder.display(), e);
    }

    let is_mp4 = stream_url.contains(".mp4")
        || stream_url.contains("mediafire.com")
        || stream_url.contains("mp4upload")
        || stream_url.contains("streamtape");

    let ext = if is_mp4 { "mp4" } else { "ts" };
    let output_path = anime_folder.join(format!("Ep{:03}.{}", episode_number, ext));

    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<DownloadProgress>();

    let dl_id_clone = download_id.clone();
    let app_handle_clone = app_handle.clone();

    // Escuchar eventos de progreso y emitirlos al frontend
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_handle_clone.emit("download-progress", &progress);
        }
    });

    let dl_id_for_task = download_id.clone();
    let app_handle_finish = app_handle.clone();
    let stream_url_clone = stream_url.clone();
    let referer_clone = referer.clone();
    let semaphore_clone = state.download_manager.semaphore.clone();

    let handle = tokio::spawn(async move {
        // 1. Notificar inmediatamente que la tarea está en cola
        let _ = progress_tx.send(DownloadProgress {
            id: dl_id_for_task.clone(),
            progress: 0.0,
            speed_kbps: 0.0,
            downloaded_bytes: 0,
            total_bytes: None,
            status: DownloadStatus::Queued,
            error: None,
        });

        // 2. Esperar turno en el semáforo (máx 2 activas simultáneas)
        let _permit = match semaphore_clone.acquire().await {
            Ok(p) => p,
            Err(_) => return,
        };

        // 3. Notificar que comienza a descargar
        let _ = progress_tx.send(DownloadProgress {
            id: dl_id_for_task.clone(),
            progress: 0.0,
            speed_kbps: 0.0,
            downloaded_bytes: 0,
            total_bytes: None,
            status: DownloadStatus::Downloading,
            error: None,
        });

        if is_mp4 {
            // Si es un enlace de página de MediaFire (no directo aún), resolverla para obtener el link de descarga directo
            let is_mediafire_page = stream_url_clone.contains("mediafire.com")
                && !stream_url_clone.starts_with("https://download")
                && !stream_url_clone.starts_with("http://download")
                && !stream_url_clone.ends_with(".mp4")
                && !stream_url_clone.ends_with(".mkv");

            let actual_url = if is_mediafire_page {
                resolve_mediafire_url(&stream_url_clone).await.unwrap_or_else(|| stream_url_clone.clone())
            } else {
                stream_url_clone.clone()
            };

            // Descarga directa MP4 con DOWNLOAD_CLIENT
            match download_direct_mp4(&dl_id_for_task, &actual_url, referer_clone.as_deref(), &output_path, &progress_tx).await {
                Ok(_) => {
                    let _ = app_handle_finish.emit("download-completed", serde_json::json!({
                        "id": dl_id_for_task,
                        "path": output_path.to_string_lossy(),
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
                        id: dl_id_for_task,
                        progress: 0.0,
                        speed_kbps: 0.0,
                        downloaded_bytes: 0,
                        total_bytes: None,
                        status: DownloadStatus::Failed,
                        error: Some(e.to_string()),
                    });
                }
            }
        } else {
            // Descarga HLS
            let engine = HlsEngine::new(
                dl_id_for_task.clone(),
                stream_url_clone,
                referer_clone,
                output_path.clone(),
                progress_tx.clone(),
            );

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
                        error: Some(format!("Error en stream HLS: {e}")),
                    });
                }
            }
        }
    });

    // Guardar handle para permitir cancelación
    state.download_manager.tasks.lock().await.insert(dl_id_clone, handle);

    Ok(download_id)
}



/// Resuelve un enlace de MediaFire obteniendo el URL de descarga directa del archivo
async fn resolve_mediafire_url(page_url: &str) -> Option<String> {
    use regex::Regex;

    let html = crate::scrapers::HTTP_CLIENT
        .get(page_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .ok()?
        .text()
        .await
        .ok()?;

    // Patrón 1: href con download subdomain
    let re1 = Regex::new(r#"href=["'](https?://download\d*\.mediafire\.com/[^"']+)["']"#).ok()?;
    if let Some(cap) = re1.captures(&html) {
        return cap.get(1).map(|m| m.as_str().to_string());
    }

    // Patrón 2: botón de descarga con aria-label
    let re2 = Regex::new(r#"aria-label=["']Download file["']\s+href=["']([^"']+)["']"#).ok();
    if let Some(re) = re2 {
        if let Some(cap) = re.captures(&html) {
            return cap.get(1).map(|m| m.as_str().to_string());
        }
    }

    // Patrón 3: id="downloadButton"
    let re3 = Regex::new(r#"id=["']downloadButton["'][^>]+href=["']([^"']+)["']"#).ok();
    if let Some(re) = re3 {
        if let Some(cap) = re.captures(&html) {
            return cap.get(1).map(|m| m.as_str().to_string());
        }
    }

    None
}

async fn download_direct_mp4(
    download_id: &str,
    url: &str,
    referer: Option<&str>,
    output_path: &Path,
    progress_tx: &mpsc::UnboundedSender<DownloadProgress>,
) -> AppResult<()> {
    use reqwest::header;
    use tokio::fs::File;
    use tokio::io::AsyncWriteExt;
    use futures::StreamExt;
    use std::time::Instant;

    let mut req = crate::scrapers::DOWNLOAD_CLIENT.get(url);
    if let Some(r) = referer {
        req = req.header(header::REFERER, r);
    } else if url.contains("jkanime") {
        req = req.header(header::REFERER, "https://jkanime.net/");
    }

    let resp = req.send().await.map_err(AppError::Network)?;
    if !resp.status().is_success() {
        return Err(AppError::Download(format!("HTTP error {}", resp.status())));
    }

    // Verificar que la respuesta sea un video, no HTML
    let content_type = resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_lowercase();

    if content_type.contains("text/html") {
        return Err(AppError::Download(
            "El servidor devolvió HTML en vez del archivo. La URL no es directa.".to_string()
        ));
    }

    let total_bytes = resp.content_length();
    let mut file = File::create(output_path).await.map_err(AppError::Io)?;

    let mut stream = resp.bytes_stream();
    let mut downloaded = 0u64;
    let mut last_emit = Instant::now();
    let start_time = Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(AppError::Network)?;
        file.write_all(&chunk).await.map_err(AppError::Io)?;

        let len = chunk.len() as u64;
        downloaded += len;

        if last_emit.elapsed().as_millis() >= 300 {
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let speed_kbps = if elapsed_secs > 0.0 {
                (downloaded as f64 / 1024.0) / elapsed_secs
            } else {
                0.0
            };

            let progress = if let Some(tot) = total_bytes {
                if tot > 0 { (downloaded as f32 / tot as f32) * 100.0 } else { 0.0 }
            } else {
                0.0
            };

            let _ = progress_tx.send(DownloadProgress {
                id: download_id.to_string(),
                progress,
                speed_kbps,
                downloaded_bytes: downloaded,
                total_bytes,
                status: DownloadStatus::Downloading,
                error: None,
            });

            last_emit = Instant::now();
        }
    }

    file.flush().await.map_err(AppError::Io)?;
    Ok(())
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
    if let Ok(entries) = fs::read_dir(&base_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let folder_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("Anime").to_string();
                let clean_title = folder_name.replace('_', " ").trim().to_string();

                let mut episodes = vec![];
                scan_episodes_in_dir(&path, &clean_title, &mut episodes, &path_history_map, &title_history_map);

                if !episodes.is_empty() {
                    // Ordenar episodios ascendentemente por número
                    episodes.sort_by_key(|e| e.episode_number);
                    groups.insert(clean_title, (path, episodes));
                }
            } else if path.is_file() {
                // Archivo suelto en raíz
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ["mp4", "mkv", "ts", "webm", "avi"].contains(&ext.to_lowercase().as_str()) {
                        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("video").to_string();
                        let (anime_title, ep_num) = parse_anime_from_filename(&file_name, None);
                        let ep_number = ep_num.unwrap_or(1);

                        let file_size = path.metadata().map(|m| m.len()).unwrap_or(0);
                        let modified_at = path.metadata().ok()
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
            if let Ok(entries) = fs::read_dir(&shared_anime) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let folder_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("Anime").to_string();
                        let clean_title = folder_name.replace('_', " ").trim().to_string();
                        let mut episodes = vec![];
                        scan_episodes_in_dir(&path, &clean_title, &mut episodes, &path_history_map, &title_history_map);
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
pub fn delete_local_download(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Elimina una carpeta completa de anime y todos sus videos
#[tauri::command]
pub fn delete_local_anime_folder(folder_path: String) -> Result<(), String> {
    let path = Path::new(&folder_path);
    if path.exists() && path.is_dir() {
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

fn scan_episodes_in_dir(
    dir: &Path,
    anime_title: &str,
    episodes: &mut Vec<LocalEpisodeItem>,
    path_history_map: &HashMap<String, f64>,
    title_history_map: &HashMap<String, f64>,
) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ["mp4", "mkv", "ts", "webm", "avi"].contains(&ext.to_lowercase().as_str()) {
                        if let Ok(meta) = entry.metadata() {
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

/// Descarga el instalador (.exe o .apk) internamente en segundo plano con progreso y lo ejecuta automáticamente
#[tauri::command]
pub async fn download_and_run_installer(
    url: String,
    filename: String,
    app_handle: AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;
    use futures::StreamExt;
    use tokio::io::AsyncWriteExt;

    let dest_path = {
        #[cfg(target_os = "android")]
        {
            let cache_dir = app_handle.path().app_cache_dir().unwrap_or_else(|_| PathBuf::from("/data/user/0/com.anics.app/cache"));
            let _ = fs::create_dir_all(&cache_dir);
            cache_dir.join(&filename)
        }
        #[cfg(not(target_os = "android"))]
        {
            let temp_dir = std::env::temp_dir();
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

