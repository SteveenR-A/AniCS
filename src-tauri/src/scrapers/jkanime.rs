use std::collections::HashMap;
use async_trait::async_trait;
use base64::prelude::*;
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

static SERVERS_JSON_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"var\s+servers\s*=\s*(\[\{.*?\}\]);"#).unwrap()
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

static M3U8_DIRECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(https?://[^\s"'\\<>]+\.m3u8[^\s"'\\<>]*)"#).unwrap()
});

static MEDIAFIRE_DL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"href=["'](https?://download\d+\.mediafire\.com/[^"']+)["']"#).unwrap()
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

    // Búsqueda simple
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

    // Detalles enriquecidos de la serie
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        let clean_url = normalize_series_url(url);
        let html = fetch_html(&clean_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() {
            return Err(AppError::NotFound(format!("No content at {clean_url}")));
        }

        let (title, thumbnail, synopsis, genres, status, anime_type, studio, duration, total_ep_str, season, broadcast, languages, anime_id, csrf_token, total_ep_hint) = {
            let doc = Html::parse_document(&html);

            // 1. Título
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

            // 2. Thumbnail de alta resolución
            let slug = extract_slug(&clean_url);
            let og_img_sel = Selector::parse("meta[property='og:image'], meta[name='twitter:image']").unwrap();
            let pic_sel = Selector::parse("div.anime_pic img, div.movpic img, div.anime__details__pic").unwrap();
            
            let thumbnail = doc.select(&og_img_sel).next()
                .map(|m| attr(&m, "content"))
                .filter(|c| !c.is_empty() && c.starts_with("http") && !c.contains("logo"))
                .or_else(|| {
                    doc.select(&pic_sel).next().and_then(|n| {
                        let src = attr(&n, "src");
                        if !src.is_empty() && !src.contains("logo") {
                            Some(src)
                        } else {
                            let bg = attr(&n, "data-setbg");
                            if !bg.is_empty() { Some(bg) } else { None }
                        }
                    })
                })
                .unwrap_or_else(|| format!("https://cdn.jkdesa.com/assets/images/animes/image/{}.jpg", slug));

            // 3. Sinopsis
            let syn_sel = Selector::parse("div.anime_info p, p.scroll, div.anime__details__text p, p#sinopsis").unwrap();
            let synopsis = doc.select(&syn_sel).next()
                .map(|n| inner_text(&n))
                .unwrap_or_default();

            // 4. Extracción de metadatos detallados (estudio, tipo, estado, duración, etc.)
            let mut genres = vec![];
            let mut anime_type = None;
            let mut studio = None;
            let mut duration = None;
            let mut season = None;
            let mut broadcast = None;
            let mut languages = None;
            let mut status = None;
            let mut total_ep_str = None;

            let li_sel = Selector::parse("div.anime_data li, div.anime__details__widget li").unwrap();
            for li in doc.select(&li_sel) {
                let full_text = inner_text(&li);
                let lower = full_text.to_lowercase();

                if lower.contains("genero") || lower.contains("género") {
                    let a_sel = Selector::parse("a").unwrap();
                    for a in li.select(&a_sel) {
                        let g = inner_text(&a);
                        if !g.is_empty() && !genres.contains(&g) {
                            genres.push(g);
                        }
                    }
                } else if lower.contains("tipo") {
                    let val = clean_field_value(&full_text, &["Tipo:", "Tipo"]);
                    if !val.is_empty() { anime_type = Some(val); }
                } else if lower.contains("studio") || lower.contains("estudio") {
                    let a_sel = Selector::parse("a").unwrap();
                    let val = li.select(&a_sel).next()
                        .map(|a| inner_text(&a))
                        .unwrap_or_else(|| clean_field_value(&full_text, &["Studios:", "Estudios:", "Estudio:"]));
                    if !val.is_empty() { studio = Some(val); }
                } else if lower.contains("duracion") || lower.contains("duración") {
                    let val = clean_field_value(&full_text, &["Duracion:", "Duración:"]);
                    if !val.is_empty() { duration = Some(val); }
                } else if lower.contains("temporada") {
                    let a_sel = Selector::parse("a").unwrap();
                    let val = li.select(&a_sel).next()
                        .map(|a| inner_text(&a))
                        .unwrap_or_else(|| clean_field_value(&full_text, &["Temporada:"]));
                    if !val.is_empty() { season = Some(val); }
                } else if lower.contains("emitido") || lower.contains("emisión") {
                    let val = clean_field_value(&full_text, &["Emitido:", "Emisión:"]);
                    if !val.is_empty() { broadcast = Some(val); }
                } else if lower.contains("idioma") {
                    let val = clean_field_value(&full_text, &["Idiomas:", "Idioma:"]);
                    if !val.is_empty() { languages = Some(val); }
                } else if lower.contains("episodio") {
                    let val = clean_field_value(&full_text, &["Episodios:", "Episodio:"]);
                    if !val.is_empty() { total_ep_str = Some(val); }
                } else if lower.contains("estado") {
                    let val = clean_field_value(&full_text, &["Estado:"]);
                    if !val.is_empty() { status = Some(val); }
                }
            }

            let anime_id = EPISODE_ID_RE.captures(&html)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            let csrf_token = CSRF_RE.captures(&html)
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());

            let total_ep_hint = TOTAL_EP_RE.captures(&html)
                .and_then(|c| c.get(1))
                .and_then(|m| m.as_str().parse::<u32>().ok())
                .or_else(|| total_ep_str.as_ref().and_then(|s| s.parse::<u32>().ok()));

            (title, thumbnail, synopsis, genres, status, anime_type, studio, duration, total_ep_str, season, broadcast, languages, anime_id, csrf_token, total_ep_hint)
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
            status,
            anime_type,
            studio,
            duration,
            total_episodes: total_ep_str.or_else(|| total_ep_hint.map(|t| t.to_string())),
            season,
            broadcast,
            languages,
            year: None,
            rating: None,
            episodes,
            source: self.id().to_string(),
        })
    }

    // Servidores de video dinámicos y ordenados por compatibilidad
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        let html = fetch_html(episode_url, Some(&self.base_url)).await
            .map_err(AppError::Network)?;
        if html.is_empty() { return Ok(vec![]); }

        let mut servers = vec![];
        let mut tab_names: HashMap<String, String> = HashMap::new();

        {
            let doc = Html::parse_document(&html);
            let btn_sel = Selector::parse("a.servers, a[id*='btn-show-']").unwrap();
            for a in doc.select(&btn_sel) {
                let id_attr = attr(&a, "data-id");
                let name = inner_text(&a);
                if !id_attr.is_empty() && !name.is_empty() {
                    tab_names.insert(id_attr, name);
                }
            }
        }

        // 1. Extraer reproductores embebidos (Magi, Desu, Desuka, etc.)
        for cap in VIDEO_RE.captures_iter(&html) {
            let idx = &cap[1];
            let raw_url = &cap[2];
            let server_url = raw_url.replace(r#"\"#, "");

            let server_name = tab_names.get(idx)
                .cloned()
                .unwrap_or_else(|| {
                    if server_url.contains("/umv") {
                        "Magi".to_string()
                    } else if server_url.contains("/um") {
                        "Desu".to_string()
                    } else if server_url.contains("/jk") {
                        "Desuka".to_string()
                    } else {
                        format!("Servidor {}", idx)
                    }
                });

            let is_direct = server_url.contains("desu.php")
                || server_url.contains("magi")
                || server_url.contains("/jkplayer")
                || server_name.eq_ignore_ascii_case("magi")
                || server_name.eq_ignore_ascii_case("desu");

            servers.push(VideoServer {
                name: server_name,
                url: server_url,
                is_direct,
                referer: Some(episode_url.to_string()),
            });
        }

        // 2. Extraer servidores de descarga / externos de JSON (Mediafire, Mega, Streamwish, etc.)
        if let Some(cap) = SERVERS_JSON_RE.captures(&html) {
            if let Some(json_str) = cap.get(1) {
                if let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(json_str.as_str()) {
                    for item in items {
                        let srv_name = item.get("server").and_then(|s| s.as_str()).unwrap_or("").to_string();
                        let remote_b64 = item.get("remote").and_then(|r| r.as_str()).unwrap_or("");

                        if !remote_b64.is_empty() && !srv_name.is_empty() {
                            if let Ok(decoded_bytes) = BASE64_STANDARD.decode(remote_b64) {
                                if let Ok(decoded_url) = String::from_utf8(decoded_bytes) {
                                    let clean_url = decoded_url.trim().to_string();
                                    if clean_url.starts_with("http") {
                                        let is_mediafire = srv_name.eq_ignore_ascii_case("mediafire") || clean_url.contains("mediafire.com");
                                        servers.push(VideoServer {
                                            name: srv_name,
                                            url: clean_url,
                                            is_direct: is_mediafire,
                                            referer: Some(episode_url.to_string()),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Fallback de iframe si no hubo resultados
        if servers.is_empty() {
            if let Some(iframe) = IFRAME_RE.captures(&html).and_then(|c| c.get(1)) {
                let iframe_url = iframe.as_str().replace(r#"\"#, "");
                servers.push(VideoServer {
                    name: "Magi".to_string(),
                    url: iframe_url,
                    is_direct: true,
                    referer: Some(episode_url.to_string()),
                });
            }
        }

        // Ordenar por servidores soportados preferidos (Magi -> Desu -> Mediafire -> otros)
        servers.sort_by(|a, b| {
            let score_a = server_priority(&a.name);
            let score_b = server_priority(&b.name);
            score_b.cmp(&score_a)
        });

        Ok(servers)
    }

    // Resolver de URL de video (HLS / MP4 directo)
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        // 1. Mediafire Direct Resolver
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

        // 2. JKPlayer Embebed (Magi / Desu / c1 / c2)
        if url.contains("/jkplayer") || url.contains("desu.php") || url.contains("magi")
            || url.contains("c1.php") || url.contains("c2.php") || url.contains("jkanime.net")
        {
            let html = fetch_html(url, server.referer.as_deref()).await
                .map_err(AppError::Network)?;
            if html.is_empty() {
                return Err(AppError::Resolver("Empty player page".to_string()));
            }

            // A) Buscar stream directo .m3u8 en el HTML (Magi / Desu)
            if let Some(m) = M3U8_DIRECT_RE.find(&html) {
                let stream_url = m.as_str().replace('\\', "").replace('\'', "").replace('"', "");
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Hls,
                    referer: Some(self.base_url.clone()),
                    user_agent: None,
                    qualities: vec![],
                });
            }

            // B) JsUnpacker si estuviera ofuscado
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

            // C) Iframe anidado
            if let Some(nested) = IFRAME_RE.captures(&html).and_then(|c| c.get(1)) {
                let nested_url = nested.as_str().replace(r#"\"#, "");
                let nested_html = fetch_html(&nested_url, Some(url)).await
                    .map_err(AppError::Network)?;

                if let Some(m) = M3U8_DIRECT_RE.find(&nested_html) {
                    let stream_url = m.as_str().replace('\\', "").replace('\'', "").replace('"', "");
                    return Ok(ResolvedMedia {
                        direct_url: stream_url,
                        media_type: MediaType::Hls,
                        referer: Some(nested_url),
                        user_agent: None,
                        qualities: vec![],
                    });
                }

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

        let media_type = detect_media_type(url);
        Ok(ResolvedMedia {
            direct_url: url.clone(),
            media_type,
            referer: server.referer.clone(),
            user_agent: None,
            qualities: vec![],
        })
    }

    // Lista dinámica de géneros
    async fn get_genres(&self) -> AppResult<Vec<GenreItem>> {
        let url = self.url("/directorio");
        if let Ok(html) = fetch_html(&url, Some(&self.base_url)).await {
            if !html.is_empty() {
                let doc = Html::parse_document(&html);
                let opt_sel = Selector::parse("select[name='genero'] option").unwrap();
                let mut genres = vec![];

                for opt in doc.select(&opt_sel) {
                    let slug = attr(&opt, "value");
                    let name = inner_text(&opt);
                    if !slug.is_empty() && !name.is_empty() && slug != "" {
                        genres.push(GenreItem { name, slug });
                    }
                }

                if !genres.is_empty() {
                    return Ok(genres);
                }
            }
        }

        // Fallback de géneros estándar si no se pudo conectar
        Ok(default_jkanime_genres())
    }

    // Búsqueda avanzada con filtros dinámicos
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        let mut query_params = vec![];

        if let Some(g) = &filters.genre {
            if !g.is_empty() { query_params.push(format!("genero={}", urlencoding::encode(g))); }
        }
        if let Some(t) = &filters.anime_type {
            if !t.is_empty() { query_params.push(format!("tipo={}", urlencoding::encode(t))); }
        }
        if let Some(s) = &filters.status {
            if !s.is_empty() { query_params.push(format!("estado={}", urlencoding::encode(s))); }
        }
        if let Some(o) = &filters.order_by {
            if !o.is_empty() { query_params.push(format!("orden={}", urlencoding::encode(o))); }
        }
        if filters.page > 1 {
            query_params.push(format!("p={}", filters.page));
        }

        if query_params.is_empty() {
            if let Some(q) = &filters.query {
                let results = self.search(q).await?;
                return Ok(SearchResultPage {
                    results,
                    current_page: filters.page,
                    total_pages: Some(1),
                    has_next: false,
                });
            }
        }

        let dir_url = if query_params.is_empty() {
            self.url("/directorio")
        } else {
            self.url(&format!("/directorio?{}", query_params.join("&")))
        };

        let html = fetch_html(&dir_url, Some(&self.base_url)).await
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

        let item_sel = Selector::parse("div.anime__item, div.custom_item").unwrap();
        let title_sel = Selector::parse("div.anime__item__text h5 a, h5 a, h5").unwrap();
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

        let has_next = doc.select(&Selector::parse("a.next, a.page-link[rel='next']").unwrap()).next().is_some() || results.len() >= 12;

        Ok(SearchResultPage {
            results,
            current_page: filters.page,
            total_pages: None,
            has_next,
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

fn server_priority(name: &str) -> i32 {
    let lower = name.to_lowercase();
    if lower.contains("magi") {
        100
    } else if lower.contains("desu") && !lower.contains("desuka") {
        90
    } else if lower.contains("mediafire") {
        80
    } else if lower.contains("streamwish") {
        70
    } else if lower.contains("desuka") {
        60
    } else if lower.contains("voe") {
        50
    } else {
        10
    }
}

fn clean_field_value(raw: &str, prefixes: &[&str]) -> String {
    let mut clean = raw.to_string();
    for p in prefixes {
        if let Some(idx) = clean.to_lowercase().find(&p.to_lowercase()) {
            clean = clean[idx + p.len()..].trim().to_string();
        }
    }
    clean.trim().to_string()
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
    if let Some(cap) = MEDIAFIRE_DL_RE.captures(&html) {
        return cap.get(1).map(|m| m.as_str().to_string());
    }
    let doc = Html::parse_document(&html);
    let sel = Selector::parse("a#downloadButton, a[aria-label*='Download file'], a.input").ok()?;
    doc.select(&sel).next().map(|a| attr(&a, "href")).filter(|h| !h.is_empty() && h.starts_with("http"))
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

fn default_jkanime_genres() -> Vec<GenreItem> {
    vec![
        GenreItem { name: "Acción".into(), slug: "accion".into() },
        GenreItem { name: "Aventura".into(), slug: "aventura".into() },
        GenreItem { name: "Comedia".into(), slug: "comedia".into() },
        GenreItem { name: "Drama".into(), slug: "drama".into() },
        GenreItem { name: "Fantasía".into(), slug: "fantasia".into() },
        GenreItem { name: "Magia".into(), slug: "magia".into() },
        GenreItem { name: "Misterio".into(), slug: "misterio".into() },
        GenreItem { name: "Romance".into(), slug: "romance".into() },
        GenreItem { name: "Sci-Fi".into(), slug: "sci-fi".into() },
        GenreItem { name: "Shounen".into(), slug: "shounen".into() },
        GenreItem { name: "Super Poderes".into(), slug: "super-poderes".into() },
        GenreItem { name: "Sobrenatural".into(), slug: "sobrenatural".into() },
        GenreItem { name: "Isekai".into(), slug: "isekai".into() },
        GenreItem { name: "Terror".into(), slug: "terror".into() },
        GenreItem { name: "Artes Marciales".into(), slug: "artes-marciales".into() },
        GenreItem { name: "Mecha".into(), slug: "mecha".into() },
        GenreItem { name: "Escolar".into(), slug: "colegial".into() },
        GenreItem { name: "Ecchi".into(), slug: "ecchi".into() },
        GenreItem { name: "Música".into(), slug: "musica".into() },
        GenreItem { name: "Histórico".into(), slug: "historico".into() },
    ]
}
