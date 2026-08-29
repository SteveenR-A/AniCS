use rusqlite::{Connection, params, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::OnceCell;
use std::collections::HashMap;

use crate::core::*;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_database_inner(app_data_dir: &PathBuf) -> AppResult<Connection> {
    let db_path = app_data_dir.join("anics.db");
    let conn = Connection::open(db_path).map_err(AppError::Database)?;

    // Pragmas de rendimiento
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA temp_store=memory;
    ").map_err(AppError::Database)?;

    // Crear tablas
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS watch_history (
            id TEXT PRIMARY KEY,
            anime_title TEXT NOT NULL,
            anime_url TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL DEFAULT '',
            episode_number INTEGER NOT NULL,
            episode_url TEXT NOT NULL,
            watch_progress REAL NOT NULL DEFAULT 0.0,
            watched_at TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'jkanime'
        );

        CREATE TABLE IF NOT EXISTS favorites (
            url TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL,
            added_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS downloads (
            id TEXT PRIMARY KEY,
            anime_title TEXT NOT NULL,
            episode_number INTEGER NOT NULL,
            stream_url TEXT NOT NULL,
            referer TEXT,
            output_path TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued',
            progress REAL NOT NULL DEFAULT 0.0,
            downloaded_bytes INTEGER NOT NULL DEFAULT 0,
            error TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS image_cache (
            url TEXT PRIMARY KEY,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            mime_type TEXT,
            access_count INTEGER NOT NULL DEFAULT 1,
            last_accessed_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_history_anime_url ON watch_history(anime_url);
        CREATE INDEX IF NOT EXISTS idx_history_watched_at ON watch_history(watched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed ON image_cache(last_accessed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_image_cache_access_count ON image_cache(access_count DESC);
    ").map_err(AppError::Database)?;

    Ok(conn)
}

pub fn init_database(app_data_dir: PathBuf) -> AppResult<()> {
    let conn = init_database_inner(&app_data_dir)?;
    DB.set(Mutex::new(conn))
        .map_err(|_| AppError::Generic("Database already initialized".to_string()))?;

    Ok(())
}

fn with_db<F, T>(f: F) -> AppResult<T>
where
    F: FnOnce(&Connection) -> rusqlite::Result<T>,
{
    let db = DB.get().ok_or_else(|| AppError::Generic("DB not initialized".to_string()))?;
    let conn = db.lock().map_err(|_| AppError::Generic("DB lock poisoned".to_string()))?;
    f(&conn).map_err(AppError::Database)
}

// ──────────────────────────────────────────
// Configuración / Ajustes (Settings)
// ──────────────────────────────────────────

pub fn get_setting(key: &str) -> AppResult<Option<String>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let res = stmt.query_row(params![key], |row| row.get(0)).optional()?;
        Ok(res)
    })
}

pub fn set_setting(key: &str, value: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    })
}

pub fn get_all_settings() -> AppResult<HashMap<String, String>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut map = HashMap::new();
        for r in rows.flatten() {
            map.insert(r.0, r.1);
        }
        Ok(map)
    })
}

// ──────────────────────────────────────────
// Historial
// ──────────────────────────────────────────

pub fn upsert_history(entry: &HistoryEntry) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO watch_history (id, anime_title, anime_url, thumbnail_url, episode_number, episode_url, watch_progress, watched_at, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
               watch_progress = excluded.watch_progress,
               watched_at = excluded.watched_at",
            params![
                entry.id, entry.anime_title, entry.anime_url, entry.thumbnail_url,
                entry.episode_number, entry.episode_url, entry.watch_progress,
                entry.watched_at, entry.source
            ],
        )?;
        Ok(())
    })
}

pub fn get_history(limit: u32, offset: u32) -> AppResult<Vec<HistoryEntry>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, anime_title, anime_url, thumbnail_url, episode_number, episode_url,
                    watch_progress, watched_at, source
             FROM watch_history
             ORDER BY watched_at DESC
             LIMIT ?1 OFFSET ?2"
        )?;

        let entries = stmt.query_map(params![limit, offset], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                anime_title: row.get(1)?,
                anime_url: row.get(2)?,
                thumbnail_url: row.get(3)?,
                episode_number: row.get(4)?,
                episode_url: row.get(5)?,
                watch_progress: row.get(6)?,
                watched_at: row.get(7)?,
                source: row.get(8)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(entries)
    })
}

