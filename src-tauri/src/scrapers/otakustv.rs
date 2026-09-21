use std::collections::HashSet;
use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use reqwest::header;

use crate::core::*;
use crate::scrapers::{fetch_html, AnimeExtractor, HTTP_CLIENT};

const DEFAULT_OTAKUSTV_URL: &str = "https://www.otakustv.net";

static EPISODIO_NUM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?:Episodio|Cap[ií]tulo)\s*(\d+)"#).unwrap()
});

static DIGITS_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\d+"#).unwrap()
});

fn detect_media_type(url: &str) -> MediaType {
    if url.contains(".m3u8") {
        MediaType::Hls
    } else if url.contains(".mp4") {
        MediaType::Mp4
    } else {
        MediaType::Unknown
    }
}

pub struct OtakusTVExtractor {
    base_url: String,
}

impl OtakusTVExtractor {
    pub fn new() -> Self {
        let base = crate::storage::get_setting("otakustv_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| DEFAULT_OTAKUSTV_URL.to_string());
        Self { base_url: base }
    }

    #[allow(dead_code)]
    pub fn with_base_url(base_url: String) -> Self {
        Self { base_url }
    }

    fn url(&self, path: &str) -> String {
        let p = if path.starts_with('/') { path.to_string() } else { format!("/{}", path) };
        format!("{}{}", self.base_url.trim_end_matches('/'), p)
    }

    /// Normaliza enlaces asegurando el dominio absoluto de OtakusTV
    fn normalize_url(&self, href: &str) -> String {
        let trimmed = href.trim();
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            trimmed.to_string()
        } else if trimmed.starts_with("//") {
            format!("https:{}", trimmed)
        } else {
            let p = trimmed.trim_start_matches('.');
            let clean_p = if p.starts_with('/') { p.to_string() } else { format!("/{}", p) };
            format!("{}{}", self.base_url.trim_end_matches('/'), clean_p)
        }
    }

    /// Decodifica una cadena hexadecimal a texto UTF-8 (hex2a)
    pub fn decode_hex(hex_str: &str) -> Option<String> {
        let clean = hex_str.trim();
        if clean.is_empty() || clean.len() % 2 != 0 {
            return None;
        }

        let bytes = (0..clean.len())
            .step_by(2)
            .filter_map(|i| {
                if i + 2 <= clean.len() {
                    u8::from_str_radix(&clean[i..i + 2], 16).ok()
                } else {
                    None
                }
            })
            .collect::<Vec<u8>>();

        String::from_utf8(bytes).ok()
    }
}

#[async_trait]
impl AnimeExtractor for OtakusTVExtractor {
    fn id(&self) -> &'static str { "otakustv" }
    fn name(&self) -> &'static str { "OtakusTV" }
    fn base_url(&self) -> &str { &self.base_url }

    // Búsqueda simple por texto
    async fn search(&self, query: &str) -> AppResult<Vec<AnimeResult>> {
        let target_url = self.url(&format!("/animes?buscar={}", urlencoding::encode(query)));
        let html = fetch_html(&target_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];
        let mut seen_urls = HashSet::new();

        let article_sel = Selector::parse("article.li, article").unwrap();
        let a_sel = Selector::parse("figure.i a, a").unwrap();
        let title_sel = Selector::parse("h3.h a, h3 a").unwrap();
        let img_sel = Selector::parse("figure.i img, img").unwrap();

        for article in doc.select(&article_sel) {
            let href = article.select(&a_sel).next()
                .map(|a| a.value().attr("href").unwrap_or("").trim().to_string())
                .unwrap_or_default();

            if href.is_empty() { continue; }
            let full_url = self.normalize_url(&href);

            if seen_urls.contains(&full_url) { continue; }
            seen_urls.insert(full_url.clone());

            let title = article.select(&title_sel).next()
                .map(|t| t.text().collect::<String>().trim().to_string())
                .unwrap_or_default();

            if title.is_empty() { continue; }

            let thumbnail = article.select(&img_sel).next()
                .map(|img| {
                    let d = img.value().attr("data-src").unwrap_or("").trim();
                    if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
                })
                .map(|src| self.normalize_url(&src))
                .unwrap_or_default();

            results.push(AnimeResult {
                title,
                url: full_url,
                thumbnail_url: thumbnail,
                source: self.id().to_string(),
                ..Default::default()
            });
        }

        Ok(results)
    }

