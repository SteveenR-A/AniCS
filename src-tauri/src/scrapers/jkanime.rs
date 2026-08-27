use std::collections::HashMap;
use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use reqwest::header;

use crate::core::*;
use crate::scrapers::{fetch_html, AnimeExtractor, HTTP_CLIENT};

const DEFAULT_JKANIME_URL: &str = "https://jkanime.net";

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<iframe[^>]+src=["']([^"']+)["']"#).unwrap()
});

static VIDEO_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"video\[(\d+)\]\s*=\s*'<iframe[^>]+src="([^"]+)""#).unwrap()
});

static NAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"names\[(\d+)\]\s*=\s*'([^']+)'"#).unwrap()
});

static EPISODE_ID_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?:ajax/episodes/|data-anime=["'])(\d+)"#).unwrap()
});

static TOTAL_EP_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"Episodios:</span>\s*(\d+)"#).unwrap()
});

static CSRF_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"name="csrf-token"\s+content="([^"]+)""#).unwrap()
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

    #[allow(dead_code)]
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

        let item_sel = Selector::parse("div.anime__item").unwrap();
        let title_sel = Selector::parse("div.anime__item__text h5 a, h5 a, h5, .title").unwrap();
        let pic_sel = Selector::parse("div.anime__item__pic, div[class*='anime__item__pic'], img").unwrap();
        let a_sel = Selector::parse("a").unwrap();

        for item in doc.select(&item_sel) {
            let href = item.select(&a_sel).next().map(|a| attr(&a, "href")).unwrap_or_default();
            let title = item.select(&title_sel).next().map(|h| inner_text(&h)).unwrap_or_default();

            if href.is_empty() || title.is_empty() { continue; }

            let thumbnail = item.select(&pic_sel).next().map(|p| {
                let bg = attr(&p, "data-setbg");
                if !bg.is_empty() { bg } else { attr(&p, "src") }
            }).unwrap_or_default();

            results.push(AnimeResult {
                title,
                url: normalize_url(&href, &self.base_url),
                thumbnail_url: thumbnail,
                source: self.id().to_string(),
                ..Default::default()
            });
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

        let card_sel = Selector::parse("div.dir1 div.card, div.card").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let title_sel = Selector::parse("h5.card-title, h5[class*='card-title'], h5").unwrap();
        let img_sel = Selector::parse("img.card-img-top, img[class*='card-img-top'], img").unwrap();
        let ep_sel = Selector::parse("span.badge, span.badge-primary, span[class*='badge']").unwrap();

        for card in doc.select(&card_sel) {
            if let Some(a) = card.select(&link_sel).next() {
                let href = attr(&a, "href");
                if href.is_empty() { continue; }

                let title = a.select(&title_sel).next()
                    .map(|h| inner_text(&h))
                    .unwrap_or_else(|| inner_text(&a));
                if title.is_empty() { continue; }

                let thumbnail = a.select(&img_sel).next()
                    .map(|img| {
                        let pic = attr(&img, "data-animepic");
                        if !pic.is_empty() { pic } else {
                            let bg = attr(&img, "data-setbg");
                            if !bg.is_empty() { bg } else { attr(&img, "src") }
                        }
                    })
                    .unwrap_or_default();

                let episode = a.select(&ep_sel).next()
                    .map(|ep| inner_text(&ep).replace("Ep ", "").trim().to_string());

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
        let link_sel = Selector::parse("div.boxx a").unwrap();

        for a in doc.select(&link_sel) {
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
        let clean_url = normalize_series_url(url);
        let html = fetch_html(&clean_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {clean_url}")));
        }

        let (title, thumbnail, synopsis, genres, anime_id, csrf_token, total_ep_hint) = {
            let doc = Html::parse_document(&html);

            let title_sel = Selector::parse("div.anime_info h3, h2.anime__details__title h3, h1").unwrap();
            let title = doc.select(&title_sel).next()
                .map(|n| inner_text(&n))
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| {
                    let og_sel = Selector::parse("meta[property='og:title']").unwrap();
                    doc.select(&og_sel).next()
                        .map(|m| attr(&m, "content").replace(" - anime", "").replace(" online JkAnime", ""))
                        .unwrap_or_default()
                });

            let pic_sel = Selector::parse("div.anime_pic img, div.movpic img, div.anime__details__pic, img").unwrap();
            let thumbnail = doc.select(&pic_sel).next()
                .map(|n| {
                    let src = attr(&n, "src");
                    if !src.is_empty() { src } else { attr(&n, "data-setbg") }
                })
                .unwrap_or_default();

            let syn_sel = Selector::parse("div.anime_info p, p.scroll, div.anime__details__text p, p#sinopsis").unwrap();
            let synopsis = doc.select(&syn_sel).next()
                .map(|n| inner_text(&n))
                .unwrap_or_default();

            let genre_sel = Selector::parse("div.anime_data li a[href*='/genero/'], a[href*='/genero/']").unwrap();
            let genres: Vec<String> = doc.select(&genre_sel)
                .map(|a| inner_text(&a))
                .take(10)
                .collect();

            let anime_id = EPISODE_ID_RE.captures(&html)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            let csrf_token = CSRF_RE.captures(&html)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            let total_ep_hint = TOTAL_EP_RE.captures(&html)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok());

            (title, thumbnail, synopsis, genres, anime_id, csrf_token, total_ep_hint)
        };

        let episodes = if let Some(id) = &anime_id {
            let ajax_eps = self.fetch_episodes_ajax(id, &clean_url, csrf_token.as_deref()).await.unwrap_or_default();
            if !ajax_eps.is_empty() {
                ajax_eps
            } else if let Some(tot) = total_ep_hint {
                self.generate_episodes_list(&clean_url, tot)
            } else {
                vec![]
            }
        } else if let Some(tot) = total_ep_hint {
            self.generate_episodes_list(&clean_url, tot)
        } else {
            vec![]
        };

        Ok(AnimeDetails {
            title,
            url: clean_url,
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
            let idx = &cap[1];
            let raw_url = &cap[2];

            let server_url = raw_url.replace(r#"\"#, "");
            let server_name = name_map.get(idx)
                .cloned()
                .unwrap_or_else(|| format!("Servidor {}", idx));

            let is_direct = server_url.contains("desu.php")
                || server_url.contains("magi")
                || server_url.contains("/jkplayer")
                || server_url.contains("mediafire.com");

            servers.push(VideoServer {
                name: server_name,
                url: server_url,
                is_direct,
                referer: Some(episode_url.to_string()),
            });
        }

        // Fallback si no hay scripts con video[]
        if servers.is_empty() {
            if let Some(iframe) = IFRAME_RE.captures(&html).and_then(|c| c.get(1)) {
                let iframe_url = iframe.as_str().replace(r#"\"#, "");
                servers.push(VideoServer {
                    name: "Reproductor Principal".to_string(),
                    url: iframe_url,
                    is_direct: true,
                    referer: Some(episode_url.to_string()),
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
    async fn fetch_episodes_ajax(&self, anime_id: &str, referer: &str, csrf: Option<&str>) -> AppResult<Vec<Episode>> {
        let ajax_url = self.url(&format!("/ajax/episodes/{}/1", anime_id));
        let mut req = HTTP_CLIENT
            .post(&ajax_url)
            .header(header::REFERER, referer)
            .header("X-Requested-With", "XMLHttpRequest")
            .header(header::ACCEPT, "application/json");

        if let Some(token) = csrf {
            req = req.form(&[("_token", token)]);
        }

        let resp = req.send().await.map_err(AppError::Network)?;

        if !resp.status().is_success() {
            return Ok(vec![]);
        }

        let body: serde_json::Value = resp.json().await.map_err(AppError::Network)?;
        let total = body.get("total")
            .and_then(|t| t.as_u64())
            .unwrap_or_else(|| {
                body.get("data")
                    .and_then(|d| d.as_array())
                    .map(|a| a.len() as u64)
                    .unwrap_or(0)
            }) as u32;

        if total == 0 {
            return Ok(vec![]);
        }

        Ok(self.generate_episodes_list(referer, total))
    }

    fn generate_episodes_list(&self, series_url: &str, total: u32) -> Vec<Episode> {
        let slug = extract_slug(series_url);
        let mut episodes = Vec::with_capacity(total as usize);

        for i in 1..=total {
            episodes.push(Episode {
                number: i,
                title: Some(format!("Episodio {}", i)),
                url: self.url(&format!("/{}/{}/", slug, i)),
                thumbnail_url: None,
                watched: false,
                watch_progress: None,
            });
        }
        episodes
    }
}

fn extract_slug(url: &str) -> String {
    let clean = url.trim_end_matches('/');
    clean.split('/').last().unwrap_or("").to_string()
}

fn normalize_series_url(url: &str) -> String {
    let mut parts: Vec<&str> = url.trim_end_matches('/').split('/').collect();
    if let Some(last) = parts.last() {
        if last.chars().all(|c| c.is_ascii_digit()) {
            parts.pop();
        }
    }
    format!("{}/", parts.join("/"))
}

async fn resolve_mediafire(url: &str) -> Option<String> {
    let html = fetch_html(url, None).await.ok()?;
    let doc = Html::parse_document(&html);
    let sel = Selector::parse("a#downloadButton, a.input").ok()?;
    doc.select(&sel).next().map(|a| attr(&a, "href"))
}

fn attr(element: &scraper::ElementRef, name: &str) -> String {
    element.value().attr(name).unwrap_or_default().trim().to_string()
}

fn inner_text(element: &scraper::ElementRef) -> String {
    element.text().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn normalize_url(href: &str, base_url: &str) -> String {
    if href.starts_with("http://") || href.starts_with("https://") {
        href.to_string()
    } else {
        format!("{}{}", base_url.trim_end_matches('/'), if href.starts_with('/') { href.to_string() } else { format!("/{}", href) })
    }
}

fn detect_media_type(url: &str) -> MediaType {
    let lower = url.to_lowercase();
    if lower.contains(".m3u8") || lower.contains("hls") {
        MediaType::Hls
    } else if lower.contains(".mp4") {
        MediaType::Mp4
    } else {
        MediaType::Unknown
    }
}
