use tauri::State;

use crate::core::*;
use crate::scrapers::create_extractor;
use crate::AppState;

/// Report missing Linux media plugins before starting a pipeline that cannot decode MP4/MSE.
/// Other platforms use their native media stack and need no GStreamer checks.
#[tauri::command]
pub async fn get_playback_dependency_error() -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        tauri::async_runtime::spawn_blocking(|| {
            let mut missing = Vec::new();
            for plugin in ["qtdemux", "h264parse", "aacparse"] {
                let output = match std::process::Command::new("gst-inspect-1.0").arg(plugin).output() {
                    Ok(output) => output,
                    // An absent diagnostic tool does not prove playback is unavailable.
                    Err(_) => return None,
                };
                if !output.status.success() { missing.push(plugin); }
            }
            if missing.is_empty() { return None; }
            let installation = if std::path::Path::new("/usr/bin/pacman").exists() {
                "sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav"
            } else if std::path::Path::new("/usr/bin/apt-get").exists() {
                "sudo apt-get install gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav"
            } else {
                "Instala los plugins base, good, bad y libav de GStreamer con el gestor de paquetes de tu distribución."
            };
            Some(format!("Faltan componentes de video de Linux: {}. Instala las dependencias y reinicia AniCS.\n{}", missing.join(", "), installation))
        }).await.map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "linux"))]
    { Ok(None) }
}

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
    // Keep Android's remote HLS URLs available to its native casting integrations.
    let needs_proxy = (cfg!(desktop) && media.media_type == MediaType::Hls) || (media.media_type == MediaType::Mp4 && (
        media.referer.is_some()
        || media.direct_url.contains("mp4upload.com")
        || media.direct_url.contains("cloudwindow-route.com")
    ));
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
        tokio::time::timeout(std::time::Duration::from_secs(25), extractor.resolve_stream(&server))
            .await.map_err(|_| "El servidor tardó demasiado en responder. Prueba otro servidor.".to_string())?
            .map_err(|e| e.to_string())?
    } else {
        tokio::time::timeout(std::time::Duration::from_secs(25), anics_core::extractors::resolve_server(&server))
            .await.map_err(|_| "El servidor tardó demasiado en responder. Prueba otro servidor.".to_string())?
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
    let mut media = tokio::time::timeout(std::time::Duration::from_secs(25), anics_core::extractors::resolve_server(&server))
        .await.map_err(|_| "El servidor tardó demasiado en responder. Prueba otro servidor.".to_string())?
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


