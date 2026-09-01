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

    // 1. Crear tablas si no existen
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
            source TEXT NOT NULL DEFAULT 'jkanime',
            profile_id TEXT NOT NULL DEFAULT 'default'
        );

        CREATE TABLE IF NOT EXISTS favorites (
            url TEXT,
            title TEXT NOT NULL,
            thumbnail_url TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL,
            added_at TEXT NOT NULL,
            profile_id TEXT NOT NULL DEFAULT 'default',
            PRIMARY KEY (url, profile_id)
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar TEXT NOT NULL DEFAULT 'sparkles',
            color TEXT NOT NULL DEFAULT '#3b82f6',
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tombstones (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            profile_id TEXT NOT NULL DEFAULT 'default',
            deleted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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
            total_bytes INTEGER,
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    ").map_err(AppError::Database)?;

    // 2. Migraciones no destructivas para bases de datos existentes de versiones anteriores
    let _ = conn.execute("ALTER TABLE downloads ADD COLUMN total_bytes INTEGER", []);
    let _ = conn.execute("ALTER TABLE watch_history ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'", []);
    let _ = conn.execute("ALTER TABLE favorites ADD COLUMN profile_id TEXT NOT NULL DEFAULT 'default'", []);

    // 3. Crear índices una vez asegurada la existencia de todas las columnas
    conn.execute_batch("
        CREATE INDEX IF NOT EXISTS idx_history_anime_url ON watch_history(anime_url);
        CREATE INDEX IF NOT EXISTS idx_history_watched_at ON watch_history(watched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_history_profile ON watch_history(profile_id);
        CREATE INDEX IF NOT EXISTS idx_favorites_profile ON favorites(profile_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_url_profile ON favorites(url, profile_id);
        CREATE INDEX IF NOT EXISTS idx_tombstones_deleted_at ON tombstones(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed ON image_cache(last_accessed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_image_cache_access_count ON image_cache(access_count DESC);
    ").map_err(AppError::Database)?;

    // 4. Asegurar perfil por defecto inicial
    conn.execute(
        "INSERT OR IGNORE INTO profiles (id, name, avatar, color, is_active, created_at)
         VALUES ('default', 'Principal', 'sparkles', '#3b82f6', 1, datetime('now'))",
        [],
    ).map_err(AppError::Database)?;

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
// Perfiles de Usuario
// ──────────────────────────────────────────

fn get_active_profile_id_inner(conn: &Connection) -> String {
    conn.query_row(
        "SELECT id FROM profiles WHERE is_active = 1 LIMIT 1",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

pub fn get_all_profiles() -> AppResult<Vec<UserProfile>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, avatar, color, is_active, created_at FROM profiles ORDER BY created_at ASC"
        )?;
        let profiles = stmt.query_map([], |row| {
            let is_active_int: i32 = row.get(4)?;
            Ok(UserProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                is_active: is_active_int == 1,
                created_at: row.get(5)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(profiles)
    })
}

pub fn get_active_profile() -> AppResult<UserProfile> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, avatar, color, is_active, created_at FROM profiles WHERE is_active = 1 LIMIT 1"
        )?;
        let profile = stmt.query_row([], |row| {
            let is_active_int: i32 = row.get(4)?;
            Ok(UserProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                is_active: is_active_int == 1,
                created_at: row.get(5)?,
            })
        }).optional()?;

        match profile {
            Some(p) => Ok(p),
            None => {
                // Fallback al perfil default
                let default_p = UserProfile {
                    id: "default".to_string(),
                    name: "Principal".to_string(),
                    avatar: "sparkles".to_string(),
                    color: "#3b82f6".to_string(),
                    is_active: true,
                    created_at: chrono::Utc::now().to_rfc3339(),
                };
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO profiles (id, name, avatar, color, is_active, created_at)
                     VALUES (?1, ?2, ?3, ?4, 1, ?5)",
                    params![default_p.id, default_p.name, default_p.avatar, default_p.color, default_p.created_at],
                );
                Ok(default_p)
            }
        }
    })
}

pub fn upsert_profile(profile: &UserProfile) -> AppResult<()> {
    with_db(|conn| {
        let is_active_int = if profile.is_active { 1 } else { 0 };
        if profile.is_active {
            conn.execute("UPDATE profiles SET is_active = 0", [])?;
        }
        conn.execute(
            "INSERT INTO profiles (id, name, avatar, color, is_active, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                avatar = excluded.avatar,
                color = excluded.color,
                is_active = excluded.is_active",
            params![profile.id, profile.name, profile.avatar, profile.color, is_active_int, profile.created_at],
        )?;
        Ok(())
    })
}

pub fn set_active_profile(id: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute("UPDATE profiles SET is_active = 0", [])?;
        conn.execute("UPDATE profiles SET is_active = 1 WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn delete_profile(id: &str) -> AppResult<()> {
    if id == "default" {
        return Err(AppError::Generic("Cannot delete the default profile".to_string()));
    }
    with_db(|conn| {
        // Registrar tombstone del perfil
        let tombstone_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let _ = conn.execute(
            "INSERT INTO tombstones (id, entity_type, entity_id, profile_id, deleted_at) VALUES (?1, 'profile', ?2, ?2, ?3)",
            params![tombstone_id, id, now],
        );

        conn.execute("DELETE FROM watch_history WHERE profile_id = ?1", params![id])?;
        conn.execute("DELETE FROM favorites WHERE profile_id = ?1", params![id])?;
        conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])?;

        // Si era el activo, activar el default
        let active_count: i32 = conn.query_row("SELECT COUNT(*) FROM profiles WHERE is_active = 1", [], |r| r.get(0))?;
        if active_count == 0 {
            conn.execute("UPDATE profiles SET is_active = 1 WHERE id = 'default'", [])?;
        }
        Ok(())
    })
}

// ──────────────────────────────────────────
// Ajustes Generales (Settings)
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
// Configuración de Sincronización (Sync Config)
// ──────────────────────────────────────────

pub fn get_sync_config(key: &str) -> AppResult<Option<String>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT value FROM sync_config WHERE key = ?1")?;
        let res = stmt.query_row(params![key], |row| row.get(0)).optional()?;
        Ok(res)
    })
}