    // Últimos episodios emitidos
    async fn get_latest(&self, page: u32) -> AppResult<Vec<AnimeResult>> {
        let target_url = if page > 1 {
            self.url(&format!("/animes?p={}", page))
        } else {
            self.url("/")
        };

        let html = fetch_html(&target_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() { return Ok(vec![]); }

        let doc = Html::parse_document(&html);
        let mut results = vec![];
        let mut seen = HashSet::new();

        let article_sel = Selector::parse("article.li, article").unwrap();
        let a_sel = Selector::parse("figure.i a, a").unwrap();
        let title_sel = Selector::parse("h3.h a, h3 a").unwrap();
        let img_sel = Selector::parse("figure.i img, img").unwrap();
        let ep_sel = Selector::parse("figure.i u, u").unwrap();

        for article in doc.select(&article_sel) {
            let href = article.select(&a_sel).next()
                .map(|a| a.value().attr("href").unwrap_or("").trim().to_string())
                .unwrap_or_default();

            if href.is_empty() { continue; }
            let full_url = self.normalize_url(&href);

            if seen.contains(&full_url) { continue; }
            seen.insert(full_url.clone());

            let title = article.select(&title_sel).next()
                .map(|t| t.text().collect::<String>().trim().to_string())
                .unwrap_or_default();

            if title.is_empty() { continue; }

            let ep_text = article.select(&ep_sel).next()
                .map(|u| u.text().collect::<String>().trim().to_string())
                .unwrap_or_default();

            let episode = if let Some(cap) = EPISODIO_NUM_RE.captures(&ep_text) {
                cap.get(1).map(|m| m.as_str().to_string())
            } else if let Some(m) = DIGITS_RE.find(&ep_text) {
                Some(m.as_str().to_string())
            } else {
                None
            };

            let thumbnail = article.select(&img_sel).next()
                .map(|img| {
                    let d = img.value().attr("data-src").unwrap_or("").trim();
                    if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
                })
                .map(|src| self.normalize_url(&src))
                .unwrap_or_default();

            results.push(AnimeResult {
                title,
                url: full_url,
                thumbnail_url: thumbnail,
                episode,
                source: self.id().to_string(),
                ..Default::default()
            });
        }

        Ok(results)
    }

    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        self.get_latest(1).await
    }

    async fn get_top(&self) -> AppResult<Vec<AnimeResult>> {
        self.get_latest(1).await
    }

    // Detalles completos de la serie
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        let html = fetch_html(url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {url}")));
        }

        let doc = Html::parse_document(&html);

        // 1. Título
        let title_sel = Selector::parse("div.ti h1, h1").unwrap();
        let title = doc.select(&title_sel).next()
            .map(|h| h.text().collect::<String>().trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "Anime".to_string());

        // 2. Sinopsis
        let sinopsis_sel = Selector::parse("div.tx p, div.info p, p").unwrap();
        let mut synopsis = String::new();
        for p in doc.select(&sinopsis_sel) {
            let txt = p.text().collect::<String>().trim().to_string();
            if !txt.is_empty() && !txt.contains("Aviso DMCA") && !txt.contains("Copyright") && !txt.contains("descargar") {
                synopsis = txt;
                break;
            }
        }

        // 3. Miniatura / Portada
        let img_sel = Selector::parse("div.info figure.i img, figure.i img, img").unwrap();
        let thumbnail = doc.select(&img_sel).next()
            .map(|img| {
                let d = img.value().attr("data-src").unwrap_or("").trim();
                if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
            })
            .map(|src| self.normalize_url(&src))
            .unwrap_or_default();

        // 4. Géneros
        let genre_sel = Selector::parse("a[href*='genero']").unwrap();
        let mut genres = vec![];
        for a in doc.select(&genre_sel) {
            let g = a.text().collect::<String>().trim().to_string();
            if !g.is_empty() && !genres.contains(&g) {
                genres.push(g);
            }
        }

        // 5. Estado y Tipo
        let status_sel = Selector::parse("span.st").unwrap();
        let status = doc.select(&status_sel).next()
            .map(|s| s.text().collect::<String>().trim().to_string());

        let type_sel = Selector::parse("div.ti h2").unwrap();
        let anime_type = doc.select(&type_sel).next()
            .map(|h| h.text().collect::<String>().trim().to_string());

        // 6. Lista de Episodios
        let mut episodes = vec![];

        // Verificar metadata estructurada: <span id="dt" data-e="112" data-u="...">
        let dt_sel = Selector::parse("span#dt, #dt").unwrap();
        if let Some(dt) = doc.select(&dt_sel).next() {
            let total_e = dt.value().attr("data-e")
                .and_then(|e| e.parse::<u32>().ok())
                .unwrap_or(0);
            let base_u = dt.value().attr("data-u").unwrap_or("").trim();

            if total_e > 0 && !base_u.is_empty() {
                for ep in 1..=total_e {
                    episodes.push(Episode {
                        number: ep,
                        title: Some(format!("Episodio {}", ep)),
                        url: format!("{}-{}", base_u.trim_end_matches('/'), ep),
                        thumbnail_url: Some(thumbnail.clone()),
                        watched: false,
                        watch_progress: None,
                    });
                }
            }
        }

