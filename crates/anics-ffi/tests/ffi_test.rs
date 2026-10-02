use anics_ffi::NativeCatalogClient;

#[test]
fn test_ffi_client_initialization_and_sources() {
    let client = NativeCatalogClient::new(None);
    let sources = client.get_available_sources();
    assert_eq!(sources.len(), 3);
    assert_eq!(sources[0].id, "jkanime");
    assert_eq!(sources[1].id, "mundodonghua");
    assert_eq!(sources[2].id, "otakustv");
}

#[test]
fn test_ffi_unpacker() {
    let client = NativeCatalogClient::new(None);
    let script = "eval(function(p,a,c,k,e,d){\nwhile(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);\nreturn p\n}('0 1 = \"2://3/4/5.6\";',7,7,'var|video_url|https|cdn.example.com|stream|master|m3u8'.split('|')))";
    let unpacked = client.unpack_js(script.to_string());
    assert!(unpacked.is_some());
    let stream = client.extract_stream_url(script.to_string());
    assert_eq!(
        stream.as_deref(),
        Some("https://cdn.example.com/stream/master.m3u8")
    );
}

#[test]
fn test_ffi_settings_update() {
    let client = NativeCatalogClient::new(None);
    let settings = r#"{
        "jkanime_base_url": "https://custom.jkanime.test",
        "custom_sources": "[{\"name\":\"Custom Donghua\",\"url\":\"https://donghua.test\",\"type\":\"donghua\"}]"
    }"#;
    client.update_settings(settings.to_string());
    let sources = client.get_available_sources();
    assert_eq!(sources.len(), 4);
    assert_eq!(sources[0].base_url, "https://custom.jkanime.test");
    assert_eq!(sources[3].id, "custom_0");
    assert_eq!(sources[3].base_url, "https://donghua.test");
}
