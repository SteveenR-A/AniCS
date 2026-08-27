use tauri::State;

use crate::core::*;
use crate::scrapers::create_extractor;
use crate::AppState;

/// Obtener servidores de video disponibles para un episodio
#[tauri::command]
pub async fn get_servers(
    episode_url: String,
    source: String,
    _state: State<'_, AppState>,
) -> Result<Vec<VideoServer>, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.get_servers(&episode_url).await.map_err(|e| e.to_string())
}

/// Resolver un servidor de video a URL directa (HLS/MP4)
#[tauri::command]
pub async fn resolve_stream(
    server: VideoServer,
    source: String,
    _state: State<'_, AppState>,
) -> Result<ResolvedMedia, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.resolve_stream(&server).await.map_err(|e| e.to_string())
}

/// Detectar tipo de media de una URL (sin descargarla)
#[tauri::command]
pub fn detect_media_type(url: String) -> String {
    let path = url.split('?').next().unwrap_or(&url).to_lowercase();
    if path.contains(".m3u8") {
        "hls".to_string()
    } else if path.contains(".mp4") || path.contains(".mkv") {
        "mp4".to_string()
    } else {
        "unknown".to_string()
    }
}
