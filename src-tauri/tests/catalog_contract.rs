use std::collections::HashMap;

use anics_lib::core::catalog_contract::{
    CatalogError, CatalogErrorCode, CoreConfig, ExtractorKind,
};
use anics_lib::core::{
    AnimeDetails, AnimeResult, Episode, GenreItem, Quality, ResolvedMedia, ScheduleDay,
    SearchFilters, SearchResultPage, VideoServer,
};
use anics_lib::scrapers::{
    jkanime::JKANIME_DOMAINS, AnimeExtractor, JKAnimeExtractor, MundoDonghuaExtractor,
    OtakusTVExtractor,
};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Value};

fn catalog() -> Value {
    serde_json::from_str(include_str!(
        "../../docs/android-native/fixtures/catalog-v1.json"
    ))
    .unwrap()
}

fn assert_wire_contract<T: DeserializeOwned + Serialize>(group: &str) {
    let fixtures = catalog();
    assert_eq!(fixtures["fixtureVersion"], 1);
    for case in fixtures[group].as_array().unwrap() {
        let model: T = serde_json::from_value(case["input"].clone()).unwrap();
        let serialized = serde_json::to_value(model).unwrap();
        assert_eq!(serialized, case["expected"], "{}", case["case"]);
        // Canonical output must remain readable, not just serializable.
        let parsed_again: T = serde_json::from_value(serialized.clone()).unwrap();
        assert_eq!(serde_json::to_value(parsed_again).unwrap(), serialized);
    }
}

#[test]
fn catalog_models_preserve_the_current_wire_format() {
    assert_wire_contract::<AnimeResult>("animeResults");
    assert_wire_contract::<AnimeDetails>("details");
    assert_wire_contract::<VideoServer>("servers");
    assert_wire_contract::<SearchFilters>("filters");
    assert_wire_contract::<SearchResultPage>("pages");
    assert_wire_contract::<GenreItem>("genres");
    assert_wire_contract::<ScheduleDay>("schedule");
}

#[test]
fn resolved_media_preserves_url_headers_and_quality_without_normalization() {
    assert_wire_contract::<ResolvedMedia>("media");
    let media: ResolvedMedia =
        serde_json::from_value(catalog()["media"][0]["input"].clone()).unwrap();
    assert!(media.direct_url.ends_with("fixture%2Bvalue"));
    assert_eq!(
        media.referer.as_deref(),
        Some("https://catalog.example/dragon/1/")
    );
    assert_eq!(media.user_agent.as_deref(), Some("AniCS-Contract/1"));
    assert_eq!(media.qualities[0].bandwidth, Some(2_500_000));
}

#[test]
fn integer_boundaries_and_unknown_media_values_are_not_silently_coerced() {
    let mut episode = catalog()["details"][0]["expected"]["episodes"][0].clone();
    for invalid in [json!(-1), json!(4_294_967_296u64), json!(1.5), json!("1")] {
        episode["number"] = invalid;
        assert!(serde_json::from_value::<Episode>(episode.clone()).is_err());
    }
    episode["number"] = json!(u32::MAX);
    assert_eq!(
        serde_json::from_value::<Episode>(episode).unwrap().number,
        u32::MAX
    );

    let quality: Quality = serde_json::from_value(json!({
        "label": "boundary", "url": "https://media.example/boundary", "bandwidth": u64::MAX
    }))
    .unwrap();
    assert_eq!(quality.bandwidth, Some(u64::MAX));
    let mut media = catalog()["media"][0]["input"].clone();
    media["mediaType"] = json!("dash");
    assert!(serde_json::from_value::<ResolvedMedia>(media).is_err());
}

#[test]
fn missing_required_fields_remain_errors() {
    assert!(serde_json::from_value::<AnimeResult>(json!({"title": "Missing URL"})).is_err());
    assert!(serde_json::from_value::<VideoServer>(
        json!({"name": "Missing isDirect", "url": "https://embed.example/e/1"})
    )
    .is_err());
    assert!(serde_json::from_value::<SearchFilters>(json!({"query": "Missing page"})).is_err());
    assert_eq!(SearchFilters::default().page, 1);
}

#[test]
fn configuration_snapshot_matches_the_legacy_source_selection_contract() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../docs/android-native/fixtures/core-config-v1.json"
    ))
    .unwrap();
    let mut settings: HashMap<String, String> =
        serde_json::from_value(fixture["settings"].clone()).unwrap();
    let config = CoreConfig::from_settings(&settings);
    assert_eq!(serde_json::to_value(&config).unwrap(), fixture["expected"]);
    assert_eq!(
        serde_json::from_value::<CoreConfig>(fixture["expected"].clone()).unwrap(),
        config
    );

    // A snapshot belongs to its caller and cannot change with later settings edits.
    settings.insert("jkanime_base_url".into(), "https://changed.example".into());
    assert_eq!(
        config.sources[0].base_url,
        "https://mirror.example/catalog/"
    );
    assert_eq!(config.sources[3].id, "custom_0");
    assert_eq!(config.sources[3].extractor, ExtractorKind::MundoDonghua);
}

#[test]
fn default_configuration_matches_existing_builtins_and_mirror_order() {
    let config = CoreConfig::default();
    let existing: Vec<Box<dyn AnimeExtractor>> = vec![
        Box::new(JKAnimeExtractor::new()),
        Box::new(MundoDonghuaExtractor::new()),
        Box::new(OtakusTVExtractor::new()),
    ];
    assert_eq!(config.sources.len(), existing.len());
    for (source, extractor) in config.sources.iter().zip(existing.iter()) {
        assert_eq!(source.id, extractor.id());
        assert_eq!(source.name, extractor.name());
        assert_eq!(source.base_url, extractor.base_url());
    }
    assert_eq!(config.sources[0].mirror_urls, JKANIME_DOMAINS);
}

#[test]
fn malformed_custom_settings_preserve_legacy_fallback_without_partial_sources() {
    for raw in [
        "invalid JSON",
        "null",
        "{}",
        r#"[{"name":"Incomplete"}]"#,
        r#"[{"name":"Valid","url":"https://example.test"},{"name":"Incomplete"}]"#,
    ] {
        let settings = HashMap::from([("custom_sources".to_owned(), raw.to_owned())]);
        assert_eq!(CoreConfig::from_settings(&settings), CoreConfig::default());
    }
}

#[test]
fn typed_catalog_errors_have_a_stable_wire_code_without_storage_details() {
    let expected = [
        CatalogErrorCode::Network,
        CatalogErrorCode::Timeout,
        CatalogErrorCode::Parse,
        CatalogErrorCode::SourceNotFound,
        CatalogErrorCode::ServerUnavailable,
        CatalogErrorCode::Cancelled,
        CatalogErrorCode::Security,
        CatalogErrorCode::RateLimit,
    ];
    let fixtures = catalog();
    for (value, code) in fixtures["errors"].as_array().unwrap().iter().zip(expected) {
        let error: CatalogError = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(error.code, code);
        assert_eq!(error.to_string(), value["message"].as_str().unwrap());
        assert_eq!(serde_json::to_value(error).unwrap(), *value);
    }
}
