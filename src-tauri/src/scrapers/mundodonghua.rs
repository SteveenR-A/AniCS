use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};

use crate::core::*;
use crate::scrapers::{fetch_html, AnimeExtractor};

const DEFAULT_MUNDODONGHUA_URL: &str = "https://www.mundodonghua.com";

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<iframe[^>]+src=["']([^"']+)["']"#).unwrap()
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
        let url = self.url(&format!("/busquedas?donghua={}", urlencoding::encode(query)));
        let html = fetch_html(&url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        let card_sel = Selector::parse("div.md-card, div[class*='md-card']").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let title_sel = Selector::parse("h3.md-card-title, .md-card-title, h3, h5").unwrap();
        let img_sel = Selector::parse("img").unwrap();

        for card in doc.select(&card_sel) {
            if let Some(a) = card.select(&link_sel).next() {
                let href = attr(&a, "href");
                if href.is_empty() { continue; }

                let title = card.select(&title_sel).next()
                    .map(|t| inner_text(&t))
                    .unwrap_or_else(|| attr(&a, "title"));
                if title.is_empty() { continue; }

                let thumbnail = card.select(&img_sel).next()
                    .map(|i| {
                        let src = attr(&i, "src");
                        if src.is_empty() { attr(&i, "data-src") } else { src }
                    }).unwrap_or_default();

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: normalize_url(&thumbnail, &self.base_url),
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

        let card_sel = Selector::parse("div.md-card, div[class*='md-card']").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let title_sel = Selector::parse("h3.md-card-title, .md-card-title, h3, h5").unwrap();
        let img_sel = Selector::parse("img").unwrap();
        let badge_sel = Selector::parse("span.md-card-badge, .md-card-badge").unwrap();

        for card in doc.select(&card_sel) {
            if let Some(a) = card.select(&link_sel).next() {
                let href = attr(&a, "href");
                if href.is_empty() { continue; }

                let title = card.select(&title_sel).next()
                    .map(|t| inner_text(&t))
                    .unwrap_or_else(|| attr(&a, "title"));
                if title.is_empty() { continue; }

                let thumbnail = card.select(&img_sel).next()
                    .map(|i| {
                        let src = attr(&i, "src");
                        if src.is_empty() { attr(&i, "data-src") } else { src }
                    }).unwrap_or_default();

                let episode = card.select(&badge_sel).next()
                    .map(|b| inner_text(&b));

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: normalize_url(&thumbnail, &self.base_url),
                    episode,
                    anime_type: Some("Donghua".to_string()),
                    source: self.id().to_string(),
                    ..Default::default()
                });
            }
        }
        Ok(results)
    }

    // Horario semanal
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        self.get_latest(1).await
    }

    // Detalles de serie enriquecidos
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        let clean_url = normalize_donghua_url(url, &self.base_url);
        let html = fetch_html(&clean_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {clean_url}")));
        }

        let doc = Html::parse_document(&html);

        let title_sel = Selector::parse("h1.md-donghua-title, h1, .title").unwrap();
        let title = doc.select(&title_sel).next()
            .map(|n| inner_text(&n))
            .unwrap_or_default();

        let pic_sel = Selector::parse("div.md-donghua-img img, img.cover, img").unwrap();
        let thumbnail = doc.select(&pic_sel).next()
            .map(|n| {
                let src = attr(&n, "src");
                if src.is_empty() { attr(&n, "data-src") } else { src }
            })
            .unwrap_or_default();

        let syn_sel = Selector::parse("div.md-donghua-sinopsis p, div.sinopsis p, p").unwrap();
        let synopsis = doc.select(&syn_sel).next()
            .map(|n| inner_text(&n))
            .unwrap_or_default();

        let genre_sel = Selector::parse("a.md-genre-tag, a[href*='/genero/']").unwrap();
        let genres: Vec<String> = doc.select(&genre_sel)
            .map(|a| inner_text(&a))
            .filter(|g| !g.is_empty())
            .collect();

        // Metadatos adicionales (estado, episodios, etc.)
        let mut status = None;
        let mut total_ep_str = None;

        let info_sel = Selector::parse("div.md-donghua-info p, p").unwrap();
        for p in doc.select(&info_sel) {
            let t = inner_text(&p);
            if t.to_lowercase().contains("estado:") {
                status = Some(t.replace("Estado:", "").trim().to_string());
            } else if t.to_lowercase().contains("episodios:") {
                total_ep_str = Some(t.replace("Episodios:", "").trim().to_string());
            }
        }

        // Episodios
        let mut episodes = vec![];
        let ep_sel = Selector::parse("ul.md-donghua-episodes li a, div.episodes-list a, a[href*='/ver/']").unwrap();

        for (idx, a) in doc.select(&ep_sel).enumerate() {
            let href = attr(&a, "href");
            if href.is_empty() { continue; }
            let ep_num = (idx + 1) as u32;

            episodes.push(Episode {
                number: ep_num,
                title: Some(format!("Episodio {}", ep_num)),
                url: normalize_url(&href, &self.base_url),
                thumbnail_url: None,
                watched: false,
                watch_progress: None,
            });
        }

        Ok(AnimeDetails {
            title,
            url: clean_url,
            thumbnail_url: normalize_url(&thumbnail, &self.base_url),
            synopsis,
            genres,
            status,
            anime_type: Some("Donghua".to_string()),
            studio: None,
            duration: Some("20 min".to_string()),
            total_episodes: total_ep_str.or_else(|| if !episodes.is_empty() { Some(episodes.len().to_string()) } else { None }),
            season: None,
            broadcast: None,
            languages: Some("Chino (Sub Español)".to_string()),
            year: None,
            rating: None,
            episodes,
            source: self.id().to_string(),
        })
    }

    // Servidores de video
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        let html = fetch_html(episode_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut servers = vec![];

        let tab_sel = Selector::parse("ul.md-player-tabs li, .server-item").unwrap();
        let iframe_sel = Selector::parse("div.md-player-container iframe, iframe").unwrap();

        for (idx, tab) in doc.select(&tab_sel).enumerate() {
            let name = inner_text(&tab);
            let srv_name = if name.is_empty() { format!("Servidor {}", idx + 1) } else { name };

            if let Some(iframe) = doc.select(&iframe_sel).nth(idx) {
                let src = attr(&iframe, "src");
                if !src.is_empty() {
                    servers.push(VideoServer {
                        name: srv_name,
                        url: src,
                        is_direct: true,
                        referer: Some(episode_url.to_string()),
                    });
                }
            }
        }

        if servers.is_empty() {
            for iframe in doc.select(&iframe_sel) {
                let src = attr(&iframe, "src");
                if !src.is_empty() {
                    servers.push(VideoServer {
                        name: "Reproductor Principal".to_string(),
                        url: src,
                        is_direct: true,
                        referer: Some(episode_url.to_string()),
                    });
                }
            }
        }

        Ok(servers)
    }

    // Resolver de URL de video
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        let html = fetch_html(url, server.referer.as_deref()).await
            .map_err(AppError::Network)?;

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

        let media_type = detect_media_type(url);
        Ok(ResolvedMedia {
            direct_url: url.clone(),
            media_type,
            referer: server.referer.clone(),
            user_agent: None,
            qualities: vec![],
        })
    }

    // Lista dinámica de géneros para MundoDonghua
    async fn get_genres(&self) -> AppResult<Vec<GenreItem>> {
        let url = self.url("/lista-donghuas");
        if let Ok(html) = fetch_html(&url, Some(&self.base_url)).await {
            if !html.is_empty() {
                let doc = Html::parse_document(&html);
                let genre_sel = Selector::parse("a.md-genre-tag, a[href*='/genero/']").unwrap();
                let mut genres = vec![];

                for a in doc.select(&genre_sel) {
                    let name = inner_text(&a);
                    let href = attr(&a, "href");
                    let slug = href.trim_start_matches("/genero/").trim_end_matches('/').to_string();
                    if !name.is_empty() && !slug.is_empty() && !genres.iter().any(|g: &GenreItem| g.slug == slug) {
                        genres.push(GenreItem { name, slug });
                    }
                }

                if !genres.is_empty() {
                    return Ok(genres);
                }
            }
        }

        Ok(default_donghua_genres())
    }

    // Búsqueda avanzada
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        let target_url = if let Some(g) = &filters.genre {
            if !g.is_empty() {
                self.url(&format!("/genero/{}", urlencoding::encode(g)))
            } else if let Some(q) = &filters.query {
                self.url(&format!("/busquedas?donghua={}", urlencoding::encode(q)))
            } else {
                self.url("/lista-donghuas")
            }
        } else if let Some(q) = &filters.query {
            self.url(&format!("/busquedas?donghua={}", urlencoding::encode(q)))
        } else if let Some(s) = &filters.status {
            if s == "emision" || s == "En emision" {
                self.url("/lista-donghuas-emision")
            } else if s == "finalizado" || s == "Finalizadas" {
                self.url("/lista-donghuas-finalizados")
            } else {
                self.url("/lista-donghuas")
            }
        } else {
            self.url("/lista-donghuas")
        };

        let html = fetch_html(&target_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Ok(SearchResultPage {
                results: vec![],
                current_page: filters.page,
                total_pages: None,
                has_next: false,
            });
        }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        let card_sel = Selector::parse("div.md-card, div[class*='md-card']").unwrap();
        let link_sel = Selector::parse("a").unwrap();
        let title_sel = Selector::parse("h3.md-card-title, .md-card-title, h3, h5").unwrap();
        let img_sel = Selector::parse("img").unwrap();

        for card in doc.select(&card_sel) {
            if let Some(a) = card.select(&link_sel).next() {
                let href = attr(&a, "href");
                if href.is_empty() { continue; }

                let title = card.select(&title_sel).next()
                    .map(|t| inner_text(&t))
                    .unwrap_or_else(|| attr(&a, "title"));
                if title.is_empty() { continue; }

                let thumbnail = card.select(&img_sel).next()
                    .map(|i| {
                        let src = attr(&i, "src");
                        if src.is_empty() { attr(&i, "data-src") } else { src }
                    }).unwrap_or_default();

                results.push(AnimeResult {
                    title,
                    url: normalize_url(&href, &self.base_url),
                    thumbnail_url: normalize_url(&thumbnail, &self.base_url),
                    anime_type: Some("Donghua".to_string()),
                    source: self.id().to_string(),
                    ..Default::default()
                });
            }
        }

        Ok(SearchResultPage {
            results,
            current_page: filters.page,
            total_pages: None,
            has_next: false,
        })
    }
}

