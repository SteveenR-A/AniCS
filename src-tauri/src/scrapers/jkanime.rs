use async_trait::async_trait;
use regex::Regex;
use scraper::Html;
use once_cell::sync::Lazy;
use reqwest::header;
use std::collections::HashMap;

use crate::core::*;
use super::{attr, fetch_html, inner_text, normalize_url, select_nodes, AnimeExtractor, HTTP_CLIENT};
use crate::core::unpacker::JsUnpacker;

pub const DEFAULT_JKANIME_URL: &str = "https://jkanime.net";

static EPISODE_ID_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"anime_id\s*=\s*["']?(\d+)["']?"#).unwrap()
});

static VIDEO_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"video\[(\d+)\]\s*=\s*'([^']+)'"#).unwrap()
});

static NAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"data-id=["'](\d+)["'][^>]*>([^<]+)<"#).unwrap()
});

static SRC_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"src=["']([^"']+)["']"#).unwrap()
});

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<iframe[^>]+src=["']([^"']+)["']"#).unwrap()
});

static MF_RE1: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"aria-label="Download file"\s+href="([^"]+)""#).unwrap()
});

static MF_RE2: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"https?://download\d+\.mediafire\.com/[^\s"'<>]+"#).unwrap()
});

pub struct JKAnimeExtractor {
    base_url: String,
}

impl JKAnimeExtractor {
    pub fn new() -> Self {
        let base = crate::storage::get_setting("jkanime_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| DEFAULT_JKANIME_URL.to_string());
        Self { base_url: base }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self { base_url }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }
}

#[async_trait]
impl AnimeExtractor for JKAnimeExtractor {
    fn id(&self) -> &'static str { "jkanime" }
    fn name(&self) -> &'static str { "JKAnime" }
    fn base_url(&self) -> &str { &self.base_url }

