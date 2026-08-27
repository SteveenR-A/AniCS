use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::RwLock;
use tokio::sync::broadcast;
use once_cell::sync::OnceCell;
use tauri::{AppHandle, Manager};
use reqwest::header;
use base64::Engine;

use crate::core::*;
use crate::scrapers::HTTP_CLIENT;
use crate::storage::{
    upsert_image_cache_entry, touch_image_cache,
    get_top_frequent_cached_images, prune_image_cache_lru,
};

// ─────────────────────────────────────────────────────────────────────────────
// Configuración de caché en RAM y Disco
// ─────────────────────────────────────────────────────────────────────────────

/// Máximo de imágenes completas en RAM (Base64 data URIs).
/// Alrededor de 1500 imágenes (~30-60 MB de RAM aprovechada eficientemente).
const L1_MAX_ENTRIES: usize = 1500;

/// Tamaño máximo de la caché en disco antes de activar la poda LRU (300 MB).
const L2_MAX_BYTES: u64 = 300 * 1024 * 1024;

/// Número de imágenes a precalentar a RAM desde SQLite/Disco al inicio de la app.
const WARMUP_TOP_N: u32 = 300;

// ─────────────────────────────────────────────────────────────────────────────
// L1: Caché en RAM de Imágenes (URL -> Data URI Base64 completo)
// ─────────────────────────────────────────────────────────────────────────────

struct L1Cache {
    map: HashMap<String, String>,
    order: std::collections::VecDeque<String>,
    max_entries: usize,
}

impl L1Cache {
    fn new(max_entries: usize) -> Self {
        Self {
            map: HashMap::with_capacity(max_entries),
            order: std::collections::VecDeque::with_capacity(max_entries),
            max_entries,
        }
    }

    fn get(&mut self, url: &str) -> Option<String> {
        if let Some(data_uri) = self.map.get(url) {
            // Mover al frente (MRU)
            if let Some(pos) = self.order.iter().position(|u| u == url) {
                let key = self.order.remove(pos).unwrap();
                self.order.push_front(key);
            }
            Some(data_uri.clone())
        } else {
            None
        }
    }

    fn insert(&mut self, url: String, data_uri: String) {
        if self.map.contains_key(&url) {
            self.map.insert(url.clone(), data_uri);
            if let Some(pos) = self.order.iter().position(|u| u == &url) {
                let key = self.order.remove(pos).unwrap();
                self.order.push_front(key);
            }
            return;
        }

        // Evictar el elemento más antiguo si alcanzamos el límite de RAM
        if self.map.len() >= self.max_entries {
            if let Some(evicted) = self.order.pop_back() {
                self.map.remove(&evicted);
            }
        }

        self.map.insert(url.clone(), data_uri);
        self.order.push_front(url);
    }

