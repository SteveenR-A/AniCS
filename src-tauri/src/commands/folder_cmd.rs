#[cfg(any(desktop, test))]
use std::path::{Path, PathBuf};
use tauri::AppHandle;
#[cfg(desktop)]
use tauri::Manager;

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StorageFolder {
    Downloads,
    ImageCache,
    AppData,
}

/// Only existing directories may reach the native opener. In particular, a
/// configured root is not permission to execute files stored underneath it.
#[cfg(any(desktop, test))]
fn validated_folder(
    root: &Path,
    requested: Option<&Path>,
    allow_children: bool,
) -> Result<PathBuf, String> {
    let target = requested.unwrap_or(root);
    let root = root
        .canonicalize()
        .map_err(|e| format!("Carpeta configurada no disponible: {e}"))?;
    let target = target
        .canonicalize()
        .map_err(|e| format!("Carpeta no disponible: {e}"))?;
    if root.parent().is_none() || !root.is_dir() || !target.is_dir() {
        return Err("Solo se pueden abrir carpetas de almacenamiento de AniCS.".into());
    }
    if target != root && (!allow_children || !target.starts_with(&root)) {
        return Err("La carpeta está fuera del almacenamiento seleccionado.".into());
    }
    Ok(target)
}

/// Resolve the purpose on the backend, never a caller-supplied application or
/// executable. Download subdirectories include user-selected custom locations.
#[tauri::command]
pub fn open_storage_folder(
    folder: StorageFolder,
    path: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_opener::OpenerExt;
        let (root, allow_children) = match folder {
            StorageFolder::Downloads => (
                PathBuf::from(super::download_cmd::get_default_download_dir(
                    app_handle.clone(),
                )?),
                true,
            ),
            StorageFolder::ImageCache => (
                crate::storage::get_image_cache_dir(&app_handle).map_err(|e| e.to_string())?,
                false,
            ),
            StorageFolder::AppData => (
                app_handle
                    .path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())?,
                false,
            ),
        };
        let target = validated_folder(&root, path.as_deref().map(Path::new), allow_children)?;
        app_handle
            .opener()
            .open_path(target.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = (folder, path, app_handle);
        Err("Abrir carpetas en el explorador solo está disponible en escritorio.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Folders {
        base: PathBuf,
        root: PathBuf,
        anime: PathBuf,
        outside: PathBuf,
    }
    impl Folders {
        fn new() -> Self {
            let base =
                std::env::temp_dir().join(format!("anics-folder-test-{}", uuid::Uuid::new_v4()));
            let root = base.join("custom-downloads");
            let anime = root.join("Anime con espacios");
            let outside = base.join("custom-downloads-other");
            fs::create_dir_all(&anime).unwrap();
            fs::create_dir_all(&outside).unwrap();
            Self {
                base,
                root,
                anime,
                outside,
            }
        }
    }
    impl Drop for Folders {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    #[test]
    fn accepts_custom_root_and_download_subdirectory() {
        let dirs = Folders::new();
        assert_eq!(
            validated_folder(&dirs.root, None, true).unwrap(),
            dirs.root.canonicalize().unwrap()
        );
        assert_eq!(
            validated_folder(&dirs.root, Some(&dirs.anime), true).unwrap(),
            dirs.anime.canonicalize().unwrap()
        );
    }

    #[test]
    fn canonicalizes_existing_configured_paths_before_validation() {
        let dirs = Folders::new();
        let alias = dirs.root.join("..").join("custom-downloads");
        assert_eq!(
            validated_folder(&alias, Some(&alias.join("Anime con espacios")), true).unwrap(),
            dirs.anime.canonicalize().unwrap()
        );
        let cwd = std::env::current_dir().unwrap().canonicalize().unwrap();
        let target = dirs.root.canonicalize().unwrap();
        let cwd_parts: Vec<_> = cwd.components().collect();
        let target_parts: Vec<_> = target.components().collect();
        let common = cwd_parts
            .iter()
            .zip(&target_parts)
            .take_while(|(a, b)| a == b)
            .count();
        if common > 0 {
            let mut relative = PathBuf::new();
            for _ in common..cwd_parts.len() {
                relative.push("..");
            }
            for part in &target_parts[common..] {
                relative.push(part.as_os_str());
            }
            assert_eq!(validated_folder(&relative, None, true).unwrap(), target);
        }
    }

    #[test]
    fn rejects_executable_and_other_files_even_inside_root() {
        let dirs = Folders::new();
        for name in ["installer.exe", "episode.mp4", "link.url", "script.cmd"] {
            let file = dirs.root.join(name);
            fs::write(&file, b"test").unwrap();
            assert!(validated_folder(&dirs.root, Some(&file), true).is_err());
            assert!(validated_folder(&file, None, true).is_err());
        }
    }

    #[test]
    fn rejects_outside_prefix_collision_parent_and_relative_paths() {
        let dirs = Folders::new();
        for path in [
            &dirs.outside,
            &dirs.base,
            &dirs.root.join("..").join("custom-downloads-other"),
            Path::new("relative"),
            Path::new("file:///tmp"),
        ] {
            assert!(validated_folder(&dirs.root, Some(path), true).is_err());
        }
        assert!(validated_folder(Path::new("relative"), None, true).is_err());
    }

    #[test]
    fn cache_and_data_only_allow_the_exact_directory() {
        let dirs = Folders::new();
        assert!(validated_folder(&dirs.root, None, false).is_ok());
        assert!(validated_folder(&dirs.root, Some(&dirs.anime), false).is_err());
    }

    #[test]
    fn rejects_missing_directory_and_filesystem_root() {
        let dirs = Folders::new();
        assert!(validated_folder(&dirs.root, Some(&dirs.root.join("missing")), true).is_err());
        let disk = dirs.root.ancestors().last().unwrap();
        assert!(validated_folder(disk, None, true).is_err());
    }

    #[test]
    fn plugin_path_opening_is_explicitly_denied() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../../capabilities/default.json")).unwrap();
        let permissions = capability["permissions"].as_array().unwrap();
        assert!(permissions.iter().any(|p| p == "opener:deny-open-path"));
        assert!(!permissions
            .iter()
            .any(|p| p == "opener:allow-open-path" || p["identifier"] == "opener:allow-open-path"));
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junction_escape() {
        let dirs = Folders::new();
        let link = dirs.root.join("escape");
        let result = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(&link)
            .arg(&dirs.outside)
            .output()
            .unwrap();
        assert!(result.status.success(), "Unable to create test junction");
        let rejected = validated_folder(&dirs.root, Some(&link), true).is_err();
        fs::remove_dir(&link).unwrap();
        assert!(rejected);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_escape() {
        let dirs = Folders::new();
        let link = dirs.root.join("escape");
        std::os::unix::fs::symlink(&dirs.outside, &link).unwrap();
        assert!(validated_folder(&dirs.root, Some(&link), true).is_err());
    }
}
