use async_trait::async_trait;
use regex::Regex;
use scraper::Html;
use once_cell::sync::Lazy;

use crate::core::*;
use super::{attr, fetch_html, inner_text, normalize_url, select_nodes, AnimeExtractor};
use crate::core::unpacker::JsUnpacker;

pub const DEFAULT_MUNDODONGHUA_URL: &str = "https://www.mundodonghua.com";

static REDIRECT_MEDIA_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"https?://[^\s"'<>\\]+\.(?:m3u8|mp4)[^\s"'<>\\]*"#).unwrap()
});

static DIGIT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\d+").unwrap()
});

pub struct MundoDonghuaExtractor {
    base_url: String,
}

impl MundoDonghuaExtractor {
    pub fn new() -> Self {
        let base = crate::storage::get_setting("mundodonghua_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| DEFAULT_MUNDODONGHUA_URL.to_string());
        Self { base_url: base }
    }

    #[allow(dead_code)]
    pub fn with_base_url(base_url: String) -> Self {
        Self { base_url }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

#[async_trait]
impl AnimeExtractor for MundoDonghuaExtractor {
    fn id(&self) -> &'static str { "mundodonghua" }
    fn name(&self) -> &'static str { "MundoDonghua" }
    fn base_url(&self) -> &str { &self.base_url }

    // Búsqueda
    async fn search(&self, query: &str) -> AppResult<Vec<AnimeResult>> {
        let url = self.url(&format!("/lista-donghuas?q={}", urlencoding::encode(query)));
        let html = fetch_html(&url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        for card in select_nodes(&doc, "div.donghua-item, div.list-item") {
            let a = card.select(&scraper::Selector::parse("a").unwrap()).next();
            let img = card.select(&scraper::Selector::parse("img").unwrap()).next();
            let title_el = card.select(&scraper::Selector::parse("h5, h4, .title").unwrap()).next();

            if let Some(a_node) = a {
                let href = attr(&a_node, "href");
                if href.is_empty() { continue; }

                let title = title_el.map(|t| inner_text(&t))
                    .unwrap_or_else(|| attr(&a_node, "title"));
                if title.is_empty() { continue; }

                let thumbnail = img.map(|i| {
                    let src = attr(&i, "src");
                    if src.is_empty() { attr(&i, "data-src") } else { src }
                }).unwrap_or_default();

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: thumbnail,
                    anime_type: Some("Donghua".to_string()),
                    source: self.id().to_string(),
                    ..Default::default()
                });
            }
        }
        Ok(results)
    }

    // Últimos episodios
    async fn get_latest(&self, _page: u32) -> AppResult<Vec<AnimeResult>> {
        let html = fetch_html(&self.base_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        for card in select_nodes(&doc, "div.donghua-episode, div.caplist-item, div.col-md-3") {
            let a = card.select(&scraper::Selector::parse("a").unwrap()).next();
            let img = card.select(&scraper::Selector::parse("img").unwrap()).next();
            let ep_el = card.select(&scraper::Selector::parse("span.ep, .episode-num, .cap-num").unwrap()).next();

            if let Some(a_node) = a {
                let href = attr(&a_node, "href");
                if href.is_empty() { continue; }

                let title = if !attr(&a_node, "title").is_empty() {
                    attr(&a_node, "title")
                } else {
                    inner_text(&a_node)
                };
                if title.is_empty() { continue; }

                let thumbnail = img.map(|i| {
                    let src = attr(&i, "src");
                    if src.is_empty() { attr(&i, "data-src") } else { src }
                }).unwrap_or_default();

                let episode = ep_el.map(|e| inner_text(&e));

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: thumbnail,
                    episode,
                    anime_type: Some("Donghua".to_string()),
                    source: self.id().to_string(),
                    ..Default::default()
                });
            }
        }
        Ok(results)
    }

    // Horario
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        Ok(vec![])
    }

    // Detalles
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        let html = fetch_html(url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {url}")));
        }

        let doc = Html::parse_document(&html);

        let title = select_nodes(&doc, "h1.donghua-title, h1.series-title, h1")
            .first()
            .map(|n| inner_text(n))
            .unwrap_or_default();