    fn clear(&mut self) {
        self.map.clear();
        self.order.clear();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipo de resultado de descarga para el SingleFlight
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Clone)]
enum InflightResult {
    Ok(String),
    Err,
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado global: L1 RAM + SingleFlight
// ─────────────────────────────────────────────────────────────────────────────

struct ImageCacheState {
    l1: L1Cache,
    in_flight: HashMap<String, broadcast::Sender<InflightResult>>,
}

static IMAGE_CACHE_STATE: OnceCell<Arc<RwLock<ImageCacheState>>> = OnceCell::new();

fn get_state() -> &'static Arc<RwLock<ImageCacheState>> {
    IMAGE_CACHE_STATE.get_or_init(|| {
        Arc::new(RwLock::new(ImageCacheState {
            l1: L1Cache::new(L1_MAX_ENTRIES),
            in_flight: HashMap::new(),
        }))
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de Conversión y Archivos
// ─────────────────────────────────────────────────────────────────────────────

/// Convierte bytes binarios de imagen a un Data URI base64
pub fn bytes_to_data_uri(bytes: &[u8], mime_type: Option<&str>) -> String {
    let mime = mime_type.unwrap_or_else(|| {
        if bytes.starts_with(b"\x89PNG") {
            "image/png"
        } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
            "image/webp"
        } else if bytes.starts_with(b"GIF8") {
            "image/gif"
        } else {
            "image/jpeg"
        }
    });
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:{};base64,{}", mime, b64)
}

/// Obtiene e inicializa el directorio de caché de imágenes en disco
pub fn get_image_cache_dir(app_handle: &AppHandle) -> AppResult<PathBuf> {
    let base_cache = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Parse(e.to_string()))?;
    let img_cache = base_cache.join("images");
    if !img_cache.exists() {
        fs::create_dir_all(&img_cache).map_err(AppError::Io)?;
    }
    Ok(img_cache)
}

/// Genera un nombre de archivo único a partir de la URL
pub fn hash_image_url(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    let hash = hasher.finish();

    let ext = if url.contains(".png") {
        "png"
    } else if url.contains(".webp") {
        "webp"
    } else if url.contains(".gif") {
        "gif"
    } else {
        "jpg"
    };

    format!("{:016x}.{}", hash, ext)
}

/// Escritura atómica a disco (evita archivos corruptos y lock contention)
fn atomic_write(final_path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp_path = final_path.with_extension("tmp");
    fs::write(&tmp_path, bytes)?;
    fs::rename(&tmp_path, final_path)?;
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// API Pública Principal
// ─────────────────────────────────────────────────────────────────────────────

/// Obtiene o descarga y cachea una imagen en RAM y Disco.
/// Retorna directamente el Data URI base64 (`data:image/jpeg;base64,...`) para renderizado 0ms en WebView.
pub async fn get_cached_image(url: &str, app_handle: &AppHandle) -> AppResult<String> {
    if url.is_empty() {
        return Ok(String::new());
    }

    // Data URLs y rutas no remotas: devolver tal cual
    if url.starts_with("data:") || !url.starts_with("http") {
        return Ok(url.to_string());
    }

    // ── Nivel 1: L1 RAM (0ms instantáneo) ──
    {
        let mut state = get_state().write();
        if let Some(data_uri) = state.l1.get(url) {
            return Ok(data_uri);
        }
    }

    // ── Nivel 2: SQLite + Disco Local ──
    let cache_dir = get_image_cache_dir(app_handle)?;
    let filename = hash_image_url(url);
    let local_file = cache_dir.join(&filename);

    if local_file.exists() {
        if let Ok(bytes) = fs::read(&local_file) {
            if bytes.len() > 100 {
                let data_uri = bytes_to_data_uri(&bytes, None);
                let url_owned = url.to_string();
                let local_path = local_file.to_string_lossy().to_string();
                let file_size = bytes.len() as u64;

                // Indexar en SQLite en segundo plano
                tokio::spawn(async move {
                    let _ = upsert_image_cache_entry(&url_owned, &local_path, file_size, None);
                    let _ = touch_image_cache(&url_owned);
                });

                // Guardar en L1 RAM para todas las lecturas posteriores
                {
                    let mut state = get_state().write();
                    state.l1.insert(url.to_string(), data_uri.clone());
                }

                return Ok(data_uri);
            }
        }
    }

    // ── SingleFlight: evitar descargas concurrentes duplicadas ──
    let mut rx = {
        let mut state = get_state().write();
        if let Some(tx) = state.in_flight.get(url) {
            Some(tx.subscribe())
        } else {
            let (tx, _) = broadcast::channel::<InflightResult>(1);
            state.in_flight.insert(url.to_string(), tx);
            None
        }
    };

    if let Some(ref mut receiver) = rx {
        return match receiver.recv().await {
            Ok(InflightResult::Ok(data_uri)) => Ok(data_uri),
            Ok(InflightResult::Err) => Ok(url.to_string()),
            Err(_) => Ok(url.to_string()),
        };
    }

    // ── Descargar por red, guardar en disco y en RAM ──
    let result = download_and_cache_ram(url, &local_file).await;

    let inflight_msg = match &result {
        Ok(data_uri) => InflightResult::Ok(data_uri.clone()),
        Err(_) => InflightResult::Err,
    };

    {
        let mut state = get_state().write();
        if let Some(tx) = state.in_flight.remove(url) {
            let _ = tx.send(inflight_msg);
        }
    }

    match result {
        Ok(data_uri) => Ok(data_uri),
        Err(_) => Ok(url.to_string()),
    }
}

fn get_max_disk_bytes() -> u64 {
    if let Ok(Some(val)) = crate::storage::get_setting("max_image_cache_mb") {
        if let Ok(mb) = val.parse::<u64>() {
            if mb > 0 {
                return mb * 1024 * 1024;
            }
        }
    }
    L2_MAX_BYTES
}

/// Descarga de red, guarda en disco atómicamente e indexa en RAM (L1) y SQLite (L2)
async fn download_and_cache_ram(url: &str, local_file: &Path) -> AppResult<String> {
    let req = HTTP_CLIENT
        .get(url)
        .header(header::ACCEPT, "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        .header(header::USER_AGENT, "Mozilla/5.0 (compatible; AniCS/1.0)")
        .timeout(std::time::Duration::from_secs(15));

    let resp = req.send().await.map_err(AppError::Network)?;
    if !resp.status().is_success() {
        return Err(AppError::Generic(format!("HTTP {}", resp.status())));
    }

    let mime = resp
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(';').next().unwrap_or("").trim().to_string());

    let bytes = resp.bytes().await.map_err(AppError::Network)?;
    if bytes.len() < 100 {
        return Err(AppError::Generic("Imagen demasiado pequeña".to_string()));
    }

    // 1. Escribir a disco atómicamente
    atomic_write(local_file, &bytes).map_err(AppError::Io)?;

    // 2. Convertir a Data URI
    let data_uri = bytes_to_data_uri(&bytes, mime.as_deref());

    // 3. Indexar en SQLite
    let local_path = local_file.to_string_lossy().to_string();
    let file_size = bytes.len() as u64;
    let _ = upsert_image_cache_entry(url, &local_path, file_size, mime.as_deref());

    // 4. Guardar en L1 RAM
    {
        let mut state = get_state().write();
        state.l1.insert(url.to_string(), data_uri.clone());
    }

    // 5. Poda LRU de disco en segundo plano respetando el límite configurado
    let max_bytes = get_max_disk_bytes();
    tokio::spawn(async move {
        let _ = prune_image_cache_lru(max_bytes);
    });

    Ok(data_uri)
}

/// Obtiene un lote de imágenes y retorna un Map `{ [url]: data_uri }` directamente en memoria
pub async fn get_cached_images_batch(
    urls: Vec<String>,
    app_handle: &AppHandle,
) -> HashMap<String, String> {
    const MAX_CONCURRENT: usize = 8;
    let semaphore = Arc::new(tokio::sync::Semaphore::new(MAX_CONCURRENT));
    let mut results = HashMap::with_capacity(urls.len());
    let mut to_fetch = Vec::new();

    // 1. Hit directo en L1 RAM (0ms)
    {
        let mut state = get_state().write();
        for url in &urls {
            if let Some(data_uri) = state.l1.get(url) {
                results.insert(url.clone(), data_uri);
            } else if url.starts_with("http") {
                to_fetch.push(url.clone());
            }
        }
    }

    // 2. Resolver los faltantes en paralelo
    let mut handles = Vec::with_capacity(to_fetch.len());
    for url in to_fetch {
        let sem = semaphore.clone();
        let handle = app_handle.clone();
        let task = tokio::spawn(async move {
            let _permit = sem.acquire().await;
            let res = get_cached_image(&url, &handle).await;
            (url, res)
        });
        handles.push(task);
    }

    for h in handles {
        if let Ok((url, Ok(data_uri))) = h.await {
            if data_uri.starts_with("data:") {
                results.insert(url, data_uri);
            }
        }
    }

    results
}

// ─────────────────────────────────────────────────────────────────────────────
// Precalentamiento al inicio (Background)
// ─────────────────────────────────────────────────────────────────────────────

/// Precarga a RAM las N imágenes más frecuentes desde el disco/SQLite
pub async fn warmup_image_cache(_app_handle: &AppHandle) {
    if let Ok(entries) = get_top_frequent_cached_images(WARMUP_TOP_N) {
        let mut loaded = 0usize;
        for entry in entries {
            let path = Path::new(&entry.file_path);
            if path.exists() {
                if let Ok(bytes) = fs::read(path) {
                    if bytes.len() > 100 {
                        let data_uri = bytes_to_data_uri(&bytes, entry.mime_type.as_deref());
                        let mut state = get_state().write();
                        state.l1.insert(entry.url, data_uri);
                        loaded += 1;
                    }
                }
            }
        }
        log::info!("[ImageCache] Warmup: {} imágenes cargadas a RAM (L1)", loaded);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estadísticas y Limpieza
// ─────────────────────────────────────────────────────────────────────────────

pub fn get_cache_stats(_app_handle: &AppHandle) -> AppResult<(u64, usize)> {
    crate::storage::get_image_cache_stats_db()
}

pub fn clear_image_cache(_app_handle: &AppHandle) -> AppResult<u64> {
    {
        let mut state = get_state().write();
        state.l1.clear();
    }

    let paths = crate::storage::clear_all_image_cache_db()?;
    let mut freed = 0u64;
    for path in paths {
        let p = Path::new(&path);
        if p.exists() {
            if let Ok(meta) = fs::metadata(p) {
                freed += meta.len();
            }
            let _ = fs::remove_file(p);
        }
    }

    Ok(freed)
}