fn normalize_donghua_url(url: &str, base_url: &str) -> String {
    if url.contains("/ver/") {
        let parts: Vec<&str> = url.split("/ver/").collect();
        if parts.len() > 1 {
            let segs: Vec<&str> = parts[1].split('/').collect();
            if !segs.is_empty() {
                return format!("{}/donghua/{}", base_url.trim_end_matches('/'), segs[0]);
            }
        }
    }
    url.to_string()
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

fn default_donghua_genres() -> Vec<GenreItem> {
    vec![
        GenreItem { name: "Acción".into(), slug: "accion".into() },
        GenreItem { name: "Cultivación".into(), slug: "cultivacion".into() },
        GenreItem { name: "Artes Marciales".into(), slug: "artes-marciales".into() },
        GenreItem { name: "Fantasía".into(), slug: "fantasia".into() },
        GenreItem { name: "Aventura".into(), slug: "aventura".into() },
        GenreItem { name: "Magia".into(), slug: "magia".into() },
        GenreItem { name: "Reencarnación".into(), slug: "reencarnacion".into() },
        GenreItem { name: "Romance".into(), slug: "romance".into() },
        GenreItem { name: "Ciencia Ficción".into(), slug: "sci-fi".into() },
        GenreItem { name: "3D".into(), slug: "3d".into() },
        GenreItem { name: "2D".into(), slug: "2d".into() },
        GenreItem { name: "Sobrenatural".into(), slug: "sobrenatural".into() },
    ]
}
