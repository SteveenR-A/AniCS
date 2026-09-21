use anics_lib::scrapers::{JKAnimeExtractor, MundoDonghuaExtractor, OtakusTVExtractor, AnimeExtractor};
use anics_lib::core::SearchFilters;

#[tokio::test]
async fn test_jkanime_get_latest() {
    let extractor = JKAnimeExtractor::new();
    let results = extractor.get_latest(1).await.expect("Failed to get latest from JKAnime");
    println!("JKAnime Latest results count: {}", results.len());
    for r in results.iter().take(5) {
        println!(" - Title: '{}', Ep: {:?}, URL: '{}'", r.title, r.episode, r.url);
    }
    assert!(!results.is_empty(), "JKAnime get_latest returned empty results");
    // Comprobar que ningún resultado sea una tarjeta de Top Anime sin episodio
    for r in results.iter() {
        assert!(r.episode.is_some(), "JKAnime get_latest returned a non-episode anime: {}", r.title);
    }
}

#[tokio::test]
async fn test_jkanime_search() {
    let extractor = JKAnimeExtractor::new();
    let results = extractor.search("naruto").await.expect("Failed to search on JKAnime");
    println!("JKAnime Search results count: {}", results.len());
    assert!(!results.is_empty(), "JKAnime search returned empty results");

    let adv = extractor.advanced_search(&SearchFilters {
        query: Some("naruto".to_string()),
        page: 1,
        ..Default::default()
    }).await.expect("Failed advanced search");
    println!("JKAnime Advanced Search results count: {}, total_pages: {:?}", adv.results.len(), adv.total_pages);
    for r in adv.results.iter().take(3) {
        println!(" - {}", r.title);
    }
    assert!(!adv.results.is_empty(), "Advanced search for naruto returned empty");
}

#[tokio::test]
async fn test_jkanime_details_and_servers() {
    let extractor = JKAnimeExtractor::new();
    // Probar detalles de una serie conocida
    let details = extractor.get_details("https://jkanime.net/naruto/").await.expect("Failed to get anime details");
    println!("JKAnime Details: title='{}', episodes_count={}", details.title, details.episodes.len());
    assert!(!details.title.is_empty());
    assert!(!details.episodes.is_empty());

    // Probar servidores de un episodio
    let servers = extractor.get_servers("https://jkanime.net/naruto/1/").await.expect("Failed to get episode servers");
    println!("JKAnime Servers count: {}", servers.len());
    for s in servers.iter() {
        println!(" - Server: {} | Direct: {} | URL: {}", s.name, s.is_direct, s.url);
        let resolved = extractor.resolve_stream(s).await;
        match resolved {
            Ok(media) => println!("   -> Resolved: direct_url='{}', type={:?}", media.direct_url, media.media_type),
            Err(e) => println!("   -> Error resolving: {:?}", e),
        }
    }
    assert!(!servers.is_empty());
}

#[tokio::test]
async fn test_mundodonghua_get_latest() {
    let extractor = MundoDonghuaExtractor::new();
    let results = extractor.get_latest(1).await.expect("Failed to get latest from MundoDonghua");
    println!("MundoDonghua Latest results count: {}", results.len());
    for r in results.iter().take(5) {
        println!(" - Title: '{}', Ep: {:?}, URL: '{}'", r.title, r.episode, r.url);
    }
    assert!(!results.is_empty(), "MundoDonghua get_latest returned empty results");
}

#[tokio::test]
async fn test_jkanime_schedule_and_top() {
    let extractor = JKAnimeExtractor::new();
    let days = extractor.get_schedule_days().await.expect("Failed to get schedule days");
    println!("JKAnime schedule days count: {}", days.len());
    assert!(!days.is_empty(), "Schedule days should not be empty");

    for d in &days {
        println!("Day: {} - Animes: {}", d.day, d.animes.len());
        let mut seen = std::collections::HashSet::new();
        for a in &d.animes {
            assert!(!seen.contains(&a.url), "Duplicate anime url found in day {}: {}", d.day, a.url);
            seen.insert(a.url.clone());
            assert!(!a.title.to_lowercase().starts_with("último capítulo"), "Invalid title found: {}", a.title);
        }
    }
}

#[tokio::test]
async fn test_jkanime_poster_extraction() {
    let extractor = JKAnimeExtractor::new();
    let details = extractor.get_details("https://jkanime.net/lv999-no-murabito/").await.expect("Failed to get anime details");
    println!("Lv999 Details: title='{}', thumbnail='{}'", details.title, details.thumbnail_url);
    assert!(!details.thumbnail_url.is_empty());
    assert!(!details.thumbnail_url.contains("logo"));
    assert!(details.thumbnail_url.ends_with(".jpg") || details.thumbnail_url.ends_with(".png") || details.thumbnail_url.ends_with(".webp"));
}

#[tokio::test]
async fn test_koukaku_kidoutai_details() {
    let url = "https://jkanime.net/koukaku-kidoutai-tv/";
    let extractor = JKAnimeExtractor::new();
    let det = extractor.get_details(url).await.expect("Failed to get details");
    println!("Koukaku Kidoutai Details: title='{}', episodes_count={}", det.title, det.episodes.len());
    for ep in det.episodes.iter() {
        println!(" - Ep {}: url='{}'", ep.number, ep.url);
    }
    assert!(det.episodes.len() >= 8, "Expected at least 8 episodes for Koukaku Kidoutai (TV)");
}

