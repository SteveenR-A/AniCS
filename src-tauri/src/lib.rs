mod commands;
mod core;
mod downloader;
mod scrapers;
mod storage;

use tauri::Manager;
use commands::download_cmd::DownloadManager;

/// Estado global compartido por todos los comandos Tauri
pub struct AppState {
    pub download_manager: DownloadManager,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("warn")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            download_manager: DownloadManager::new(),
        })
        .setup(|app| {
            // Inicializar base de datos SQLite
            let app_data_dir = app.path().app_data_dir()
                .expect("Could not resolve app data directory");
            std::fs::create_dir_all(&app_data_dir).ok();
            storage::init_database(app_data_dir)
                .expect("Failed to initialize database");

            log::info!("AniCS started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Anime
            commands::search_anime,
            commands::get_latest,
            commands::get_schedule,
            commands::get_details,
            commands::advanced_search,
            commands::get_sources,
            // Streaming
            commands::get_servers,
            commands::resolve_stream,
            commands::detect_media_type,
            // Descargas
            commands::start_download,
            commands::cancel_download,
            // Almacenamiento e Historial
            commands::upsert_history,
            commands::get_history,
            commands::get_episode_progress,
            commands::clear_history,
            commands::add_favorite,
            commands::remove_favorite,
            commands::is_favorite,
            commands::get_favorites,
            // Ajustes
            commands::get_setting,
            commands::set_setting,
            commands::get_all_settings,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running AniCS");
}
