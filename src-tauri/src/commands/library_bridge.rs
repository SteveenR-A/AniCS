//! Android-only, read-only bridge for the native app. Never exports profiles or credentials.
use std::{fs, path::{Path, PathBuf}};
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct LibraryMetadata {
    pub title: String,
    pub anime_url: String,
    pub thumbnail_url: String,
    pub source: String,
    #[serde(skip)]
    pub cover_file: Option<PathBuf>,
    pub local_cover: String,
}

pub(super) fn rows_for_root(root: &Path, folders: &[super::download_cmd::LocalAnimeFolder],
    history: &[crate::core::HistoryEntry], favorites: &[crate::core::AnimeResult]) -> Vec<LibraryMetadata> {
    let title_key = |value: &str| super::download_cmd::sanitize_anime_folder_name(value).to_lowercase();
    folders.iter().filter(|row| Path::new(&row.folder_path).starts_with(root)).map(|row| {
        let key = title_key(&row.anime_title);
        let saved = history.iter().find(|h| title_key(&h.anime_title) == key && h.anime_url.starts_with("http"));
        let favorite = favorites.iter().find(|f| title_key(&f.title) == key && f.url.starts_with("http"));
        LibraryMetadata {
            title: row.anime_title.clone(),
            anime_url: saved.map(|h| h.anime_url.clone()).or_else(|| favorite.map(|f| f.url.clone())).unwrap_or_default(),
            thumbnail_url: saved.map(|h| h.thumbnail_url.clone()).filter(|url| !url.is_empty())
                .or_else(|| favorite.map(|f| f.thumbnail_url.clone()).filter(|url| !url.is_empty()))
                .or_else(|| row.cover_image.as_ref().filter(|url| url.starts_with("http")).cloned()).unwrap_or_default(),
            source: saved.map(|h| h.source.clone()).or_else(|| favorite.map(|f| f.source.clone())).unwrap_or_else(|| "jkanime".into()),
            cover_file: row.cover_image.as_ref().filter(|path| !path.starts_with("http")).map(PathBuf::from),
            local_cover: String::new(),
        }
    }).collect()
}

pub(super) fn publish(root: &Path, mut rows: Vec<LibraryMetadata>) -> Result<(), String> {
    let canonical_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let bridge = root.join(".anics");
    fs::create_dir_all(&bridge).map_err(|e| e.to_string())?;
    if let Ok(canon_bridge) = bridge.canonicalize() {
        if !canon_bridge.starts_with(&canonical_root) {
            return Err("La carpeta de metadatos sale de Anime".into());
        }
    }
    let covers = bridge.join("covers");
    fs::create_dir_all(&covers).map_err(|e| e.to_string())?;
    if let Ok(canon_covers) = covers.canonicalize() {
        if !canon_covers.starts_with(&canonical_root) {
            return Err("La carpeta de portadas sale de Anime".into());
        }
    }
    // Keep the directory out of the Android gallery, but readable through SAF.
    fs::write(bridge.join(".nomedia"), []).map_err(|e| e.to_string())?;
    for row in &mut rows {
        if let Some(source) = &row.cover_file {
            if source.is_file() && source.metadata().map(|m| m.len() <= 16 * 1024 * 1024).unwrap_or(false) {
                let extension = source.extension().and_then(|e| e.to_str()).unwrap_or("jpg").to_lowercase();
                if !["jpg", "jpeg", "png", "webp"].contains(&extension.as_str()) { continue; }
                let name = format!("{}.{}", super::download_cmd::sanitize_anime_folder_name(&row.title), extension);
                let destination = covers.join(&name);
                let temporary = covers.join(format!("{}.tmp", uuid::Uuid::new_v4()));
                if fs::copy(source, &temporary).is_ok() && fs::rename(&temporary, &destination).is_ok() {
                    row.local_cover = format!("covers/{}", name);
                }
                let _ = fs::remove_file(temporary);
            }
        }
    }
    let temporary = bridge.join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        fs::write(&temporary, serde_json::to_vec(&rows).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        fs::rename(&temporary, bridge.join("library.json")).map_err(|e| e.to_string())
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publishes_metadata_and_offline_cover_without_touching_original() {
        let root = std::env::temp_dir().join(format!("anics-bridge-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let original = root.join("original.jpg");
        fs::write(&original, [7u8; 256]).unwrap();
        let row = || LibraryMetadata { title: "Black Lagoon".into(), anime_url: "https://catalog/black-lagoon".into(), thumbnail_url: "https://catalog/cover.jpg".into(), source: "jkanime".into(), cover_file: Some(original.clone()), local_cover: String::new() };
        publish(&root, vec![row()]).unwrap();
        publish(&root, vec![row()]).unwrap();
        let data: serde_json::Value = serde_json::from_slice(&fs::read(root.join(".anics/library.json")).unwrap()).unwrap();
        assert_eq!(data[0]["localCover"], "covers/Black Lagoon.jpg");
        assert_eq!(data[0]["animeUrl"], "https://catalog/black-lagoon");
        assert_eq!(fs::read(root.join(".anics/covers/Black Lagoon.jpg")).unwrap(), fs::read(&original).unwrap());
        assert!(root.join(".anics/.nomedia").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn exports_only_downloaded_titles_with_real_catalog_links() {
        let root = Path::new("Anime");
        let folders = vec![super::super::download_cmd::LocalAnimeFolder { anime_title: "Black Lagoon".into(), folder_path: root.join("Black Lagoon").to_string_lossy().into(), total_episodes: 1, total_size: 500, total_size_formatted: "500 B".into(), cover_image: Some("https://cdn/cover.jpg".into()), episodes: vec![] }];
        let favorite: crate::core::AnimeResult = serde_json::from_value(serde_json::json!({ "title": "Black Lagoon", "url": "https://catalog/black-lagoon", "thumbnailUrl": "https://catalog/cover.jpg", "source": "donghua" })).unwrap();
        let rows = rows_for_root(root, &folders, &[], &[favorite]);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].anime_url, "https://catalog/black-lagoon");
        assert_eq!(rows[0].source, "donghua");
        assert_eq!(rows[0].thumbnail_url, "https://catalog/cover.jpg");
        assert!(rows_for_root(Path::new("Other"), &folders, &[], &[]).is_empty());
    }
}
