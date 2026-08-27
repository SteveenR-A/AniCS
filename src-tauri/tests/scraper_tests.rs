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
    let top_html = anics_lib::scrapers::fetch_html("https://jkanime.net/top/", Some("https://jkanime.net/")).await.unwrap();
    let doc_top = scraper::Html::parse_document(&top_html);
    let sample = scraper::Selector::parse("a[href='https://jkanime.net/one-piece/']").unwrap();
    if let Some(a) = doc_top.select(&sample).next() {
        println!("Parent tag and class: <{}> class='{}'", a.parent().unwrap().value().as_element().unwrap().name(), a.parent().unwrap().value().as_element().unwrap().attr("class").unwrap_or(""));
        println!("Link HTML: {}", &a.html()[..std::cmp::min(300, a.html().len())]);
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
