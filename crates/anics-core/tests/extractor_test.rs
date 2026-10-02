use anics_core::config::{CoreConfig, ExtractorKind, SourceConfig};
use anics_core::error::{CatalogError, CatalogErrorCode, CoreError};
use anics_core::models::*;
use anics_core::scrapers::*;
use anics_core::unpacker::JsUnpacker;
use anics_core::url_security::is_ip_private_or_reserved;
use std::net::IpAddr;

#[test]
fn test_default_config_creates_all_extractors() {
    let config = CoreConfig::default();
    assert_eq!(config.sources.len(), 3);

    let jk = create_extractor_with_config("jkanime", &config);
    assert!(jk.is_some());
    let jk = jk.unwrap();
    assert_eq!(jk.id(), "jkanime");
    assert_eq!(jk.base_url(), "https://jkanime.org");

    let md = create_extractor_with_config("mundodonghua", &config);
    assert!(md.is_some());
    let md = md.unwrap();
    assert_eq!(md.id(), "mundodonghua");
    assert_eq!(md.base_url(), "https://www.mundodonghua.com");

    let ot = create_extractor_with_config("otakustv", &config);
    assert!(ot.is_some());
    let ot = ot.unwrap();
    assert_eq!(ot.id(), "otakustv");
    assert_eq!(ot.base_url(), "https://www.otakustv.net");
}

#[test]
fn test_custom_source_selection_and_base_url() {
    let mut config = CoreConfig::default();
    config.sources.push(SourceConfig {
        id: "custom_0".into(),
        name: "Mi Donghua".into(),
        extractor: ExtractorKind::MundoDonghua,
        base_url: "https://custom.donghua.test".into(),
        mirror_urls: vec![],
    });

    let custom_ext = create_extractor_with_config("custom_0", &config);
    assert!(custom_ext.is_some());
    let custom_ext = custom_ext.unwrap();
    assert_eq!(custom_ext.base_url(), "https://custom.donghua.test");
    assert_eq!(custom_ext.id(), "mundodonghua");
}

#[test]
fn test_core_error_to_catalog_error_mapping() {
    let err = CoreError::Parse("Failed to parse HTML".to_string());
    let cat_err: CatalogError = err.into();
    assert_eq!(cat_err.code, CatalogErrorCode::Parse);
    assert_eq!(cat_err.message, "Failed to parse HTML");

    let timeout_err = CoreError::Timeout("Connection timed out".to_string());
    let cat_err: CatalogError = timeout_err.into();
    assert_eq!(cat_err.code, CatalogErrorCode::Timeout);

    let sec_err = CoreError::Security("Blocked loopback IP".to_string());
    let cat_err: CatalogError = sec_err.into();
    assert_eq!(cat_err.code, CatalogErrorCode::Security);
}

#[test]
fn test_unpacker_stream_detection() {
    let fake_html = r#"
        <html>
            <script>
                var video_source = "https://cdn.animeprovider.test/hls/ep1/master.m3u8";
            </script>
        </html>
    "#;
    let stream = JsUnpacker::extract_stream_url(fake_html);
    assert_eq!(
        stream.as_deref(),
        Some("https://cdn.animeprovider.test/hls/ep1/master.m3u8")
    );
}

#[test]
fn test_url_security_rejects_private_ips() {
    let loopback: IpAddr = "127.0.0.1".parse().unwrap();
    assert!(is_ip_private_or_reserved(&loopback));

    let private_class_c: IpAddr = "192.168.1.100".parse().unwrap();
    assert!(is_ip_private_or_reserved(&private_class_c));

    let private_class_a: IpAddr = "10.254.0.1".parse().unwrap();
    assert!(is_ip_private_or_reserved(&private_class_a));

    let public_ip: IpAddr = "8.8.8.8".parse().unwrap();
    assert!(!is_ip_private_or_reserved(&public_ip));
}

#[test]
fn test_models_serde_roundtrip() {
    let anime = AnimeResult {
        title: "Test Anime".to_string(),
        url: "https://example.com/anime/1".to_string(),
        thumbnail_url: "https://example.com/thumb.jpg".to_string(),
        description: Some("Una historia emocionante".to_string()),
        episode: Some("12".to_string()),
        anime_type: Some("TV".to_string()),
        status: Some("Finalizado".to_string()),
        genres: Some(vec!["Acción".to_string(), "Aventura".to_string()]),
        year: Some("2024".to_string()),
        rating: Some(4.8),
        source: "jkanime".to_string(),
        profile_id: Some("default".to_string()),
    };

    let serialized = serde_json::to_string(&anime).unwrap();
    assert!(serialized.contains("\"animeType\":\"TV\""));
    assert!(serialized.contains("\"thumbnailUrl\":\"https://example.com/thumb.jpg\""));

    let deserialized: AnimeResult = serde_json::from_str(&serialized).unwrap();
    assert_eq!(deserialized, anime);
}
