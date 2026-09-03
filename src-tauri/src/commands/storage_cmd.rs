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

/// Insertar o actualizar un lote de entradas de historial en una única transacción SQLite
#[tauri::command]
pub async fn batch_upsert_history(
    entries: Vec<HistoryEntry>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::batch_upsert_history(&entries).map_err(|e| e.to_string())
}

/// Obtener historial paginado (opcionalmente por perfil)
#[tauri::command]
pub async fn get_history(
    limit: Option<u32>,
    offset: Option<u32>,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, String> {
    storage::get_history(limit.unwrap_or(50), offset.unwrap_or(0), profile_id.as_deref())
        .map_err(|e| e.to_string())
}

/// Obtener todo el historial para exportación / sync
#[tauri::command]
pub async fn get_all_history(
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, String> {
    storage::get_all_history(profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Obtener progreso de reproducción de un episodio
#[tauri::command]
pub async fn get_episode_progress(
    episode_url: String,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Option<f64>, String> {
    storage::get_episode_progress(&episode_url, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Limpiar todo el historial de un perfil o del activo
#[tauri::command]
pub async fn clear_history(
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::clear_history(profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Eliminar un elemento individual del historial
#[tauri::command]
pub async fn remove_history(
    id: String,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_history(&id).map_err(|e| e.to_string())
}

/// Eliminar múltiples elementos del historial por ID (selección masiva)
#[tauri::command]
pub async fn remove_history_batch(
    ids: Vec<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_history_batch(&ids).map_err(|e| e.to_string())
}

/// Eliminar todo el historial de un anime específico
#[tauri::command]
pub async fn remove_history_by_anime(
    anime_url: String,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_history_by_anime(&anime_url, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Agregar a favoritos (opcionalmente por perfil y estado)
#[tauri::command]
pub async fn add_favorite(
    anime: AnimeResult,
    profile_id: Option<String>,
    status: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::add_favorite(&anime, profile_id.as_deref(), status.as_deref()).map_err(|e| e.to_string())
}

/// Agregar múltiples animes a favoritos en lote dentro de una única transacción SQLite
#[tauri::command]
pub async fn batch_add_favorites(
    favorites: Vec<AnimeResult>,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::batch_add_favorites(&favorites, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Actualizar el estado de seguimiento de un favorito
#[tauri::command]
pub async fn update_favorite_status(
    url: String,
    status: String,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::update_favorite_status(&url, &status, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Eliminar de favoritos (opcionalmente por perfil)
#[tauri::command]
pub async fn remove_favorite(
    url: String,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<(), String> {
    storage::remove_favorite(&url, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Verificar si un anime está en favoritos
#[tauri::command]
pub async fn is_favorite(
    url: String,
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<bool, String> {
    storage::is_favorite(&url, profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Obtener lista de favoritos
#[tauri::command]
pub async fn get_favorites(
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<AnimeResult>, String> {
    storage::get_favorites(profile_id.as_deref()).map_err(|e| e.to_string())
}

/// Obtener todos los favoritos para sync
#[tauri::command]
pub async fn get_all_favorites_for_sync(
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<AnimeResult>, String> {
    storage::get_all_favorites_for_sync(profile_id.as_deref()).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────
// Perfiles de Usuario
// ──────────────────────────────────────────

#[tauri::command]
pub async fn get_all_profiles(_state: State<'_, AppState>) -> Result<Vec<UserProfile>, String> {
    storage::get_all_profiles().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_profile(_state: State<'_, AppState>) -> Result<UserProfile, String> {
    storage::get_active_profile().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_profile(profile: UserProfile, _state: State<'_, AppState>) -> Result<(), String> {
    storage::upsert_profile(&profile).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_active_profile(id: String, _state: State<'_, AppState>) -> Result<(), String> {
    storage::set_active_profile(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_profile(id: String, _state: State<'_, AppState>) -> Result<(), String> {
    storage::delete_profile(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_profile_stats(
    profile_id: Option<String>,
    _state: State<'_, AppState>,
) -> Result<storage::ProfileStats, String> {
    storage::get_profile_stats(profile_id.as_deref()).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────
// Almacenamiento Seguro (Keyring / Token)
// ──────────────────────────────────────────

#[tauri::command]
pub async fn save_secure_token(key: String, token: String) -> Result<(), String> {
    storage::set_secure_secret(&key, &token).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_secure_token(key: String) -> Result<Option<String>, String> {
    storage::get_secure_secret(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_secure_token(key: String) -> Result<(), String> {
    storage::delete_secure_secret(&key).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────
// Sync Config & Tombstones
// ──────────────────────────────────────────

#[tauri::command]
pub async fn get_sync_config(key: String, _state: State<'_, AppState>) -> Result<Option<String>, String> {
    storage::get_sync_config(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_sync_config(key: String, value: String, _state: State<'_, AppState>) -> Result<(), String> {
    storage::set_sync_config(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_sync_config(_state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    storage::get_all_sync_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tombstones(_state: State<'_, AppState>) -> Result<Vec<TombstoneItem>, String> {
    storage::get_tombstones().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tombstone(entity_type: String, entity_id: String, profile_id: String, _state: State<'_, AppState>) -> Result<(), String> {
    storage::add_tombstone(&entity_type, &entity_id, &profile_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_old_tombstones(days: Option<i64>, _state: State<'_, AppState>) -> Result<(), String> {
    storage::cleanup_old_tombstones(days.unwrap_or(30)).map_err(|e| e.to_string())
}

// ──────────────────────────────────────────
// Ajustes generales
// ──────────────────────────────────────────

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

/// Obtener estadísticas y tamaño de la base de datos SQLite
#[tauri::command]
pub async fn get_database_stats(app_handle: tauri::AppHandle) -> Result<storage::DatabaseStats, String> {
    use tauri::Manager;
    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    storage::get_database_stats(&app_data_dir).map_err(|e| e.to_string())
}

/// Optimiza y compacta SQLite (VACUUM) recuperando espacio sin borrar datos
#[tauri::command]
pub async fn optimize_database() -> Result<(), String> {
    storage::optimize_database().map_err(|e| e.to_string())
}

/// Restablece de forma segura las tablas de SQLite sin romper la aplicación
#[tauri::command]
pub async fn reset_database() -> Result<(), String> {
    storage::reset_database().map_err(|e| e.to_string())
}

