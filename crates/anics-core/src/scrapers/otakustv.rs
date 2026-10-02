use std::collections::HashSet;
use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};
use reqwest::header;

use crate::error::*;
use crate::http::{fetch_html, HTTP_CLIENT};
use crate::models::*;
use crate::scrapers::AnimeExtractor;
use crate::unpacker::JsUnpacker;

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
        Self {
            base_url: DEFAULT_OTAKUSTV_URL.to_string(),
        }
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
    pub fn normalize_series_url(&self, url: &str) -> String {
        let trimmed = url.trim_end_matches('/');
        if trimmed.contains("/ver/") {
            if let Some(pos) = trimmed.rfind('-') {
                let (prefix, suffix) = trimmed.split_at(pos);
                if suffix.len() > 1 && suffix[1..].chars().all(|c| c.is_ascii_digit()) {
                    return prefix.replace("/ver/", "/anime/");
                }
            }
            return trimmed.replace("/ver/", "/anime/");
        }
        trimmed.to_string()
    }
}

fn otakustv_server_priority(name: &str) -> i32 {
    let lower = name.to_lowercase();
    if lower.contains("uqload") {
        100
    } else if lower.contains("lulustream") || lower.contains("lulu") {
        95
    } else if lower.contains("mp4upload") {
        90
    } else if lower.contains("streamwish") || lower.contains("swish") {
        70
    } else if lower.contains("voe") {
        60
    } else if lower.contains("filemoon") || lower.contains("fmoon") {
        50
    } else if lower.contains("vidhide") {
        40
    } else if lower.contains("dood") {
        30
    } else if lower.contains("mixdrop") {
        20
    } else if lower.contains("descarga") {
        5
    } else {
        15
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

            let slug = full_url.trim_end_matches('/').split('/').last().unwrap_or("").to_string();

            let thumbnail = article.select(&img_sel).next()
                .map(|img| {
                    let d = img.value().attr("data-src").unwrap_or("").trim();
                    if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
                })
                .filter(|src| !src.contains("anime.png") && !src.contains("episode.png") && !src.contains("i.imgur.com"))
                .map(|src| self.normalize_url(&src))
                .unwrap_or_else(|| {
                    if !slug.is_empty() {
                        self.url(&format!("/cdn/img/anime/{}.webp", slug))
                    } else {
                        String::new()
                    }
                });

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

            // Extraer slug para inferir la portada oficial vertical del anime
            let clean_ep = href.trim_end_matches('/');
            let slug = if clean_ep.contains("/ver/") {
                if let Some(pos) = clean_ep.rfind('-') {
                    let (p, s) = clean_ep.split_at(pos);
                    if s.len() > 1 && s[1..].chars().all(|c| c.is_ascii_digit()) {
                        p.split('/').last().unwrap_or("")
                    } else {
                        clean_ep.split('/').last().unwrap_or("")
                    }
                } else {
                    clean_ep.split('/').last().unwrap_or("")
                }
            } else {
                clean_ep.split('/').last().unwrap_or("")
            };

            let mut thumbnail = article.select(&img_sel).next()
                .map(|img| {
                    let d = img.value().attr("data-src").unwrap_or("").trim();
                    if !d.is_empty() { d.to_string() } else { img.value().attr("src").unwrap_or("").trim().to_string() }
                })
                .filter(|src| !src.contains("episode.png") && !src.contains("anime.png") && !src.contains("i.imgur.com"))
                .map(|src| self.normalize_url(&src))
                .unwrap_or_default();

            if !slug.is_empty() {
                thumbnail = self.url(&format!("/cdn/img/anime/{}.webp", slug));
            } else if thumbnail.contains("/portada/") {
                thumbnail = thumbnail.replace("/portada/", "/anime/");
            }

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
        let clean_url = self.normalize_series_url(url);
        let html = fetch_html(&clean_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {clean_url}")));
        }

        let doc = Html::parse_document(&html);

        // 1. Título
        let title_sel = Selector::parse("div.ti h1, h1").unwrap();
        let raw_title = doc.select(&title_sel).next()
            .map(|h| h.text().collect::<String>().trim().to_string())
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| "Anime".to_string());
        let title = if raw_title.to_lowercase().starts_with("ver ") {
            let without_ver = raw_title[4..].trim();
            if let Some(idx) = without_ver.to_lowercase().find(" episodio ") {
                without_ver[..idx].trim().to_string()
            } else {
                without_ver.to_string()
            }
        } else {
            raw_title
        };

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

        // 3. Miniatura / Portada (Descartar logo del sitio imgur y obtener portada real)
        let img_sel = Selector::parse("figure.i img, div.info figure img, div.img figure img, div.info img").unwrap();
        let mut thumbnail = String::new();
        for img in doc.select(&img_sel) {
            let d = img.value().attr("data-src").unwrap_or("").trim();
            let s = img.value().attr("src").unwrap_or("").trim();
            let src = if !d.is_empty() { d } else { s };
            if !src.is_empty()
                && !src.contains("i.imgur.com")
                && !src.contains("logo")
                && !src.contains("avatar")
                && !src.contains("episode.png")
                && !src.contains("anime.png")
            {
                thumbnail = self.normalize_url(src);
                break;
            }
        }

        let slug = clean_url.trim_end_matches('/').split('/').last().unwrap_or("");
        if (thumbnail.is_empty() || thumbnail.contains("i.imgur.com") || thumbnail.contains("episode.png") || thumbnail.contains("anime.png")) && !slug.is_empty() {
            thumbnail = self.url(&format!("/cdn/img/anime/{}.webp", slug));
        }

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
            url: clean_url,
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

    // Servidores de video para un episodio ordenados por compatibilidad
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

        // 3. Extraer opciones de descarga si existen (con prioridad baja y no directas para no romper streaming)
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
                                is_direct: false,
                                referer: Some(episode_url.to_string()),
                            });
                        }
                    }
                }
            }
        }

        // 4. Ordenar servidores por compatibilidad real y estabilidad
        servers.sort_by(|a, b| {
            let score_a = otakustv_server_priority(&a.name);
            let score_b = otakustv_server_priority(&b.name);
            score_b.cmp(&score_a)
        });

        Ok(servers)
    }

    // Resuelve servidor de video a URL directa
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        // 1. Streams directos
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

        // 2. Soporte específico para VOE (seguir redirección JavaScript si aplica)
        let (html, effective_url) = if url.contains("voe.sx") {
            let resp_html = fetch_html(url, server.referer.as_deref()).await
                .map_err(AppError::Network)?;
            static VOE_REDIR_RE: Lazy<Regex> = Lazy::new(|| {
                Regex::new(r#"window\.location\.href\s*=\s*['"](https?://[^'"]+)['"]"#).unwrap()
            });
            if let Some(cap) = VOE_REDIR_RE.captures(&resp_html) {
                let redir_url = cap[1].to_string();
                let redir_html = fetch_html(&redir_url, Some(url)).await.unwrap_or_default();
                (redir_html, redir_url)
            } else {
                (resp_html, url.clone())
            }
        } else {
            let h = fetch_html(url, server.referer.as_deref()).await
                .map_err(AppError::Network)?;
            (h, url.clone())
        };

        if html.is_empty() {
            return Err(AppError::Resolver("Página del servidor vacía o inaccesible".to_string()));
        }

        // 3. Soporte específico para Uqload
        if url.contains("uqload") {
            static UQLOAD_SRC_RE: Lazy<Regex> = Lazy::new(|| {
                Regex::new(r#"sources\s*:\s*\[\s*['"](https?://[^'"]+)['"]"#).unwrap()
            });
            if let Some(cap) = UQLOAD_SRC_RE.captures(&html) {
                let stream_url = cap[1].to_string();
                let media_type = detect_media_type(&stream_url);
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type,
                    referer: Some(effective_url),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        // 4. Soporte específico para Mp4upload (video.mp4 directo)
        if url.contains("mp4upload") {
            static MP4UPLOAD_SRC_RE: Lazy<Regex> = Lazy::new(|| {
                Regex::new(r#"(?i)src\s*:\s*["'](https?://[^"']+\.mp4[^"']*)["']"#).unwrap()
            });
            if let Some(cap) = MP4UPLOAD_SRC_RE.captures(&html) {
                let stream_url = cap[1].to_string();
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Mp4,
                    referer: Some("https://www.mp4upload.com/".to_string()),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        // 5. Soporte específico para Lulustream (HLS directo con unpacker)
        if url.contains("luluvdo") || url.contains("lulustream") {
            if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Hls,
                    referer: Some("https://luluvdo.com/".to_string()),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        // 6. Extracción genérica con JsUnpacker
        if let Some(stream_url) = JsUnpacker::extract_stream_url(&html) {
            let media_type = detect_media_type(&stream_url);
            return Ok(ResolvedMedia {
                direct_url: stream_url,
                media_type,
                referer: Some(effective_url),
                user_agent: None,
                qualities: vec![],
            });
        }

        // 7. Si no se pudo extraer un stream directo reproducible, devolver error para permitir fallback automático
        Err(AppError::Resolver(format!(
            "El servidor {} no contiene un flujo de video reproducible directamente",
            server.name
        )))
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