pub fn get_episode_progress(episode_url: &str) -> AppResult<Option<f64>> {
    with_db(|conn| {
        // Generar todas las variantes de la ruta para máxima compatibilidad Windows
        let fwd = episode_url.replace('\\', "/");          // forward slashes
        let bwd = episode_url.replace('/', "\\");          // backward slashes
        let fwd_lower = fwd.to_lowercase();                // minúsculas + forward
        let bwd_lower = bwd.to_lowercase();                // minúsculas + backward
        let original_lower = episode_url.to_lowercase();  // minúsculas original

        let mut stmt = conn.prepare(
            "SELECT watch_progress FROM watch_history
             WHERE episode_url = ?1
                OR episode_url = ?2
                OR episode_url = ?3
                OR episode_url = ?4
                OR episode_url = ?5
                OR episode_url = ?6
             ORDER BY watched_at DESC
             LIMIT 1"
        )?;
        let progress = stmt.query_row(
            params![episode_url, fwd, bwd, fwd_lower, bwd_lower, original_lower],
            |row| row.get(0)
        ).optional()?;
        Ok(progress)
    })
}

pub fn clear_history() -> AppResult<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM watch_history", [])?;
        Ok(())
    })
}

// ──────────────────────────────────────────
// Favoritos
// ──────────────────────────────────────────

pub fn add_favorite(result: &AnimeResult) -> AppResult<()> {
    with_db(|conn| {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO favorites (url, title, thumbnail_url, source, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![result.url, result.title, result.thumbnail_url, result.source, now],
        )?;
        Ok(())
    })
}

pub fn remove_favorite(url: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM favorites WHERE url = ?1", params![url])?;
        Ok(())
    })
}

pub fn is_favorite(url: &str) -> AppResult<bool> {
    with_db(|conn| {
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE url = ?1",
            params![url],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

pub fn get_favorites() -> AppResult<Vec<AnimeResult>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT url, title, thumbnail_url, source FROM favorites ORDER BY added_at DESC"
        )?;
        let results = stmt.query_map([], |row| {
            Ok(AnimeResult {
                url: row.get(0)?,
                title: row.get(1)?,
                thumbnail_url: row.get(2)?,
                source: row.get(3)?,
                ..Default::default()
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(results)
    })
}

// ──────────────────────────────────────────
// Caché de Imágenes
// ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ImageCacheEntry {
    pub url: String,
    pub file_path: String,
    pub file_size: u64,
    pub mime_type: Option<String>,
    pub access_count: u64,
    pub last_accessed_at: String,
    pub created_at: String,
}

/// Inserta o actualiza una entrada en la caché de imágenes
pub fn upsert_image_cache_entry(
    url: &str,
    file_path: &str,
    file_size: u64,
    mime_type: Option<&str>,
) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    with_db(|conn| {
        conn.execute(
            "INSERT INTO image_cache (url, file_path, file_size, mime_type, access_count, last_accessed_at, created_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
             ON CONFLICT(url) DO UPDATE SET
               file_path = excluded.file_path,
               file_size = excluded.file_size,
               mime_type = excluded.mime_type,
               access_count = access_count + 1,
               last_accessed_at = excluded.last_accessed_at",
            params![url, file_path, file_size as i64, mime_type, now],
        )?;
        Ok(())
    })
}

/// Actualiza solo el timestamp y contador de acceso sin re-escribir la ruta
pub fn touch_image_cache(url: &str) -> AppResult<()> {
    let now = chrono::Utc::now().to_rfc3339();
    with_db(|conn| {
        conn.execute(
            "UPDATE image_cache SET access_count = access_count + 1, last_accessed_at = ?1 WHERE url = ?2",
            params![now, url],
        )?;
        Ok(())
    })
}

/// Obtiene una entrada de caché de imágenes por URL (sin tocar el disco)
pub fn get_image_cache_entry(url: &str) -> AppResult<Option<ImageCacheEntry>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT url, file_path, file_size, mime_type, access_count, last_accessed_at, created_at
             FROM image_cache WHERE url = ?1"
        )?;
        let entry = stmt.query_row(params![url], |row| {
            Ok(ImageCacheEntry {
                url: row.get(0)?,
                file_path: row.get(1)?,
                file_size: row.get::<_, i64>(2)? as u64,
                mime_type: row.get(3)?,
                access_count: row.get::<_, i64>(4)? as u64,
                last_accessed_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        }).optional()?;
        Ok(entry)
    })
}

