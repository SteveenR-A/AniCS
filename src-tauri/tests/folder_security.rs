#![cfg(desktop)]

use std::fs;
use std::path::PathBuf;
use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};

struct TestPaths(PathBuf);
impl TestPaths {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("anics-opener-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("installer.exe"), b"not an executable").unwrap();
        Self(root)
    }
}
impl Drop for TestPaths {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn rejected_paths(context: tauri::Context<tauri::test::MockRuntime>) -> Vec<String> {
    let paths = TestPaths::new();
    let app = mock_builder()
        .plugin(tauri_plugin_opener::init())
        .build(context)
        .unwrap();
    let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    [paths.0.join("installer.exe"), paths.0.clone()]
        .into_iter()
        .map(|path| {
            get_ipc_response(
                &webview,
                tauri::webview::InvokeRequest {
                    cmd: "plugin:opener|open_path".into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: "http://tauri.localhost".parse().unwrap(),
                    body: tauri::ipc::InvokeBody::Json(
                        serde_json::json!({ "path": path, "with": null }),
                    ),
                    headers: Default::default(),
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
            .err()
            .expect("Frontend path opening must be rejected")
            .to_string()
        })
        .collect()
}

#[test]
fn original_bare_permission_already_rejects_files_and_folders_by_scope() {
    // Reproduce the pre-patch capability without changing production permissions.
    for error in rejected_paths(tauri::generate_context!(
        "tests/fixtures/opener-baseline/tauri.conf.json"
    )) {
        assert!(
            error.contains("Not allowed to open path"),
            "Unexpected baseline error: {error}"
        );
    }
}

#[test]
fn production_capability_denies_files_and_folders_before_plugin_dispatch() {
    for error in rejected_paths(tauri::generate_context!()) {
        assert!(
            error.contains("not allowed") || error.contains("denied"),
            "Unexpected IPC error: {error}"
        );
        assert!(
            !error.contains("Not allowed to open path"),
            "Expected an ACL denial before plugin dispatch: {error}"
        );
    }
}
