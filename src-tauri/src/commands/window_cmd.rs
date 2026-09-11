#[cfg(desktop)]
use tauri::Manager;

/// Control de pantalla completa multiplataforma (Windows y Android)
#[tauri::command]
pub async fn set_fullscreen(app: tauri::AppHandle, fullscreen: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        for (_, window) in app.webview_windows() {
            let _ = window.set_fullscreen(fullscreen);
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, fullscreen);
    }
    Ok(())
}

/// Cierra el proceso de la aplicación limpiamente
#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Alterna la barra de título / decoraciones de la ventana (útil para Hyprland y Tiling WMs)
#[tauri::command]
pub fn set_window_decorations(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(main_win) = app.get_webview_window("main") {
            main_win.set_decorations(enabled).map_err(|e| e.to_string())?;
            let _ = crate::storage::set_setting("window_decorations", if enabled { "true" } else { "false" });
        }
    }
    Ok(())
}

/// Obtiene el estado actual de las decoraciones de ventana
#[tauri::command]
pub fn get_window_decorations(app: tauri::AppHandle) -> Result<bool, String> {
    #[cfg(desktop)]
    {
        if let Some(main_win) = app.get_webview_window("main") {
            return main_win.is_decorated().map_err(|e| e.to_string());
        }
    }
    Ok(true)
}