/// Obtiene las N imágenes más frecuentemente accedidas (para precalentamiento de RAM al inicio)
pub fn get_top_frequent_cached_images(limit: u32) -> AppResult<Vec<ImageCacheEntry>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT url, file_path, file_size, mime_type, access_count, last_accessed_at, created_at
             FROM image_cache
             ORDER BY access_count DESC, last_accessed_at DESC
             LIMIT ?1"
        )?;
        let entries = stmt.query_map(params![limit], |row| {
            Ok(ImageCacheEntry {
                url: row.get(0)?,
                file_path: row.get(1)?,
                file_size: row.get::<_, i64>(2)? as u64,
                mime_type: row.get(3)?,
                access_count: row.get::<_, i64>(4)? as u64,
                last_accessed_at: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(entries)
    })
}

/// Estadísticas de caché directamente desde SQLite (sin tocar el disco)
pub fn get_image_cache_stats_db() -> AppResult<(u64, usize)> {
    with_db(|conn| {
        let (total_bytes, count): (i64, i64) = conn.query_row(
            "SELECT COALESCE(SUM(file_size), 0), COUNT(*) FROM image_cache",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok((total_bytes as u64, count as usize))
    })
}

/// Limpia entradas LRU de la caché hasta que el tamaño total esté bajo `target_max_bytes`.
/// Retorna las rutas de archivos a borrar en disco.
pub fn prune_image_cache_lru(target_max_bytes: u64) -> AppResult<Vec<String>> {
    with_db(|conn| {
        // Verificar si ya estamos bajo el límite
        let total: i64 = conn.query_row(
            "SELECT COALESCE(SUM(file_size), 0) FROM image_cache",
            [],
            |row| row.get(0),
        )?;
        if total as u64 <= target_max_bytes {
            return Ok(vec![]);
        }

        // Obtener candidatos LRU a eliminar (menos accedidos y más viejos primero)
        let mut stmt = conn.prepare(
            "SELECT url, file_path, file_size FROM image_cache
             ORDER BY last_accessed_at ASC, access_count ASC"
        )?;
        let rows: Vec<(String, String, i64)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .filter_map(|r| r.ok())
            .collect();

        let mut freed = 0i64;
        let to_free = total - target_max_bytes as i64;
        let mut paths_to_delete = Vec::new();
        let mut urls_to_delete = Vec::new();

        for (url, path, size) in rows {
            if freed >= to_free {
                break;
            }
            freed += size;
            paths_to_delete.push(path);
            urls_to_delete.push(url);
        }

        // Eliminar de SQLite
        for url in &urls_to_delete {
            conn.execute("DELETE FROM image_cache WHERE url = ?1", params![url])?;
        }

        Ok(paths_to_delete)
    })
}

/// Elimina todas las entradas de image_cache en SQLite. Retorna las rutas a borrar en disco.
pub fn clear_all_image_cache_db() -> AppResult<Vec<String>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT file_path FROM image_cache")?;
        let paths: Vec<String> = stmt
            .query_map([], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        conn.execute("DELETE FROM image_cache", [])?;
        Ok(paths)
    })
}

// ──────────────────────────────────────────
// Estadísticas y Mantenimiento Seguro de DB
// ──────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStats {
    pub history_count: u32,
    pub favorites_count: u32,
    pub downloads_count: u32,
    pub cached_images_count: u32,
    pub database_size_bytes: u64,
    pub database_size_formatted: String,
}

fn format_db_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

pub fn save_download_task(task: &crate::core::anime::DownloadTask) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO downloads (id, anime_title, episode_number, stream_url, referer, output_path, status, progress, downloaded_bytes, error, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                progress = excluded.progress,
                downloaded_bytes = excluded.downloaded_bytes,
                error = excluded.error",
            params![
                task.id,
                task.anime_title,
                task.episode_number,
                task.episode_url,
                task.server_name, // Map server_name to something or use stream_url. The schema has stream_url. We will use episode_url as stream_url? Wait, the schema has `stream_url` TEXT NOT NULL. The struct has `server_name` and `episode_url`.
                task.file_path, // Map to output_path.
                format!("{:?}", task.status).to_lowercase(),
                task.progress,
                task.downloaded_bytes,
                task.error_message,
                task.created_at
            ],
        )?;
        Ok(())
    })
}

pub fn update_download_progress_db(id: &str, status: &str, progress: f32, downloaded: u64, error: Option<&str>) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE downloads SET status = ?1, progress = ?2, downloaded_bytes = ?3, error = ?4 WHERE id = ?5",
            params![status, progress, downloaded, error, id],
        )?;
        Ok(())
    })
}