#[tokio::test]
async fn test_bandori_details_and_download() {
    let extractor = JKAnimeExtractor::new();
    let search = extractor.search("Bandori-chan").await.expect("Failed to search Bandori");
    println!("Bandori search count: {}", search.len());
    for item in &search {
        println!("Bandori item: title='{}', url='{}'", item.title, item.url);
        let det = extractor.get_details(&item.url).await.expect("Failed details");
        println!("Bandori episodes: {}", det.episodes.len());
        if let Some(ep) = det.episodes.first() {
            let srvs = extractor.get_servers(&ep.url).await.expect("Failed servers");
            println!("Bandori Servers count: {}", srvs.len());
            for s in &srvs {
                println!(" - Server: name='{}', url='{}'", s.name, s.url);
                match extractor.resolve_stream(s).await {
                    Ok(media) => {
                        println!("   -> Resolved direct_url='{}', type={:?}", media.direct_url, media.media_type);
                    }
                    Err(e) => println!("   -> Failed to resolve: {}", e),
                }
            }
        }
    }
}

#[tokio::test]
async fn test_mundodonghua_full_flow() {
    let extractor = MundoDonghuaExtractor::new();
    let schedule = extractor.get_schedule().await.expect("Failed schedule");
    println!("MundoDonghua Schedule items count: {}", schedule.len());
    for s in schedule.iter().take(5) {
        println!(" - Title: '{}', URL: '{}', Thumb: '{}'", s.title, s.url, s.thumbnail_url);
        // Verify URL is absolute
        assert!(s.url.starts_with("http"), "Schedule URL must be absolute: {}", s.url);
    }

    // Probar Against the Gods 2
    let atg2_url = "https://www.mundodonghua.com/donghua/against-the-gods-2";
    let details = extractor.get_details(atg2_url).await.expect("Failed details for Against the Gods 2");
    println!("Against the Gods 2: title='{}', thumb='{}', eps count={}, status={:?}, total_eps={:?}, synopsis='{}'",
        details.title, details.thumbnail_url, details.episodes.len(), details.status, details.total_episodes, details.synopsis);
    
    if let Some(first_ep) = details.episodes.first() {
        println!("First Ep in list: number={}, url='{}'", first_ep.number, first_ep.url);
        assert_eq!(first_ep.number, 1);
        assert!(first_ep.url.ends_with("/1"));

        let servers = extractor.get_servers(&first_ep.url).await.expect("Failed servers");
        println!("Servers count: {}", servers.len());
        assert!(!servers.is_empty());
        assert!(servers[0].name.contains("Vidhide"), "Expected Vidhide to be ranked first: {}", servers[0].name);

        let res = extractor.resolve_stream(&servers[0]).await.expect("Failed to resolve Vidhide");
        assert_eq!(res.media_type, anics_lib::core::MediaType::Hls);
        assert!(!res.direct_url.is_empty());
    }
}

#[tokio::test]
async fn test_otakustv_hex_decoding() {
    let hex = "68747470733a2f2f6279736573756b696f722e636f6d2f652f71326d69316b766b75397a61";
    let decoded = OtakusTVExtractor::decode_hex(hex).expect("Failed to decode hex string");
    assert_eq!(decoded, "https://bysesukior.com/e/q2mi1kvku9za");
}

#[tokio::test]
async fn test_otakustv_get_latest() {
    let extractor = OtakusTVExtractor::new();
    let results = extractor.get_latest(1).await.expect("Failed to get latest from OtakusTV");
    println!("OtakusTV Latest results count: {}", results.len());
    for r in results.iter().take(5) {
        println!(" - Title: '{}', Ep: {:?}, URL: '{}'", r.title, r.episode, r.url);
        assert!(r.url.starts_with("http"), "URL must be absolute: {}", r.url);
    }
    assert!(!results.is_empty(), "OtakusTV get_latest returned empty results");
}

#[tokio::test]
async fn test_otakustv_search() {
    let extractor = OtakusTVExtractor::new();
    let results = extractor.search("naruto").await.expect("Failed to search on OtakusTV");
    println!("OtakusTV Search results count: {}", results.len());
    for r in results.iter().take(3) {
        println!(" - Title: '{}', URL: '{}', Thumb: '{}'", r.title, r.url, r.thumbnail_url);
        assert!(r.url.starts_with("http"), "Search URL must be absolute: {}", r.url);
    }
    assert!(!results.is_empty(), "OtakusTV search returned empty results");
}

#[tokio::test]
async fn test_otakustv_details_and_servers() {
    let extractor = OtakusTVExtractor::new();
    let details = extractor.get_details("https://www.otakustv.net/anime/naruto-shippuden-the-movie-bonds").await
        .expect("Failed to get anime details from OtakusTV");
    println!("OtakusTV Details: title='{}', episodes_count={}, status='{:?}', genres={:?}",
        details.title, details.episodes.len(), details.status, details.genres);
    assert!(!details.title.is_empty());
    assert!(!details.episodes.is_empty());

    let servers = extractor.get_servers("https://www.otakustv.net/ver/naruto-shippuden-the-movie-bonds-1").await
        .expect("Failed to get servers from OtakusTV");
    println!("OtakusTV Servers count: {}", servers.len());
    for s in servers.iter() {
        println!(" - Server: '{}', URL: '{}', Direct: {}", s.name, s.url, s.is_direct);
        assert!(s.url.starts_with("http"), "Server URL must be absolute: {}", s.url);
    }
    assert!(!servers.is_empty(), "OtakusTV should return video servers");
}