    // Búsqueda
    async fn search(&self, query: &str) -> AppResult<Vec<AnimeResult>> {
        let url = self.url(&format!("/buscar/{}/", urlencoding::encode(query)));
        let html = fetch_html(&url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        for item in select_nodes(&doc, "div.anime__item") {
            let link = item.select(&scraper::Selector::parse("div.anime__item__text h5 a").unwrap())
                .next();
            let pic = item.select(&scraper::Selector::parse("div.anime__item__pic, div[class*='anime__item__pic']").unwrap())
                .next();

            if let Some(a) = link {
                let href = attr(&a, "href");
                let title = inner_text(&a);
                if href.is_empty() || title.is_empty() { continue; }

                let thumbnail = pic.map(|p| attr(&p, "data-setbg")).unwrap_or_default();
                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: thumbnail,
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

        let card_sel = scraper::Selector::parse("div.card").unwrap();
        let title_sel = scraper::Selector::parse("h5.card-title a").unwrap();
        let img_sel = scraper::Selector::parse("img.card-img-top, div.card-img-top").unwrap();
        let ep_sel = scraper::Selector::parse("span.badge, div.card-chapter").unwrap();

        for card in doc.select(&card_sel) {
            if let Some(a) = card.select(&title_sel).next() {
                let href = attr(&a, "href");
                let title = inner_text(&a);
                if href.is_empty() { continue; }

                let thumbnail = card.select(&img_sel).next()
                    .map(|img| {
                        let src = attr(&img, "src");
                        if src.is_empty() { attr(&img, "data-setbg") } else { src }
                    })
                    .unwrap_or_default();

                let episode = card.select(&ep_sel).next()
                    .map(|ep| inner_text(&ep));

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: thumbnail,
                    episode,
                    source: self.id().to_string(),
                    ..Default::default()
                });
            }
        }
        Ok(results)
    }

    // Horario semanal
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        let url = self.url("/horario/");
        let html = fetch_html(&url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        for a in select_nodes(&doc, "div.boxx a") {
            let href = attr(&a, "href");
            let title = inner_text(&a);
            if href.is_empty() || title.is_empty() { continue; }
            results.push(AnimeResult {
                title,
                url: normalize_url(&href, &self.base_url),
                source: self.id().to_string(),
                ..Default::default()
            });
        }
        Ok(results)
    }

    // Detalles de serie
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        let html = fetch_html(url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {url}")));
        }

        let (title, thumbnail, synopsis, genres, anime_id) = {
            let doc = Html::parse_document(&html);

            let title = select_nodes(&doc, "h2.anime__details__title h3")
                .first()
                .map(|n| inner_text(n))
                .or_else(|| select_nodes(&doc, "h1").first().map(|n| inner_text(n)))
                .unwrap_or_default();

            let thumbnail = select_nodes(&doc, "div.anime__details__pic")
                .first()
                .map(|n| attr(n, "data-setbg"))
                .unwrap_or_default();

            let synopsis = select_nodes(&doc, "div.anime__details__text p")
                .first()
                .map(|n| inner_text(n))
                .unwrap_or_default();

            let genres: Vec<String> = select_nodes(&doc, "div.anime__details__widget li")
                .iter()
                .filter_map(|li| {
                    let text = inner_text(li);
                    if text.to_lowercase().contains("género") || text.to_lowercase().contains("genero") {
                        None
                    } else {
                        Some(text)
                    }
                })
                .take(10)
                .collect();

            let anime_id = EPISODE_ID_RE.captures(&html)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            (title, thumbnail, synopsis, genres, anime_id)
        };

        let episodes = if let Some(id) = anime_id {
            self.fetch_episodes_ajax(&id, url).await.unwrap_or_default()
        } else {
            vec![]
        };

        Ok(AnimeDetails {
            title,
            url: url.to_string(),
            thumbnail_url: thumbnail,
            synopsis,
            genres,
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

        let mut name_map: HashMap<String, String> = HashMap::new();
        for cap in NAME_RE.captures_iter(&html) {
            name_map.insert(cap[1].to_string(), cap[2].trim().to_string());
        }

        for cap in VIDEO_RE.captures_iter(&html) {
            let id = &cap[1];
            let iframe_html = &cap[2];

            if let Some(src_cap) = SRC_RE.captures(iframe_html) {
                let src = src_cap[1].replace(r#"\"#, "");
                let name = name_map.get(id).cloned().unwrap_or_else(|| format!("Servidor {id}"));
                let is_direct = ["desu", "magi", "mediafire", "jkplayer"]
                    .iter().any(|s| src.to_lowercase().contains(s));

                servers.push(VideoServer {
                    name,
                    url: src,
                    is_direct,
                    referer: Some(self.base_url.clone()),
                });
            }
        }

        Ok(servers)
    }

    // Resolver de URL de video
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        if url.contains("/jkplayer") || url.contains("desu.php") || url.contains("magi")
            || url.contains("c1.php") || url.contains("c2.php") || url.contains("jkanime.net")
        {
            let html = fetch_html(url, server.referer.as_deref()).await
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

            if let Some(nested) = IFRAME_RE.captures(&html).and_then(|c| c.get(1)) {
                let nested_url = nested.as_str().replace(r#"\"#, "");
                let nested_html = fetch_html(&nested_url, Some(url)).await
                    .map_err(AppError::Network)?;
                if let Some(stream_url) = JsUnpacker::extract_stream_url(&nested_html) {
                    let media_type = detect_media_type(&stream_url);
                    return Ok(ResolvedMedia {
                        direct_url: stream_url,
                        media_type,
                        referer: Some(nested_url),
                        user_agent: None,
                        qualities: vec![],
                    });
                }
            }
        }

        if url.contains("mediafire.com") {
            if let Some(dl_url) = resolve_mediafire(url).await {
                return Ok(ResolvedMedia {
                    direct_url: dl_url,
                    media_type: MediaType::Mp4,
                    referer: None,
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        let media_type = detect_media_type(url);
        Ok(ResolvedMedia {
            direct_url: url.clone(),
            media_type,
            referer: server.referer.clone(),
            user_agent: None,
            qualities: vec![],
        })
    }
}

impl JKAnimeExtractor {
    async fn fetch_episodes_ajax(&self, anime_id: &str, referer: &str) -> AppResult<Vec<Episode>> {
        let csrf_url = self.url(&format!("/{}/", anime_id));
        let _ = fetch_html(&csrf_url, Some(&self.base_url)).await;

        let ajax_url = self.url(&format!("/ajax/episodes/{}/1", anime_id));
        let resp = HTTP_CLIENT
            .post(&ajax_url)
            .header(header::REFERER, referer)
            .header("X-Requested-With", "XMLHttpRequest")
            .send()
            .await
            .map_err(AppError::Network)?;

        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let json: serde_json::Value = resp.json().await
            .map_err(|_| AppError::Parse("Invalid JSON from episodes API".to_string()))?;

        let mut episodes = vec![];
        if let Some(data) = json["data"].as_array() {
            for ep in data {
                let number = ep["number"].as_u64().unwrap_or(0) as u32;
                let ep_url = format!("{}/{}/", referer.trim_end_matches('/'), number);
                let thumbnail = ep["image"].as_str().map(|s| s.to_string());

                episodes.push(Episode {
                    number,
                    title: Some(format!("Episodio {number}")),
                    url: ep_url,
                    thumbnail_url: thumbnail,
                    watched: false,
                    watch_progress: None,
                });
            }
        }

        episodes.sort_by_key(|e| e.number);
        Ok(episodes)
    }
}

fn detect_media_type(url: &str) -> MediaType {
    let path = url.split('?').next().unwrap_or(url).to_lowercase();
    if path.contains(".m3u8") { MediaType::Hls }
    else if path.contains(".mp4") || path.contains(".mkv") { MediaType::Mp4 }
    else { MediaType::Unknown }
}

async fn resolve_mediafire(page_url: &str) -> Option<String> {
    let html = fetch_html(page_url, None).await.ok()?;
    if html.is_empty() { return None; }

    if let Some(cap) = MF_RE1.captures(&html) {
        return Some(cap[1].to_string());
    }

    MF_RE2.find(&html).map(|m| m.as_str().to_string())
}