pub fn get_all_downloads_db() -> AppResult<Vec<crate::core::anime::DownloadTask>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, anime_title, episode_number, stream_url, referer, output_path, status, progress, downloaded_bytes, error, created_at FROM downloads ORDER BY created_at DESC"
        )?;
        let tasks = stmt.query_map([], |row| {
            let status_str: String = row.get(6)?;
            let status = match status_str.as_str() {
                "queued" => crate::core::anime::DownloadStatus::Queued,
                "downloading" => crate::core::anime::DownloadStatus::Downloading,
                "paused" => crate::core::anime::DownloadStatus::Paused,
                "completed" => crate::core::anime::DownloadStatus::Completed,
                "failed" => crate::core::anime::DownloadStatus::Failed,
                "canceled" => crate::core::anime::DownloadStatus::Canceled,
                _ => crate::core::anime::DownloadStatus::Failed,
            };

            Ok(crate::core::anime::DownloadTask {
                id: row.get(0)?,
                anime_title: row.get(1)?,
                episode_number: row.get(2)?,
                episode_url: row.get(3)?,
                server_name: row.get(4).unwrap_or_default(), // We used referer as server_name temporarily or just default
                file_path: row.get(5)?,
                total_bytes: None, // We don't store total_bytes yet
                downloaded_bytes: row.get(8)?,
                progress: row.get(7)?,
                speed_bytes_per_sec: 0,
                status,
                error_message: row.get(9)?,
                created_at: row.get(10)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(tasks)
    })
}

pub fn delete_download_task_db(id: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn mark_active_downloads_as_paused_db() -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE downloads SET status = 'paused' WHERE status = 'downloading' OR status = 'queued'",
            [],
        )?;
        Ok(())
    })
}

pub fn get_database_stats(app_data_dir: &std::path::Path) -> AppResult<DatabaseStats> {
    let db_path = app_data_dir.join("anics.db");
    let database_size_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    with_db(|conn| {
        let history_count: u32 = conn.query_row("SELECT COUNT(*) FROM watch_history", [], |r| r.get(0)).unwrap_or(0);
        let favorites_count: u32 = conn.query_row("SELECT COUNT(*) FROM favorites", [], |r| r.get(0)).unwrap_or(0);
        let downloads_count: u32 = conn.query_row("SELECT COUNT(*) FROM downloads", [], |r| r.get(0)).unwrap_or(0);
        let cached_images_count: u32 = conn.query_row("SELECT COUNT(*) FROM image_cache", [], |r| r.get(0)).unwrap_or(0);

        Ok(DatabaseStats {
            history_count,
            favorites_count,
            downloads_count,
            cached_images_count,
            database_size_bytes,
            database_size_formatted: format_db_size(database_size_bytes),
        })
    })
}

/// Optimiza y compacta SQLite (VACUUM + PRAGMA optimize) recuperando espacio sin perder datos
pub fn optimize_database() -> AppResult<()> {
    with_db(|conn| {
        conn.execute_batch("
            PRAGMA optimize;
            VACUUM;
        ")?;
        Ok(())
    })
}

/// Restablece de forma segura las tablas de SQLite sin romper el archivo ni la integridad
pub fn reset_database() -> AppResult<()> {
    with_db(|conn| {
        conn.execute_batch("
            DELETE FROM watch_history;
            DELETE FROM favorites;
            DELETE FROM downloads;
            DELETE FROM image_cache;
            VACUUM;
        ")?;
        Ok(())
    })
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn get_unique_id() -> String {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_micros()
            .to_string()
    }

    #[test]
    fn test_init_database_inner() {
        let base_temp_dir = env::temp_dir();

        // 1. Error Case: use an invalid path that cannot possibly be created or written to
        let file_path = base_temp_dir.join(format!("anics_test_file_{}", get_unique_id()));
        fs::write(&file_path, "dummy content").unwrap();

        // Use init_database_inner to avoid setting global DB OnceCell
        let result_err = init_database_inner(&file_path);
        assert!(result_err.is_err(), "init_database_inner should fail with invalid path (file as directory)");
        let _ = fs::remove_file(&file_path);

        // 2. Success Case: Initial creation in a valid temporary directory
        let mut valid_dir = base_temp_dir.clone();
        valid_dir.push(format!("anics_test_db_{}", get_unique_id()));
        fs::create_dir_all(&valid_dir).unwrap();

        {
            let conn = init_database_inner(&valid_dir).expect("init_database_inner should succeed");
            let db_path = valid_dir.join("anics.db");
            assert!(db_path.exists(), "Database file should be created");

            let tables_count: u32 = conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0)
            ).unwrap();
            assert!(tables_count >= 4, "Should create required tables");

            // Connection is closed when conn is dropped at the end of this block, releasing the file lock on Windows
        }

        // Cleanup
        let _ = fs::remove_dir_all(valid_dir);
    }
}
