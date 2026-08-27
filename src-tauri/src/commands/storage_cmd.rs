use tauri::State;
use std::collections::HashMap;

use crate::core::*;
use crate::storage;
use crate::AppState;

/// Insertar o actualizar una entrada de historial (con progreso de reproducción)
#[tauri::command]
pub async fn upsert_history(
    entry: HistoryEntry,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::upsert_history(&entry).map_err(|e| e.to_string())
}

/// Obtener historial paginado
#[tauri::command]
pub async fn get_history(
    limit: Option<u32>,
    offset: Option<u32>,
    _state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, String> {
    storage::get_history(limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

/// Obtener progreso de reproducción de un episodio
#[tauri::command]
pub async fn get_episode_progress(
    episode_url: String,
    _state: State<'_, AppState>,
) -> Result<Option<f64>, String> {
    storage::get_episode_progress(&episode_url).map_err(|e| e.to_string())
}

/// Limpiar todo el historial
#[tauri::command]
pub async fn clear_history(_state: State<'_, AppState>) -> Result<(), String> {
    storage::clear_history().map_err(|e| e.to_string())
}

/// Agregar a favoritos
#[tauri::command]
pub async fn add_favorite(
    anime: AnimeResult,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::add_favorite(&anime).map_err(|e| e.to_string())
}

/// Eliminar de favoritos
#[tauri::command]
pub async fn remove_favorite(
    url: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_favorite(&url).map_err(|e| e.to_string())
}

/// Verificar si un anime está en favoritos
#[tauri::command]
pub async fn is_favorite(
    url: String,
    _state: State<'_, AppState>,
) -> Result<bool, String> {
    storage::is_favorite(&url).map_err(|e| e.to_string())
}

/// Obtener lista de favoritos
#[tauri::command]
pub async fn get_favorites(_state: State<'_, AppState>) -> Result<Vec<AnimeResult>, String> {
    storage::get_favorites().map_err(|e| e.to_string())
}

/// Obtener valor de un ajuste/configuración
#[tauri::command]
pub async fn get_setting(key: String, _state: State<'_, AppState>) -> Result<Option<String>, String> {
    storage::get_setting(&key).map_err(|e| e.to_string())
}

/// Guardar valor de un ajuste/configuración
#[tauri::command]
pub async fn set_setting(key: String, value: String, _state: State<'_, AppState>) -> Result<(), String> {
    storage::set_setting(&key, &value).map_err(|e| e.to_string())
}

/// Obtener todos los ajustes como mapa
#[tauri::command]
pub async fn get_all_settings(_state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    storage::get_all_settings().map_err(|e| e.to_string())
}