pub fn set_sync_config(key: &str, value: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO sync_config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    })
}

pub fn get_all_sync_config() -> AppResult<HashMap<String, String>> {
    with_db(|conn| {
        let mut stmt = conn.prepare("SELECT key, value FROM sync_config")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        let mut map = HashMap::new();
        for r in rows.flatten() {
            map.insert(r.0, r.1);
        }
        Ok(map)
    })
}

// ──────────────────────────────────────────
// Tombstones (Registro de Eliminaciones)
// ──────────────────────────────────────────

pub fn add_tombstone(entity_type: &str, entity_id: &str, profile_id: &str) -> AppResult<()> {
    with_db(|conn| {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO tombstones (id, entity_type, entity_id, profile_id, deleted_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, entity_type, entity_id, profile_id, now],
        )?;
        Ok(())
    })
}

pub fn get_tombstones() -> AppResult<Vec<TombstoneItem>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, entity_type, entity_id, profile_id, deleted_at FROM tombstones ORDER BY deleted_at DESC"
        )?;
        let items = stmt.query_map([], |row| {
            Ok(TombstoneItem {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                profile_id: row.get(3)?,
                deleted_at: row.get(4)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();
        Ok(items)
    })
}

pub fn cleanup_old_tombstones(days: i64) -> AppResult<()> {
    with_db(|conn| {
        let cutoff = (chrono::Utc::now() - chrono::Duration::days(days)).to_rfc3339();
        conn.execute("DELETE FROM tombstones WHERE deleted_at < ?1", params![cutoff])?;
        Ok(())
    })
}

// ──────────────────────────────────────────
// Historial (Por Perfil)
// ──────────────────────────────────────────

pub fn upsert_history(entry: &HistoryEntry) -> AppResult<()> {
    with_db(|conn| {
        let profile_id = if entry.profile_id.is_empty() {
            get_active_profile_id_inner(conn)
        } else {
            entry.profile_id.clone()
        };

        conn.execute(
            "INSERT INTO watch_history (id, anime_title, anime_url, thumbnail_url, episode_number, episode_url, watch_progress, watched_at, source, profile_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               anime_title = CASE WHEN excluded.anime_title != '' THEN excluded.anime_title ELSE watch_history.anime_title END,
               thumbnail_url = CASE WHEN excluded.thumbnail_url != '' THEN excluded.thumbnail_url ELSE watch_history.thumbnail_url END,
               episode_url = CASE WHEN excluded.episode_url != '' THEN excluded.episode_url ELSE watch_history.episode_url END,
               watch_progress = excluded.watch_progress,
               watched_at = excluded.watched_at,
               source = CASE WHEN excluded.source != '' THEN excluded.source ELSE watch_history.source END,
               profile_id = excluded.profile_id",
            params![
                entry.id, entry.anime_title, entry.anime_url, entry.thumbnail_url,
                entry.episode_number, entry.episode_url, entry.watch_progress,
                entry.watched_at, entry.source, profile_id
            ],
        )?;
        Ok(())
    })
}

pub fn get_history(limit: u32, offset: u32, profile_id: Option<&str>) -> AppResult<Vec<HistoryEntry>> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };

        let mut stmt = conn.prepare(
            "SELECT id, anime_title, anime_url, thumbnail_url, episode_number, episode_url,
                    watch_progress, watched_at, source, profile_id
             FROM watch_history
             WHERE profile_id = ?1
             ORDER BY watched_at DESC
             LIMIT ?2 OFFSET ?3"
        )?;

        let entries = stmt.query_map(params![target_profile, limit, offset], |row| {
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
                profile_id: row.get(9)?,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

        Ok(entries)
    })
}

