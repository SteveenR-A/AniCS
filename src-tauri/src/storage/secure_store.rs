use crate::core::{AppError, AppResult};

const SERVICE_NAME: &str = "AniCS";

fn make_entry(key: &str) -> AppResult<keyring::Entry> {
    // En Windows, el target visible en Credential Manager será "AniCS/key"
    // Esto asegura TargetName explícito y evita colisiones en el Administrador de credenciales
    let target = format!("{SERVICE_NAME}/{key}");
    keyring::Entry::new_with_target(&target, SERVICE_NAME, key)
        .map_err(|e| AppError::Generic(format!("Keyring init error for '{key}': {e}")))
}

/// Guarda un token o secreto en el Keyring seguro del sistema operativo (Windows Credential Manager / macOS Keychain / Linux Secret Service).
pub fn set_secure_secret(key: &str, secret: &str) -> AppResult<()> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        make_entry(key)?
            .set_password(secret)
            .map_err(|e| AppError::Generic(format!("Failed to save '{key}': {e}")))?;
        Ok(())
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = (key, secret);
        Ok(())
    }
}

/// Obtiene un token o secreto desde el Keyring seguro del sistema operativo.
pub fn get_secure_secret(key: &str) -> AppResult<Option<String>> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        match make_entry(key)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::Generic(format!("Failed to get '{key}': {e}"))),
        }
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = key;
        Ok(None)
    }
}

/// Elimina un token o secreto del Keyring del sistema operativo.
pub fn delete_secure_secret(key: &str) -> AppResult<()> {
    #[cfg(any(windows, target_os = "macos", target_os = "linux"))]
    {
        match make_entry(key)?.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::Generic(format!("Failed to delete '{key}': {e}"))),
        }
    }
    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = key;
        Ok(())
    }
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
