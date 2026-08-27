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
async fn test_genres_dynamic() {
    let jk = JKAnimeExtractor::new();
    let jk_genres = jk.get_genres().await.expect("Failed to get genres from JKAnime");
    println!("JKAnime dynamic genres count: {}", jk_genres.len());
    assert!(!jk_genres.is_empty());

    let md = MundoDonghuaExtractor::new();
    let md_genres = md.get_genres().await.expect("Failed to get genres from MundoDonghua");
    println!("MundoDonghua dynamic genres count: {}", md_genres.len());
    assert!(!md_genres.is_empty());
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
    let extractor = JKAnimeExtractor::new();
    let search = extractor.search("Koukaku Kidoutai").await.expect("Search failed");
    for item in &search {
        println!("Search item: title='{}', url='{}'", item.title, item.url);
        let det = extractor.get_details(&item.url).await.expect("Failed details");
        println!("Details: title='{}', episodes_count={}, status={:?}, season={:?}, studio={:?}",
            det.title, det.episodes.len(), det.status, det.season, det.studio);
    }
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