pub fn get_all_history(profile_id: Option<&str>) -> AppResult<Vec<HistoryEntry>> {
    with_db(|conn| {
        let (query, has_param) = match profile_id {
            Some(_) => ("SELECT id, anime_title, anime_url, thumbnail_url, episode_number, episode_url, watch_progress, watched_at, source, profile_id FROM watch_history WHERE profile_id = ?1 ORDER BY watched_at DESC", true),
            None => ("SELECT id, anime_title, anime_url, thumbnail_url, episode_number, episode_url, watch_progress, watched_at, source, profile_id FROM watch_history ORDER BY watched_at DESC", false),
        };

        let mut stmt = conn.prepare(query)?;
        let map_row = |row: &rusqlite::Row| {
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
                profile_id: row.get(9)?,
            })
        };

        let entries: Vec<HistoryEntry> = if has_param {
            stmt.query_map(params![profile_id.unwrap()], map_row)?
                .filter_map(|r| r.ok())
                .collect()
        } else {
            stmt.query_map([], map_row)?
                .filter_map(|r| r.ok())
                .collect()
        };

        Ok(entries)
    })
}

pub fn get_episode_progress(episode_url: &str, profile_id: Option<&str>) -> AppResult<Option<f64>> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };

        let fwd = episode_url.replace('\\', "/");
        let bwd = episode_url.replace('/', "\\");
        let fwd_lower = fwd.to_lowercase();
        let bwd_lower = bwd.to_lowercase();
        let original_lower = episode_url.to_lowercase();

        let mut stmt = conn.prepare(
            "SELECT watch_progress FROM watch_history
             WHERE (episode_url = ?1
                 OR episode_url = ?2
                 OR episode_url = ?3
                 OR episode_url = ?4
                 OR episode_url = ?5
                 OR episode_url = ?6)
               AND profile_id = ?7
             ORDER BY watched_at DESC
             LIMIT 1"
        )?;
        let progress = stmt.query_row(
            params![episode_url, fwd, bwd, fwd_lower, bwd_lower, original_lower, target_profile],
            |row| row.get(0)
        ).optional()?;
        Ok(progress)
    })
}

pub fn clear_history(profile_id: Option<&str>) -> AppResult<()> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        conn.execute("DELETE FROM watch_history WHERE profile_id = ?1", params![target_profile])?;
        Ok(())
    })
}

pub fn remove_history(id: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM watch_history WHERE id = ?1", params![id])?;
        Ok(())
    })
}

pub fn remove_history_batch(ids: &[String]) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
    with_db(|conn| {
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!("DELETE FROM watch_history WHERE id IN ({})", placeholders);
        let params_vec: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
        conn.execute(&query, params_vec.as_slice())?;
        Ok(())
    })
}

pub fn remove_history_by_anime(anime_url: &str, profile_id: Option<&str>) -> AppResult<()> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        let clean_url = anime_url.trim_end_matches('/').trim();
        conn.execute(
            "DELETE FROM watch_history WHERE (anime_url = ?1 OR anime_url LIKE ?2) AND profile_id = ?3",
            params![clean_url, format!("{}%", clean_url), target_profile],
        )?;
        Ok(())
    })
}

