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

