use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{OnceLock, RwLock};
use tauri::{AppHandle, Manager};
use reqwest::header;

use crate::core::*;
use crate::scrapers::HTTP_CLIENT;

static MEMORY_IMAGE_CACHE: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();

fn get_memory_cache() -> &'static RwLock<HashMap<String, String>> {
    MEMORY_IMAGE_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Obtiene o inicializa el directorio de caché de imágenes
pub fn get_image_cache_dir(app_handle: &AppHandle) -> AppResult<PathBuf> {
    let base_cache = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Parse(e.to_string()))?;
    let img_cache = base_cache.join("images");
    if !img_cache.exists() {
        fs::create_dir_all(&img_cache)
            .map_err(AppError::Io)?;
    }
    Ok(img_cache)
}

/// Genera un nombre de archivo único a partir de la URL
fn hash_image_url(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    let hash = hasher.finish();

    let ext = if url.ends_with(".png") {
        "png"
    } else if url.ends_with(".webp") {
        "webp"
    } else {
        "jpg"
    };

    format!("{:016x}.{}", hash, ext)
}

/// Descarga o recupera de la caché en memoria y disco una imagen a máxima velocidad (0ms si ya está en RAM)
pub async fn get_cached_image(url: &str, app_handle: &AppHandle) -> AppResult<String> {
    if url.is_empty() {
        return Ok(String::new());
    }

    // Si ya es una ruta local o data URL, devolver tal cual
    if url.starts_with("data:") || url.starts_with("asset:") || !url.starts_with("http") {
        return Ok(url.to_string());
    }

    // 1. Verificación ultra-rápida en RAM
    {
        let cache = get_memory_cache();
        if let Ok(map) = cache.read() {
            if let Some(cached_path) = map.get(url) {
                return Ok(cached_path.clone());
            }
        }
    }

    let cache_dir = get_image_cache_dir(app_handle)?;
    let filename = hash_image_url(url);
    let local_file = cache_dir.join(&filename);

    // 2. Si ya está en disco y tiene contenido válido (> 100 bytes)
    if local_file.exists() {
        if let Ok(meta) = fs::metadata(&local_file) {
            if meta.len() > 100 {
                let local_path = local_file.to_string_lossy().to_string();
                if let Ok(mut map) = get_memory_cache().write() {
                    map.insert(url.to_string(), local_path.clone());
                }
                return Ok(local_path);
            }
        }
    }

    // 3. Descargar y guardar en disco + RAM
    let req = HTTP_CLIENT
        .get(url)
        .header(header::ACCEPT, "image/avif,image/webp,image/apng,image/*,*/*;q=0.8");

    match req.send().await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(bytes) = resp.bytes().await {
                if bytes.len() > 100 {
                    let _ = fs::write(&local_file, &bytes);
                    let local_path = local_file.to_string_lossy().to_string();
                    if let Ok(mut map) = get_memory_cache().write() {
                        map.insert(url.to_string(), local_path.clone());
                    }
                    return Ok(local_path);
                }
            }
        }
        _ => {}
    }

    // Fallback: devolver la URL original si la descarga de caché falló
    Ok(url.to_string())
}

/// Obtiene estadísticas del tamaño y cantidad de imágenes en caché
pub fn get_cache_stats(app_handle: &AppHandle) -> AppResult<(u64, usize)> {
    let cache_dir = get_image_cache_dir(app_handle)?;
    let mut total_bytes = 0u64;
    let mut file_count = 0usize;

    if let Ok(entries) = fs::read_dir(cache_dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total_bytes += meta.len();
                    file_count += 1;
                }
            }
        }
    }

    Ok((total_bytes, file_count))
}

/// Limpia la caché de imágenes en disco y memoria
pub fn clear_image_cache(app_handle: &AppHandle) -> AppResult<u64> {
    if let Ok(mut map) = get_memory_cache().write() {
        map.clear();
    }

    let cache_dir = get_image_cache_dir(app_handle)?;
    let mut freed_bytes = 0u64;

    if let Ok(entries) = fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(meta) = entry.metadata() {
                    freed_bytes += meta.len();
                }
                let _ = fs::remove_file(path);
            }
        }
    }

    Ok(freed_bytes)
}
