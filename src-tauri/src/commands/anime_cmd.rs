use tauri::State;

use crate::core::*;
use crate::scrapers::{all_extractors, create_extractor};
use crate::AppState;

/// Buscar anime en uno o todos los extractores
#[tauri::command]
pub async fn search_anime(
    query: String,
    source: Option<String>,
    _state: State<'_, AppState>,
) -> Result<Vec<AnimeResult>, String> {
    match source {
        Some(src) => {
            let extractor = create_extractor(&src)
                .ok_or_else(|| format!("Unknown source: {src}"))?;
            extractor.search(&query).await.map_err(|e| e.to_string())
        }
        None => {
            // Buscar en todos los extractores de forma concurrente
            let extractors = all_extractors();
            let mut handles = vec![];

            for ext in extractors {
                let q = query.clone();
                handles.push(tokio::spawn(async move {
                    ext.search(&q).await.unwrap_or_default()
                }));
            }

            let mut all_results = vec![];
            for handle in handles {
                if let Ok(results) = handle.await {
                    all_results.extend(results);
                }
            }
            Ok(all_results)
        }
    }
}

/// Obtener últimos episodios
#[tauri::command]
pub async fn get_latest(
    source: String,
    page: Option<u32>,
    _state: State<'_, AppState>,
) -> Result<Vec<AnimeResult>, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.get_latest(page.unwrap_or(1)).await.map_err(|e| e.to_string())
}

/// Obtener horario semanal
#[tauri::command]
pub async fn get_schedule(
    source: String,
    _state: State<'_, AppState>,
) -> Result<Vec<AnimeResult>, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.get_schedule().await.map_err(|e| e.to_string())
}

/// Obtener detalles completos de una serie (incluyendo lista de episodios)
#[tauri::command]
pub async fn get_details(
    url: String,
    source: String,
    _state: State<'_, AppState>,
) -> Result<AnimeDetails, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.get_details(&url).await.map_err(|e| e.to_string())
}

/// Búsqueda avanzada con filtros
#[tauri::command]
pub async fn advanced_search(
    filters: SearchFilters,
    source: String,
    _state: State<'_, AppState>,
) -> Result<SearchResultPage, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.advanced_search(&filters).await.map_err(|e| e.to_string())
}

/// Obtener lista de géneros disponibles en una fuente
#[tauri::command]
pub async fn get_genres(
    source: String,
    _state: State<'_, AppState>,
) -> Result<Vec<GenreItem>, String> {
    let extractor = create_extractor(&source)
        .ok_or_else(|| format!("Unknown source: {source}"))?;
    extractor.get_genres().await.map_err(|e| e.to_string())
}

/// Obtener lista de extractores disponibles
#[tauri::command]
pub fn get_sources() -> Vec<serde_json::Value> {
    all_extractors()
        .iter()
        .map(|e| {
            serde_json::json!({
                "id": e.id(),
                "name": e.name(),
                "baseUrl": e.base_url(),
            })
        })
        .collect()
}
