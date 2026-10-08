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

fn wrap_proxied_stream_if_needed(media: &mut ResolvedMedia) {
    if media.direct_url.starts_with("http://127.0.0.1") || media.direct_url.starts_with("http://localhost") {
        return;
    }
    let needs_proxy = media.media_type == MediaType::Mp4 && (
        media.referer.is_some()
        || media.direct_url.contains("mp4upload.com")
        || media.direct_url.contains("cloudwindow-route.com")
    );
    if needs_proxy {
        let referer = media.referer.as_deref();
        media.direct_url = crate::downloader::media_server::get_proxied_stream_url(
            &media.direct_url,
            referer,
        );
    }
}

/// Resolver un servidor de video a URL directa (HLS/MP4)
#[tauri::command]
pub async fn resolve_stream(
    server: VideoServer,
    source: String,
    _state: State<'_, AppState>,
) -> Result<ResolvedMedia, String> {
    let mut media = if let Some(extractor) = create_extractor(&source) {
        extractor.resolve_stream(&server).await.map_err(|e| e.to_string())?
    } else {
        anics_core::extractors::resolve_server(&server)
            .await
            .map_err(|e| e.to_string())?
    };
    wrap_proxied_stream_if_needed(&mut media);
    Ok(media)
}

/// Resolver directamente un servidor usando el motor de extractores nativo en Rust
#[tauri::command]
pub async fn resolve_stream_native(
    server: VideoServer,
) -> Result<ResolvedMedia, String> {
    let mut media = anics_core::extractors::resolve_server(&server)
        .await
        .map_err(|e| e.to_string())?;
    wrap_proxied_stream_if_needed(&mut media);
    Ok(media)
}

/// Obtener lista de servidores con soporte en el motor nativo de Rust
#[tauri::command]
pub fn get_supported_extractor_hosts() -> Vec<String> {
    anics_core::extractors::supported_hosts()
        .into_iter()
        .map(|s| s.to_string())
        .collect()
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

/// Obtiene el puerto asignado al servidor local de streaming y auth
#[tauri::command]
pub fn get_local_server_port() -> u16 {
    crate::downloader::media_server::get_server_port()
}

/// Abre una URL de stream directamente en un reproductor externo (MPV, VLC)
#[tauri::command]
pub fn open_in_external_player(stream_url: String, player_path: Option<String>) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let exe = player_path
            .filter(|p| !p.trim().is_empty())
            .unwrap_or_else(|| "mpv".to_string());

        std::process::Command::new(exe)
            .arg(stream_url)
            .spawn()
            .map_err(|e| format!("Error iniciando reproductor externo: {}", e))?;
    }
    #[cfg(not(desktop))]
    {
        let _ = (stream_url, player_path);
    }
    Ok(())
}


