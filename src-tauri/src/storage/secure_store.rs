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

    #[test]
    fn test_secure_store_roundtrip() {
        let test_key = "test-token";
        let test_val = "secret_12345";

        // 1. Guardar
        set_secure_secret(test_key, test_val).expect("Failed to set secret");

        // 2. Leer y verificar
        let retrieved = get_secure_secret(test_key).expect("Failed to get secret");
        assert_eq!(retrieved.as_deref(), Some(test_val));

        // 3. Eliminar
        delete_secure_secret(test_key).expect("Failed to delete secret");

        // 4. Verificar que ya no exista
        let after_delete = get_secure_secret(test_key).expect("Failed to query after delete");
        assert_eq!(after_delete, None);
    }
}