        // Fallback: extraer elementos en el DOM si no se pudieron generar por metadatos
        if episodes.is_empty() {
            let ep_link_sel = Selector::parse("div.ul.x8 article.li a, article.li a").unwrap();
            let mut seen_eps = HashSet::new();

            for a in doc.select(&ep_link_sel) {
                let href = a.value().attr("href").unwrap_or("").trim();
                if href.is_empty() || !href.contains("/ver/") { continue; }
                let ep_url = self.normalize_url(href);

                if seen_eps.contains(&ep_url) { continue; }
                seen_eps.insert(ep_url.clone());

                let ep_num = DIGITS_RE.find_iter(&ep_url)
                    .last()
                    .and_then(|m| m.as_str().parse::<u32>().ok())
                    .unwrap_or(1);

                episodes.push(Episode {
                    number: ep_num,
                    title: Some(format!("Episodio {}", ep_num)),
                    url: ep_url,
                    thumbnail_url: Some(thumbnail.clone()),
                    watched: false,
                    watch_progress: None,
                });
            }
        }

        // Ordenar episodios de menor a mayor
        episodes.sort_by_key(|e| e.number);

        Ok(AnimeDetails {
            title,
            url: url.to_string(),
            thumbnail_url: thumbnail,
            synopsis,
            genres,
            status,
            anime_type,
            studio: None,
            duration: None,
            total_episodes: None,
            season: None,
            broadcast: None,
            languages: None,
            year: None,
            rating: None,
            episodes,
            source: self.id().to_string(),
        })
    }

    // Servidores de video para un episodio
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        let html = fetch_html(episode_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() { return Ok(vec![]); }

        let mut servers = vec![];
        let mut seen_urls = HashSet::new();

        // 1. Extraer data-encrypt y enlaces de descarga en un scope aislado
        let (encrypt_val, dwn_json) = {
            let doc = Html::parse_document(&html);
            let opt_sel = Selector::parse("ul.opt[data-encrypt], [data-encrypt]").unwrap();
            let enc = doc.select(&opt_sel).next()
                .and_then(|el| el.value().attr("data-encrypt"))
                .map(|s| s.trim().to_string());

            let dwn_sel = Selector::parse("a.d[data-dwn], [data-dwn]").unwrap();
            let dwn = doc.select(&dwn_sel).next()
                .and_then(|el| el.value().attr("data-dwn"))
                .map(|s| s.trim().to_string());

            (enc, dwn)
        };

        // 2. Si existe data-encrypt, consultar ./backend (acc=opt)
        if let Some(enc) = encrypt_val {
            let backend_url = self.url("/backend");
            let resp = HTTP_CLIENT
                .post(&backend_url)
                .form(&[("acc", "opt"), ("i", &enc)])
                .header(header::REFERER, episode_url)
                .header("X-Requested-With", "XMLHttpRequest")
                .send()
                .await;

            if let Ok(r) = resp {
                if let Ok(backend_html) = r.text().await {
                    let b_doc = Html::parse_document(&backend_html);
                    let li_sel = Selector::parse("li[encrypt]").unwrap();

                    for li in b_doc.select(&li_sel) {
                        let enc_hex = li.value().attr("encrypt").unwrap_or("").trim();
                        if let Some(decoded_url) = Self::decode_hex(enc_hex) {
                            if seen_urls.contains(&decoded_url) { continue; }
                            seen_urls.insert(decoded_url.clone());

                            let name = li.select(&Selector::parse("span").unwrap()).next()
                                .map(|s| s.text().collect::<String>().trim().to_string())
                                .unwrap_or_else(|| {
                                    li.value().attr("title").unwrap_or("Servidor").to_string()
                                });

                            let is_direct = decoded_url.ends_with(".mp4") || decoded_url.contains(".m3u8");

                            servers.push(VideoServer {
                                name,
                                url: decoded_url,
                                is_direct,
                                referer: Some(episode_url.to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 3. Extraer opciones de descarga si existen
        if let Some(json_str) = dwn_json {
            if let Ok(parsed) = serde_json::from_str::<Vec<Vec<String>>>(&json_str) {
                for (idx, item) in parsed.into_iter().enumerate() {
                    if item.len() >= 2 {
                        let dl_url = item[1].trim().to_string();
                        if !dl_url.is_empty() && !seen_urls.contains(&dl_url) {
                            seen_urls.insert(dl_url.clone());
                            servers.push(VideoServer {
                                name: format!("Descarga {}", idx + 1),
                                url: dl_url,
                                is_direct: true,
                                referer: Some(episode_url.to_string()),
                            });
                        }
                    }
                }
            }
        }

        Ok(servers)
    }

    // Resuelve servidor de video a URL directa
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        // Streams directos
        if url.ends_with(".mp4") {
            return Ok(ResolvedMedia {
                direct_url: url.clone(),
                media_type: MediaType::Mp4,
                referer: server.referer.clone(),
                user_agent: None,
                qualities: vec![],
            });
        }

        if url.contains(".m3u8") {
            return Ok(ResolvedMedia {
                direct_url: url.clone(),
                media_type: MediaType::Hls,
                referer: server.referer.clone(),
                user_agent: None,
                qualities: vec![],
            });
        }

        // Si es una página de reproductor embebido, intentar extraer el stream
        let html = fetch_html(url, server.referer.as_deref()).await
            .map_err(AppError::Network)?;

        if let Some(stream_url) = crate::core::JsUnpacker::extract_stream_url(&html) {
            let media_type = detect_media_type(&stream_url);
            return Ok(ResolvedMedia {
                direct_url: stream_url,
                media_type,
                referer: Some(url.clone()),
                user_agent: None,
                qualities: vec![],
            });
        }

        // Fallback genérico para iframes embebidos
        Ok(ResolvedMedia {
            direct_url: url.clone(),
            media_type: MediaType::Unknown,
            referer: server.referer.clone(),
            user_agent: None,
            qualities: vec![],
        })
    }

    // Lista de géneros disponibles
    async fn get_genres(&self) -> AppResult<Vec<GenreItem>> {
        let list = vec![
            ("accion", "Acción"),
            ("aventura", "Aventura"),
            ("comedia", "Comedia"),
            ("drama", "Drama"),
            ("fantasia", "Fantasía"),
            ("romance", "Romance"),
            ("shounen", "Shounen"),
            ("seinen", "Seinen"),
            ("sobrenatural", "Sobrenatural"),
            ("recuentos-de-la-vida", "Recuentos de la vida"),
            ("escolar", "Escolar"),
            ("misterio", "Misterio"),
            ("psicologico", "Psicológico"),
            ("ciencia-ficcion", "Ciencia Ficción"),
        ];

        Ok(list.into_iter().map(|(slug, name)| GenreItem {
            slug: slug.to_string(),
            name: name.to_string(),
        }).collect())
    }

    // Búsqueda avanzada
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        let page = filters.page.max(1);
        let mut path = format!("/animes?p={}", page);

        if let Some(q) = &filters.query {
            path = format!("/animes?buscar={}&p={}", urlencoding::encode(q), page);
        } else if let Some(g) = &filters.genre {
            path = format!("/animes?genero={}&p={}", g, page);
        }

        let target_url = self.url(&path);
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

        let doc = Html::parse_document(&html);
        let mut results = vec![];
        let mut seen_urls = HashSet::new();

        let article_sel = Selector::parse("article.li, article").unwrap();
        let a_sel = Selector::parse("figure.i a, a").unwrap();
        let title_sel = Selector::parse("h3.h a, h3 a").unwrap();
        let img_sel = Selector::parse("figure.i img, img").unwrap();

        for article in doc.select(&article_sel) {
            let href = article.select(&a_sel).next()
                .map(|a| a.value().attr("href").unwrap_or("").trim().to_string())
                .unwrap_or_default();

            if href.is_empty() { continue; }
            let full_url = self.normalize_url(&href);

            if seen_urls.contains(&full_url) { continue; }
            seen_urls.insert(full_url.clone());

            let title = article.select(&title_sel).next()
                .map(|t| t.text().collect::<String>().trim().to_string())
                .unwrap_or_default();

            if title.is_empty() { continue; }

            let thumbnail = article.select(&img_sel).next()
                .map(|img| {
                    let d = img.value().attr("data-src").unwrap_or("").trim();
                    if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
                })
                .map(|src| self.normalize_url(&src))
                .unwrap_or_default();

            results.push(AnimeResult {
                title,
                url: full_url,
                thumbnail_url: thumbnail,
                source: self.id().to_string(),
                ..Default::default()
            });
        }

        Ok(SearchResultPage {
            current_page: page,
            total_pages: None,
            has_next: !results.is_empty(),
            results,
        })
    }
}
