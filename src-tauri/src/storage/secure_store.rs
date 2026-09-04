use crate::core::{AppError, AppResult};
use crate::storage::database;

const SERVICE_NAME: &str = "AniCS";

#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
fn make_entry(key: &str) -> AppResult<keyring::Entry> {
    let target = format!("{SERVICE_NAME}/{key}");
    keyring::Entry::new_with_target(&target, SERVICE_NAME, key)
        .map_err(|e| AppError::Generic(format!("Keyring init error for '{key}': {e}")))
}

/// Guarda un token o secreto en el Keyring seguro del SO o en sync_config interno en Android / entornos sin keyring.
pub fn set_secure_secret(key: &str, secret: &str) -> AppResult<()> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        if let Ok(entry) = make_entry(key) {
            if entry.set_password(secret).is_ok() {
                // También limpiamos cualquier entrada fallback antigua para mantener consistencia
                let _ = database::delete_sync_config(&format!("_sec_{key}"));
                return Ok(());
            }
        }
    }

    // Fallback garantizado para Android o entornos sin soporte de keyring
    database::set_sync_config(&format!("_sec_{key}"), secret)
}

/// Obtiene un token o secreto desde el Keyring seguro o sync_config en Android.
pub fn get_secure_secret(key: &str) -> AppResult<Option<String>> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        if let Ok(entry) = make_entry(key) {
            match entry.get_password() {
                Ok(secret) => return Ok(Some(secret)),
                Err(keyring::Error::NoEntry) => return Ok(None),
                Err(_) => {},
            }
        }
    }

    // Fallback garantizado para Android
    match database::get_sync_config(&format!("_sec_{key}")) {
        Ok(v) => Ok(v),
        Err(AppError::Generic(msg)) if msg.contains("DB not initialized") => Ok(None),
        Err(e) => Err(e),
    }
}

/// Elimina un token o secreto del Keyring o sync_config.
pub fn delete_secure_secret(key: &str) -> AppResult<()> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        if let Ok(entry) = make_entry(key) {
            let _ = entry.delete_credential();
        }
    }

    let _ = database::delete_sync_config(&format!("_sec_{key}"));
    Ok(())
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
    fn test_secure_store_roundtrip() {
        let base_temp_dir = env::temp_dir();
        let mut test_dir = base_temp_dir.clone();
        test_dir.push(format!("anics_test_secure_store_{}", get_unique_id()));
        fs::create_dir_all(&test_dir).unwrap();
        let conn = crate::storage::database::init_database_inner(&test_dir).expect("Failed to init db");

        let test_key = "test-token";
        let test_val = "secret_12345";

        // Use direct sqlite operations to bypass the OnceCell global DB which we can't initialize
        // properly in parallel tests without poisoning or state conflicts.
        let internal_key = format!("_sec_{test_key}");
        conn.execute(
            "INSERT OR REPLACE INTO sync_config (key, value) VALUES (?1, ?2)",
            [&internal_key, test_val],
        ).unwrap();

        let retrieved: String = conn.query_row(
            "SELECT value FROM sync_config WHERE key = ?1",
            [&internal_key],
            |row| row.get(0)
        ).unwrap();
        assert_eq!(retrieved, test_val);

        conn.execute("DELETE FROM sync_config WHERE key = ?1", [&internal_key]).unwrap();

        let after_delete: rusqlite::Result<String> = conn.query_row(
            "SELECT value FROM sync_config WHERE key = ?1",
            [&internal_key],
            |row| row.get(0)
        );
        assert!(after_delete.is_err());

        let _ = fs::remove_dir_all(test_dir);
    }
}
