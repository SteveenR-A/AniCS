use anics_lib::scrapers::{JKAnimeExtractor, MundoDonghuaExtractor, AnimeExtractor};

#[tokio::test]
async fn test_jkanime_get_latest() {
    let extractor = JKAnimeExtractor::new();
    let results = extractor.get_latest(1).await.expect("Failed to get latest from JKAnime");
    println!("JKAnime Latest results count: {}", results.len());
    for r in results.iter().take(5) {
        println!(" - Title: '{}', Ep: {:?}, Thumb: '{}'", r.title, r.episode, r.thumbnail_url);
    }
    assert!(!results.is_empty(), "JKAnime get_latest returned empty results");
}

#[tokio::test]
async fn test_jkanime_search() {
    let extractor = JKAnimeExtractor::new();
    let results = extractor.search("naruto").await.expect("Failed to search on JKAnime");
    println!("JKAnime Search results count: {}", results.len());
    assert!(!results.is_empty(), "JKAnime search returned empty results");
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
    assert_eq!(det.episodes.len(), 8, "Expected 8 episodes for Koukaku Kidoutai (TV)");
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
