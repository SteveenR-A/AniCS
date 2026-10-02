use anics_lib::core::{AnimeResult, HistoryEntry, UserProfile};
use anics_lib::storage::database::normalize_anime_title_key;
use serde_json::{json, Value};

fn fixtures() -> Value {
    serde_json::from_str(include_str!(
        "../../docs/android-native/fixtures/sync-v1.json"
    ))
    .unwrap()
}

#[test]
fn shared_sync_entries_keep_rust_history_and_profile_wire_fields() {
    let fixture = fixtures();
    assert_eq!(fixture["fixtureVersion"], 1);
    for entry in fixture["entries"].as_object().unwrap().values() {
        let history: HistoryEntry = serde_json::from_value(entry.clone()).unwrap();
        // JS writes integral progress as 1; serde's f64 writes 1.0.
        // Compare its numeric value while preserving all remaining wire fields.
        let mut expected = entry.clone();
        expected["watchProgress"] = json!(entry["watchProgress"].as_f64().unwrap());
        assert_eq!(serde_json::to_value(history).unwrap(), expected);
    }
    for entry in fixture["profiles"].as_object().unwrap().values() {
        let profile: UserProfile = serde_json::from_value(entry.clone()).unwrap();
        assert_eq!(serde_json::to_value(profile).unwrap(), *entry);
    }
}

#[test]
fn history_defaults_remain_compatible_with_legacy_payloads() {
    let history: HistoryEntry = serde_json::from_value(json!({
        "id": "legacy", "animeTitle": "龍", "animeUrl": "https://catalog.example/dragon/",
        "episodeNumber": 1, "episodeUrl": "https://catalog.example/dragon/1/",
        "watchedAt": "2026-10-02T10:00:00.000Z"
    }))
    .unwrap();
    assert_eq!(history.source, "jkanime");
    assert_eq!(history.profile_id, "default");
    assert_eq!(history.thumbnail_url, "");
    assert_eq!(history.watch_progress, 0.0);
}

#[test]
fn current_rust_normalization_differences_are_recorded_for_native_compatibility() {
    for case in fixtures()["keyCases"].as_array().unwrap() {
        let title = case["entry"]["animeTitle"].as_str().unwrap();
        assert_eq!(
            normalize_anime_title_key(title),
            case["rustNormalizedTitle"].as_str().unwrap(),
            "{}",
            case["name"]
        );
    }
}

#[test]
fn favorite_extension_metadata_is_visible_in_json_but_not_in_the_existing_rust_model() {
    let fixture = fixtures();
    let restored = &fixture["favorites"]["restored"];
    assert!(restored["addedAt"].is_string());
    let parsed: AnimeResult = serde_json::from_value(restored.clone()).unwrap();
    let exported = serde_json::to_value(parsed).unwrap();
    assert_eq!(exported["url"], restored["url"]);
    assert_eq!(exported["profileId"], restored["profileId"]);
    // Characterizes a legacy limitation, not the required behavior of new DTOs.
    assert!(exported.get("addedAt").is_none());
}
