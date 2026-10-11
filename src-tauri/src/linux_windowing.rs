use tauri::utils::config::Config;

fn is_hyprland(signature: Option<&str>, desktop: Option<&str>) -> bool {
    signature.is_some_and(|value| !value.is_empty())
        || desktop.is_some_and(|value| {
            value
                .split(':')
                .any(|name| name.eq_ignore_ascii_case("hyprland"))
        })
}

fn allow_tiling_resize(config: &mut Config, hyprland: bool) {
    if !hyprland {
        return;
    }
    if let Some(window) = config
        .app
        .windows
        .iter_mut()
        .find(|window| window.label == "main")
    {
        // Hyprland can tile below these limits. GTK otherwise keeps a larger
        // WebKit viewport than the compositor's surface, misaligning input.
        // Apply before GTK/WebKit creation so the initial allocation also fits.
        window.min_width = None;
        window.min_height = None;
        window.transparent = false;
        window.decorations = false;
    }
}

/// Run before GTK or the async runtime creates threads.
pub fn prepare_environment() {
    let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
    if is_hyprland(signature.as_deref(), desktop.as_deref()) {
        // Keep UI acceleration while using the compatible video sink. DMABuf
        // video frames can stall on hybrid/NVIDIA Wayland stacks independently
        // of the renderer used for scrolling and the rest of the interface.
        for (key, value) in compatible_video_defaults() {
            if std::env::var_os(key).is_none() {
                std::env::set_var(key, value);
            }
        }
        // Keep accelerated rendering: disabling DMABUF caused sluggish scrolling
        // in large windows on the tested NVIDIA/Intel Hyprland installation.
        // Explicit sync is the narrower workaround; users can still force the
        // compatible renderer with WEBKIT_DISABLE_DMABUF_RENDERER=1.
        if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
            std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
        }
    } else if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // Preserve the previous video compatibility default on other Linux desktops.
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
}

fn compatible_video_defaults() -> [(&'static str, &'static str); 2] {
    [
        ("WEBKIT_GST_DMABUF_SINK_DISABLED", "1"),
        ("WEBKIT_GST_DISABLE_GL_SINK", "1"),
    ]
}

pub fn compatible_graphics() -> bool {
    let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
    // Reduce expensive UI effects under Hyprland, including accelerated mode.
    is_hyprland(signature.as_deref(), desktop.as_deref())
        || std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref() == Ok("1")
        || std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").as_deref() == Ok("1")
}

pub fn configure(config: &mut Config) {
    let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok();
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
    allow_tiling_resize(
        config,
        is_hyprland(signature.as_deref(), desktop.as_deref()),
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::utils::config::WindowConfig;

    fn desktop_config() -> Config {
        let mut config = Config::default();
        config.app.windows = vec![
            WindowConfig {
                label: "main".into(),
                width: 1280.0,
                height: 800.0,
                min_width: Some(900.0),
                min_height: Some(600.0),
                ..Default::default()
            },
            WindowConfig {
                label: "secondary".into(),
                min_width: Some(400.0),
                min_height: Some(300.0),
                ..Default::default()
            },
        ];
        config
    }

    #[test]
    fn detects_hyprland_without_matching_other_desktops() {
        assert!(is_hyprland(Some("instance"), None));
        assert!(is_hyprland(None, Some("Hyprland")));
        assert!(is_hyprland(None, Some("other:HYPRLAND")));
        assert!(!is_hyprland(Some(""), Some("GNOME")));
        assert!(!is_hyprland(None, Some("KDE")));
        assert!(!is_hyprland(None, None));
    }

    #[test]
    fn hyprland_main_window_can_fit_tiles_below_desktop_minimum() {
        let mut config = desktop_config();
        allow_tiling_resize(&mut config, true);
        let main = &config.app.windows[0];
        assert_eq!(main.min_width, None);
        assert_eq!(main.min_height, None);
        assert_eq!((main.width, main.height), (1280.0, 800.0));
        assert_eq!(config.app.windows[1].min_width, Some(400.0));
        assert_eq!(config.app.windows[1].min_height, Some(300.0));
    }

    #[test]
    fn other_linux_desktops_keep_configured_minimums() {
        let mut config = desktop_config();
        allow_tiling_resize(&mut config, false);
        assert_eq!(config.app.windows[0].min_width, Some(900.0));
        assert_eq!(config.app.windows[0].min_height, Some(600.0));
    }
}
