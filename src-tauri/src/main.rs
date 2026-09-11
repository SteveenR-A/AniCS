// Previene consola extra en Windows en release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // En Wayland (Hyprland / Sway) con GPUs NVIDIA/Intel híbridas, WebKitGTK DMABUF renderer
        // a menudo causa congelamiento en la reproducción de video HTML5.
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    anics_lib::run();
}
