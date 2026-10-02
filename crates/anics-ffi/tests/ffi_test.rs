use anics_ffi::NativeCatalogClient;

// Exercise the actual foreign-executor ABI, without #[tokio::test]. A direct
// Rust .await inside a Tokio test would hide the Android "no reactor" regression.
#[test]
fn foreign_executor_can_run_catalog_http_without_a_tokio_context() {
    use anics_ffi::{NativeAnimeResult, NativeSearchFilters, NativeSearchResultPage, UniFfiTag};
    use std::{
        io::{Read, Write},
        sync::{mpsc, Arc},
        time::Duration,
    };
    use uniffi::{FfiConverter, RustCallStatus, RustCallStatusCode, RustFuturePoll};

    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(10)))
            .unwrap();
        let mut request = [0; 4096];
        socket.read(&mut request).unwrap();
        let body = r#"<article class="li"><figure class="i"><a href="/anime"><img src="/cover.jpg"></a></figure><h3 class="h"><a>Fixture</a></h3></article>"#;
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    });
    extern "C" fn continuation(data: u64, result: RustFuturePoll) {
        // The sender stays alive until the future is freed below.
        let sender = unsafe { &*(data as *const mpsc::Sender<RustFuturePoll>) };
        let _ = sender.send(result);
    }
    let client = Arc::new(NativeCatalogClient::new(Some(format!(
        r#"{{"otakustv_base_url":"http://{address}"}}"#
    ))));
    let filters = NativeSearchFilters {
        query: None,
        genre: None,
        status: None,
        anime_type: None,
        year: None,
        order_by: None,
        page: 1,
    };
    let ptr = <Arc<NativeCatalogClient> as FfiConverter<UniFfiTag>>::lower(client);
    let source = <String as FfiConverter<UniFfiTag>>::lower("otakustv".into());
    let filters = <NativeSearchFilters as FfiConverter<UniFfiTag>>::lower(filters);
    let handle = anics_ffi::uniffi_anics_ffi_fn_method_nativecatalogclient_advanced_search(
        ptr, filters, source,
    );
    let (sender, receiver) = mpsc::channel();
    let callback_data = &sender as *const mpsc::Sender<RustFuturePoll> as u64;
    loop {
        unsafe {
            anics_ffi::ffi_anics_ffi_rust_future_poll_rust_buffer(
                handle,
                continuation,
                callback_data,
            )
        };
        if receiver.recv_timeout(Duration::from_secs(15)).unwrap() == RustFuturePoll::Ready {
            break;
        }
    }
    let mut status = RustCallStatus::default();
    let buffer =
        unsafe { anics_ffi::ffi_anics_ffi_rust_future_complete_rust_buffer(handle, &mut status) };
    unsafe { anics_ffi::ffi_anics_ffi_rust_future_free_rust_buffer(handle) };
    assert_eq!(status.code, RustCallStatusCode::Success);
    let page = <NativeSearchResultPage as FfiConverter<UniFfiTag>>::try_lift(buffer).unwrap();
    let results: Vec<NativeAnimeResult> = page.results;
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title, "Fixture");
    server.join().unwrap();
}

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