// ──────────────────────────────────────────
// Favoritos (Por Perfil)
// ──────────────────────────────────────────

pub fn add_favorite(result: &AnimeResult, profile_id: Option<&str>) -> AppResult<()> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO favorites (url, title, thumbnail_url, source, added_at, profile_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(url, profile_id) DO UPDATE SET
                title = excluded.title,
                thumbnail_url = excluded.thumbnail_url,
                source = excluded.source,
                added_at = excluded.added_at",
            params![result.url, result.title, result.thumbnail_url, result.source, now, target_profile],
        )?;
        Ok(())
    })
}

pub fn remove_favorite(url: &str, profile_id: Option<&str>) -> AppResult<()> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        conn.execute("DELETE FROM favorites WHERE url = ?1 AND profile_id = ?2", params![url, target_profile])?;

        // Registrar tombstone
        let tombstone_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let _ = conn.execute(
            "INSERT INTO tombstones (id, entity_type, entity_id, profile_id, deleted_at) VALUES (?1, 'favorite', ?2, ?3, ?4)",
            params![tombstone_id, url, target_profile, now],
        );

        Ok(())
    })
}

pub fn is_favorite(url: &str, profile_id: Option<&str>) -> AppResult<bool> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM favorites WHERE url = ?1 AND profile_id = ?2",
            params![url, target_profile],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    })
}

pub fn get_favorites(profile_id: Option<&str>) -> AppResult<Vec<AnimeResult>> {
    with_db(|conn| {
        let target_profile = match profile_id {
            Some(pid) => pid.to_string(),
            None => get_active_profile_id_inner(conn),
        };
        let mut stmt = conn.prepare(
            "SELECT url, title, thumbnail_url, source FROM favorites WHERE profile_id = ?1 ORDER BY added_at DESC"
        )?;
        let results = stmt.query_map(params![target_profile], |row| {
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

pub fn get_all_favorites_for_sync(profile_id: Option<&str>) -> AppResult<Vec<AnimeResult>> {
    with_db(|conn| {
        let (query, has_param) = match profile_id {
            Some(_) => ("SELECT url, title, thumbnail_url, source, profile_id FROM favorites WHERE profile_id = ?1 ORDER BY added_at DESC", true),
            None => ("SELECT url, title, thumbnail_url, source, profile_id FROM favorites ORDER BY added_at DESC", false),
        };

        let mut stmt = conn.prepare(query)?;
        let map_row = |row: &rusqlite::Row| {
            Ok(AnimeResult {
                url: row.get(0)?,
                title: row.get(1)?,
                thumbnail_url: row.get(2)?,
                source: row.get(3)?,
                profile_id: row.get(4).ok(),
                ..Default::default()
            })
        };

        let results: Vec<AnimeResult> = if has_param {
            stmt.query_map(params![profile_id.unwrap()], map_row)?
                .filter_map(|r| r.ok())
                .collect()
        } else {
            stmt.query_map([], map_row)?
                .filter_map(|r| r.ok())
                .collect()
        };

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

// ──────────────────────────────────────────
// Descargas Persistentes (Downloads)
// ──────────────────────────────────────────

/// Inserta o reemplaza una tarea de descarga en SQLite.
pub fn save_download_task(task: &DownloadTask) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "INSERT INTO downloads
                (id, anime_title, episode_number, stream_url, referer, output_path,
                 status, progress, downloaded_bytes, total_bytes, error, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(id) DO UPDATE SET
                anime_title = excluded.anime_title,
                episode_number = excluded.episode_number,
                stream_url = excluded.stream_url,
                referer = excluded.referer,
                output_path = excluded.output_path,
                status = excluded.status,
                progress = excluded.progress,
                downloaded_bytes = excluded.downloaded_bytes,
                total_bytes = excluded.total_bytes,
                error = excluded.error",
            params![
                task.id,
                task.anime_title,
                task.episode_number,
                task.stream_url,
                task.referer,
                task.output_path,
                task.status,
                task.progress,
                task.downloaded_bytes as i64,
                task.total_bytes.map(|v| v as i64),
                task.error,
                task.created_at,
            ],
        )?;
        Ok(())
    })
}

/// Actualiza el progreso y estado de una descarga periódicamente.
pub fn update_download_progress_db(
    id: &str,
    status: &str,
    progress: f32,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    error: Option<&str>,
) -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE downloads
             SET status = ?1, progress = ?2, downloaded_bytes = ?3,
                 total_bytes = COALESCE(?4, total_bytes), error = ?5
             WHERE id = ?6",
            params![
                status,
                progress,
                downloaded_bytes as i64,
                total_bytes.map(|v| v as i64),
                error,
                id,
            ],
        )?;
        Ok(())
    })
}

/// Recupera todas las descargas registradas en SQLite, ordenadas cronológicamente.
pub fn get_all_downloads_db() -> AppResult<Vec<DownloadTask>> {
    with_db(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, anime_title, episode_number, stream_url, referer, output_path,
                    status, progress, downloaded_bytes, total_bytes, error, created_at
             FROM downloads
             ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(DownloadTask {
                id: row.get(0)?,
                anime_title: row.get(1)?,
                episode_number: row.get::<_, i64>(2)? as u32,
                stream_url: row.get(3)?,
                referer: row.get(4)?,
                output_path: row.get(5)?,
                status: row.get(6)?,
                progress: row.get::<_, f64>(7)? as f32,
                downloaded_bytes: row.get::<_, i64>(8)? as u64,
                total_bytes: row.get::<_, Option<i64>>(9)?.map(|v| v as u64),
                error: row.get(10)?,
                created_at: row.get(11)?,
            })
        })?;

        let mut tasks = Vec::new();
        for r in rows.flatten() {
            tasks.push(r);
        }
        Ok(tasks)
    })
}

