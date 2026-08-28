use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};

use crate::core::*;
use crate::scrapers::{fetch_html, AnimeExtractor};

const DEFAULT_MUNDODONGHUA_URL: &str = "https://www.mundodonghua.com";

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<iframe[^>]+src=\\?["']([^"'\\]+)\\?["']"#).unwrap()
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

    // Horario semanal de Donghuas en emisión
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        let url = self.url("/lista-donghuas-emision");
        if let Ok(html) = fetch_html(&url, Some(&self.base_url)).await {
            if !html.is_empty() {
                let list = parse_donghua_cards(&html, &self.base_url, self.id());
                if !list.is_empty() {
                    return Ok(list);
                }
            }
        }
        self.get_latest(1).await
    }

    // Horario estructurado para MundoDonghua
    async fn get_schedule_days(&self) -> AppResult<Vec<ScheduleDay>> {
        let list = self.get_schedule().await?;
        Ok(vec![ScheduleDay {
            day: "Donghuas en Emisión Oficial".to_string(),
            animes: list,
        }])
    }

    // Top Donghuas populares
    async fn get_top(&self) -> AppResult<Vec<AnimeResult>> {
        let url = self.url("/lista-donghuas");
        if let Ok(html) = fetch_html(&url, Some(&self.base_url)).await {
            if !html.is_empty() {
                let results = parse_donghua_cards(&html, &self.base_url, self.id());
                if !results.is_empty() {
                    return Ok(results);
                }
            }
        }
        self.get_latest(1).await
    }

    // Búsqueda avanzada con filtros dinámicos
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        let page = filters.page;
        let active_genre = filters.genre.as_ref();

        let target_url = if let Some(ref q) = filters.query {
            let q_trimmed = q.trim();
            if !q_trimmed.is_empty() {
                self.url(&format!("/busquedas?donghua={}&p={}", urlencoding::encode(q_trimmed), page))
            } else if let Some(g) = active_genre {
                let g_slug = g.to_lowercase().replace(' ', "-");
                self.url(&format!("/genero/{}/{}", g_slug, page))
            } else {
                self.url(&format!("/lista-donghuas?p={}", page))
            }
        } else if let Some(g) = active_genre {
            let g_slug = g.to_lowercase().replace(' ', "-");
            self.url(&format!("/genero/{}/{}", g_slug, page))
        } else {
            self.url(&format!("/lista-donghuas?p={}", page))
        };

        let html = fetch_html(&target_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Ok(SearchResultPage {
                results: vec![],
                current_page: page,
                total_pages: Some(1),
                has_next: false,
            });
        }

        let results = parse_donghua_cards(&html, &self.base_url, self.id());
        let has_next = results.len() >= 15;

        Ok(SearchResultPage {
            results,
            current_page: page,
            total_pages: None,
            has_next,
        })
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

        let og_img_sel = Selector::parse("meta[property='og:image'], meta[name='twitter:image']").unwrap();
        let pic_sel = Selector::parse("div.md-donghua-img img, img.cover, .cover-img").unwrap();
        let thumbnail = doc.select(&og_img_sel).next()
            .map(|m| attr(&m, "content"))
            .filter(|c| !c.is_empty() && c.starts_with("http") && !c.contains("logo"))
            .or_else(|| {
                doc.select(&pic_sel).next().map(|n| {
                    let src = attr(&n, "src");
                    if !src.is_empty() && !src.contains("logo") {
                        src
                    } else {
                        attr(&n, "data-src")
                    }
                })
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

    // Servidores de video dinámicos con soporte completo de HLS y servidores externos
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        let html = fetch_html(episode_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let mut servers = vec![];

        // 1. Extraer y desempaquetar todos los scripts eval(function(p,a,c,k,e,d)...)
        for line in html.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("eval(function(p,a,c,k,e,d)") {
                if let Some(unpacked) = JsUnpacker::unpack(trimmed) {
                    // A) Servidor HLS Directo (Asura / mdplayer)
                    if let Some(pos) = unpacked.find("file:") {
                        let sub = &unpacked[pos..];
                        if let Some(quote_start) = sub.find('"').or_else(|| sub.find('\'')) {
                            let rest = &sub[quote_start + 1..];
                            if let Some(quote_end) = rest.find('"').or_else(|| rest.find('\'')) {
                                let stream_url = &rest[..quote_end];
                                if stream_url.starts_with("http") && !servers.iter().any(|s: &VideoServer| s.url == stream_url) {
                                    servers.push(VideoServer {
                                        name: "Asura (Directo HLS)".to_string(),
                                        url: stream_url.to_string(),
                                        is_direct: true,
                                        referer: Some(self.base_url.clone()),
                                    });
                                }
                            }
                        }
                    }

                    // B) Servidores Iframe embebidos (VOE, Streamwish, Vidhide, Fmoon)
                    if let Some(iframe_match) = IFRAME_RE.captures(&unpacked).and_then(|c| c.get(1)) {
                        let iframe_url = iframe_match.as_str().replace(r#"\"#, "").replace('\'', "").replace('"', "");
                        if iframe_url.starts_with("http") && !servers.iter().any(|s: &VideoServer| s.url == iframe_url) {
                            let name = if iframe_url.contains("voe.sx") {
                                "VOE".to_string()
                            } else if iframe_url.contains("embedwish") || iframe_url.contains("sfastwish") {
                                "Streamwish".to_string()
                            } else if iframe_url.contains("vidhide") {
                                "Vidhide".to_string()
                            } else if iframe_url.contains("bysekoze") {
                                "Fmoon".to_string()
                            } else {
                                format!("Servidor {}", servers.len() + 1)
                            };

                            servers.push(VideoServer {
                                name,
                                url: iframe_url,
                                is_direct: false,
                                referer: Some(episode_url.to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 2. Si no se encontraron por JS, fallback a iframes HTML estándar
        if servers.is_empty() {
            let doc = Html::parse_document(&html);
            let iframe_sel = Selector::parse("div.md-player-container iframe, iframe").unwrap();
            for (idx, iframe) in doc.select(&iframe_sel).enumerate() {
                let src = attr(&iframe, "src");
                if !src.is_empty() && !servers.iter().any(|s: &VideoServer| s.url == src) {
                    servers.push(VideoServer {
                        name: format!("Servidor {}", idx + 1),
                        url: src,
                        is_direct: false,
                        referer: Some(episode_url.to_string()),
                    });
                }
            }
        }

        // Priorizar servidores directos HLS al inicio
        servers.sort_by(|a, b| b.is_direct.cmp(&a.is_direct));

        Ok(servers)
    }

    // Resolver de URL de video
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        // 1. Stream directo HLS de MundoDonghua (redirector.php o .m3u8)
        if url.contains("redirector.php") || url.contains(".m3u8") {
            return Ok(ResolvedMedia {
                direct_url: url.clone(),
                media_type: MediaType::Hls,
                referer: Some(self.base_url.clone()),
                user_agent: None,
                qualities: vec![],
            });
        }

        // 2. Extractor VOE
        if url.contains("voe.sx") {
            let html = fetch_html(url, server.referer.as_deref()).await
                .map_err(AppError::Network)?;
            if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
                let media_type = detect_media_type(&stream_url);
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type,
                    referer: Some("https://voe.sx/".to_string()),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        // 3. Fallback genérico para otros servidores embebidos
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

fn parse_donghua_cards(html: &str, base_url: &str, source_id: &str) -> Vec<AnimeResult> {
    let doc = Html::parse_document(html);
    let mut results = vec![];
    let mut seen = std::collections::HashSet::new();

    let a_sel = Selector::parse("a[href*='/donghua/'], div.md-card a, div.col-6 a, div.col-md-4 a").unwrap();
    let title_sel = Selector::parse("h3.md-card-title, h5.md-card-title, h3, h5, .title, a.title").unwrap();
    let img_sel = Selector::parse("img").unwrap();

    for a in doc.select(&a_sel) {
        let href = attr(&a, "href");
        if href.is_empty() || href == "/donghua" || href == "/donghua/" { continue; }

        let clean_url = normalize_donghua_url(&href, base_url);
        if seen.contains(&clean_url) { continue; }
        seen.insert(clean_url.clone());

        let title = if let Some(h) = a.select(&title_sel).next() {
            inner_text(&h)
        } else if let Some(img) = a.select(&img_sel).next() {
            attr(&img, "alt")
        } else {
            String::new()
        };

        if title.is_empty() { continue; }

        let thumbnail = a.select(&img_sel).next().map(|i| {
            let src = attr(&i, "src");
            if src.is_empty() { attr(&i, "data-src") } else { src }
        }).unwrap_or_default();

        results.push(AnimeResult {
            title,
            url: clean_url,
            thumbnail_url: normalize_url(&thumbnail, base_url),
            anime_type: Some("Donghua".to_string()),
            source: source_id.to_string(),
            ..Default::default()
        });
    }

    results
}
