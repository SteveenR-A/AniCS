pub mod commands;
pub mod core;
pub mod downloader;
pub mod scrapers;
pub mod storage;

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

            #[cfg(desktop)]
            if let Some(main_win) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon() {
                    let _ = main_win.set_icon(icon.clone());
                }
            }

            // Precalentar caché de imágenes en background sin bloquear la apertura de UI
            let app_handle_warmup = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                storage::warmup_image_cache(&app_handle_warmup).await;
            });

            log::info!("AniCS started");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Anime
            commands::search_anime,
            commands::get_latest,
            commands::get_schedule,
            commands::get_schedule_days,
            commands::get_top,
            commands::get_details,
            commands::advanced_search,
            commands::get_genres,
            commands::get_sources,
            // Streaming
            commands::get_servers,
            commands::resolve_stream,
            commands::detect_media_type,
            // Descargas y Archivos Locales
            commands::start_download,
            commands::cancel_download,
            commands::scan_local_downloads,
            commands::delete_local_download,
            commands::delete_local_anime_folder,
            commands::get_default_download_dir,
            commands::set_download_dir,
            commands::cache_image,
            commands::get_cache_stats,
            commands::clear_image_cache,
            commands::preload_images_batch,
            commands::save_local_anime_cover,
            commands::download_and_run_installer,
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
            commands::get_database_stats,
            commands::optimize_database,
            commands::reset_database,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running AniCS");
}