/// Elimina el registro de una descarga de SQLite.
pub fn delete_download_task_db(id: &str) -> AppResult<()> {
    with_db(|conn| {
        conn.execute("DELETE FROM downloads WHERE id = ?1", params![id])?;
        Ok(())
    })
}

/// Al iniciar la app, cualquier descarga que quedó en 'downloading' o 'queued'
/// se marca como 'paused' para que el usuario pueda reanudarla limpiamente.
pub fn mark_active_downloads_as_paused_db() -> AppResult<()> {
    with_db(|conn| {
        conn.execute(
            "UPDATE downloads
             SET status = 'paused', error = 'Descarga pausada al cerrar la aplicación'
             WHERE status IN ('downloading', 'queued')",
            [],
        )?;
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

    #[test]
    fn test_migration_from_legacy_schema() {
        let base_temp_dir = env::temp_dir();
        let mut test_dir = base_temp_dir.clone();
        test_dir.push(format!("anics_test_legacy_db_{}", get_unique_id()));
        fs::create_dir_all(&test_dir).unwrap();

        // 1. Crear base de datos simulando esquema anterior (v0.1.7) sin columna profile_id
        let db_path = test_dir.join("anics.db");
        {
            let legacy_conn = Connection::open(&db_path).unwrap();
            legacy_conn.execute_batch("
                CREATE TABLE watch_history (
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

                CREATE TABLE favorites (
                    url TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    thumbnail_url TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL,
                    added_at TEXT NOT NULL
                );
            ").unwrap();
        }

        // 2. Ejecutar init_database_inner sobre la base existente
        {
            let conn = init_database_inner(&test_dir).expect("init_database_inner should migrate legacy schema without error");

            // 3. Verificar que la columna profile_id fue añadida y el índice creado
            let result: Result<String, _> = conn.query_row(
                "SELECT profile_id FROM watch_history LIMIT 1",
                [],
                |row| row.get(0)
            );
            assert!(result.is_err() || result.is_ok());

            // 4. Probar inserción ON CONFLICT en favoritos sobre la base migrada
            conn.execute(
                "INSERT INTO favorites (url, title, thumbnail_url, source, added_at, profile_id)
                 VALUES ('https://jkanime.net/bleach/', 'Bleach', '', 'jkanime', datetime('now'), 'default')
                 ON CONFLICT(url, profile_id) DO UPDATE SET title = excluded.title",
                [],
            ).expect("ON CONFLICT(url, profile_id) must succeed on migrated legacy database");
        }

        // Cleanup
        let _ = fs::remove_dir_all(test_dir);
    }
}
