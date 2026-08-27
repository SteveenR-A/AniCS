use rusqlite::{Connection, params, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::OnceCell;
use std::collections::HashMap;

use crate::core::*;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn init_database(app_data_dir: PathBuf) -> AppResult<()> {
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

        CREATE INDEX IF NOT EXISTS idx_history_anime_url ON watch_history(anime_url);
        CREATE INDEX IF NOT EXISTS idx_history_watched_at ON watch_history(watched_at DESC);
    ").map_err(AppError::Database)?;

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
        let mut stmt = conn.prepare(
            "SELECT watch_progress FROM watch_history WHERE episode_url = ?1 LIMIT 1"
        )?;
        let progress = stmt.query_row(params![episode_url], |row| row.get(0)).optional()?;
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