        let thumbnail = select_nodes(&doc, "div.donghua-cover img, img.cover-img, img.series-img")
            .first()
            .map(|n| {
                let src = attr(n, "src");
                if src.is_empty() { attr(n, "data-src") } else { src }
            })
            .unwrap_or_default();

        let synopsis = select_nodes(&doc, "div.synopsis, div.description, p.sinopsis")
            .first()
            .map(|n| inner_text(n))
            .unwrap_or_default();

        let mut episodes: Vec<Episode> = select_nodes(&doc, "div.cap-list a, ul.episodes-list a, div.episodios a")
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let href = attr(a, "href");
                let text = inner_text(a);
                let number = DIGIT_RE.find(&text)
                    .and_then(|m| m.as_str().parse().ok())
                    .unwrap_or((i + 1) as u32);

                Episode {
                    number,
                    title: Some(format!("Episodio {number}")),
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: None,
                    watched: false,
                    watch_progress: None,
                }
            })
            .collect();

        episodes.sort_by_key(|e| e.number);

        Ok(AnimeDetails {
            title,
            url: url.to_string(),
            thumbnail_url: thumbnail,
            synopsis,
            genres: vec![],
            episodes,
            source: self.id().to_string(),
            ..Default::default()
        })
    }

    // Servidores de video
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        let html = fetch_html(episode_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let mut servers = vec![];
        let doc = Html::parse_document(&html);
        let iframes = select_nodes(&doc, "iframe#player, iframe.player, iframe[src*='player']");

        if let Some(iframe) = iframes.first() {
            let src = attr(iframe, "src");
            if !src.is_empty() {
                servers.push(VideoServer {
                    name: "MundoDonghua".to_string(),
                    url: normalize_url(&src, &self.base_url),
                    is_direct: false,
                    referer: Some(self.base_url.clone()),
                });
            }
        }

        for btn in select_nodes(&doc, "a.btn-server, a[data-server]") {
            let server_url = if !attr(&btn, "data-url").is_empty() {
                attr(&btn, "data-url")
            } else {
                attr(&btn, "href")
            };
            let name = inner_text(&btn);

            if !server_url.is_empty() {
                servers.push(VideoServer {
                    name: if name.is_empty() { "Servidor".to_string() } else { name },
                    url: normalize_url(&server_url, &self.base_url),
                    is_direct: false,
                    referer: Some(self.base_url.clone()),
                });
            }
        }

        Ok(servers)
    }

    // Resolver de stream
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        let resolved_url = if url.contains("redirector.php") {
            resolve_redirector(url, &self.base_url).await.unwrap_or_else(|| url.clone())
        } else {
            url.clone()
        };

        let html = fetch_html(&resolved_url, server.referer.as_deref()).await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Err(AppError::Resolver("Empty player page".to_string()));
        }

        if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
            let media_type = detect_media_type(&stream_url);
            return Ok(ResolvedMedia {
                direct_url: stream_url,
                media_type,
                referer: Some(self.base_url.clone()),
                user_agent: None,
                qualities: vec![],
            });
        }

        Err(AppError::Resolver(format!("Could not resolve stream from: {resolved_url}")))
    }
}

fn detect_media_type(url: &str) -> MediaType {
    let path = url.split('?').next().unwrap_or(url).to_lowercase();
    if path.contains(".m3u8") { MediaType::Hls }
    else if path.contains(".mp4") || path.contains(".mkv") { MediaType::Mp4 }
    else { MediaType::Unknown }
}

async fn resolve_redirector(url: &str, base: &str) -> Option<String> {
    use crate::scrapers::HTTP_CLIENT;
    use reqwest::header;

    let resp = HTTP_CLIENT
        .get(url)
        .header(header::REFERER, base)
        .header("Origin", base)
        .send()
        .await
        .ok()?;

    let final_url = resp.url().to_string();
    if !final_url.contains("redirector.php") {
        return Some(final_url);
    }

    let html = resp.text().await.ok()?;
    REDIRECT_MEDIA_RE.find(&html).map(|m| m.as_str().to_string())
}
