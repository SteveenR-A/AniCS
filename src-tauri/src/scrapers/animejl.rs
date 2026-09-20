use std::collections::HashMap;
use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use scraper::{Html, Selector};

use crate::core::*;
use crate::scrapers::{fetch_html, AnimeExtractor};

const DEFAULT_ANIMEJL_URL: &str = "https://www.anime-jl.net";

static EPISODES_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?s)var\s+episodes\s*=\s*\[(.*?)\]\s*;"#).unwrap()
});

static EPISODE_ITEM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\[\s*(\d+)\s*,\s*["']([^"']*)["']\s*(?:,\s*["']([^"']*)["'])?"#).unwrap()
});

static VIDEO_ARRAY_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"video\[(\d+)\]\s*=\s*['"]<iframe[^>]+src=['"]([^'"]+)['"]"#).unwrap()
});

static IFRAME_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<iframe[^>]+src=["']([^"']+)["']"#).unwrap()
});

static M3U8_DIRECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(https?://[^\s"'\\<>]+\.m3u8[^\s"'\\<>]*)"#).unwrap()
});

static MP4_DIRECT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(https?://[^\s"'\\<>]+\.mp4[^\s"'\\<>]*)"#).unwrap()
});

static MEDIAFIRE_DL_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"href=["'](https?://download\d+\.mediafire\.com/[^"']+)["']"#).unwrap()
});

static EPISODE_SEGMENT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"/(?:episodio|capitulo)-(\d+)"#).unwrap()
});

pub struct AnimeJLExtractor {
    base_url: String,
}

impl AnimeJLExtractor {
    pub fn new() -> Self {
        let base = crate::storage::get_setting("animejl_base_url")
            .unwrap_or(None)
            .unwrap_or_else(|| DEFAULT_ANIMEJL_URL.to_string());
        Self { base_url: base }
    }

    #[allow(dead_code)]
    pub fn with_base_url(base_url: String) -> Self {
        Self { base_url }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), if path.starts_with('/') { path.to_string() } else { format!("/{}", path) })
    }

    /// Normaliza URLs de Anime-JL resolviendo fragmentaciones, segmentos duplicados o variantes
    pub fn normalize_url(&self, href: &str) -> String {
        let trimmed = href.trim();
        if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
            // Unificar dominio base asegurando HTTPS y www
            let replaced = trimmed
                .replace("http://www.anime-jl.net", "https://www.anime-jl.net")
                .replace("https://anime-jl.net", "https://www.anime-jl.net")
                .replace("http://anime-jl.net", "https://www.anime-jl.net");
            replaced
        } else if trimmed.starts_with("//") {
            format!("https:{}", trimmed)
        } else {
            let path = if trimmed.starts_with('/') {
                trimmed.to_string()
            } else {
                format!("/{}", trimmed)
            };
            format!("{}{}", self.base_url.trim_end_matches('/'), path)
        }
    }

    /// Extrae la URL canónica de la serie a partir de cualquier variante (episodio, parámetros, hash, etc.)
    /// Ej: https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7/episodio-1 -> https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7
    pub fn canonical_series_url(&self, input_url: &str) -> String {
        let clean = input_url.split('?').next().unwrap_or(input_url).split('#').next().unwrap_or(input_url).trim();
        let normalized = self.normalize_url(clean);

        // Si contiene /episodio-N o /capitulo-N, remover ese segmento final
        if let Some(mat) = EPISODE_SEGMENT_RE.find(&normalized) {
            let start = mat.start();
            return normalized[..start].trim_end_matches('/').to_string();
        }

        normalized.trim_end_matches('/').to_string()
    }

    /// Construye una URL de episodio resiliente garantizando los 4 segmentos requeridos por Anime-JL
    pub fn build_episode_url(&self, series_or_episode_url: &str, episode_number: u32) -> String {
        let series_canonical = self.canonical_series_url(series_or_episode_url);
        format!("{}/episodio-{}", series_canonical, episode_number)
    }

    /// Extrae el número de episodio de una URL
    pub fn extract_episode_number(&self, url: &str) -> Option<u32> {
        if let Some(caps) = EPISODE_SEGMENT_RE.captures(url) {
            return caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok());
        }
        None
    }

    /// Mapea nombre o slug de género al ID numérico de Anime-JL
    fn genre_to_id(genre: &str) -> Option<&'static str> {
        let g = genre.trim().to_lowercase();
        match g.as_str() {
            "accion" | "acción" | "1" => Some("1"),
            "artes-marciales" | "artes marciales" | "2" => Some("2"),
            "aventura" | "aventuras" | "3" => Some("3"),
            "carreras" | "4" => Some("4"),
            "ciencia-ficcion" | "ciencia ficción" | "ciencia ficcion" | "33" => Some("33"),
            "comedia" | "9" => Some("9"),
            "demencia" | "10" => Some("10"),
            "demonios" | "11" => Some("11"),
            "deportes" | "13" => Some("13"),
            "drama" | "15" => Some("15"),
            "ecchi" | "16" => Some("16"),
            "escolar" | "escolares" | "17" => Some("17"),
            "espacial" | "18" => Some("18"),
            "fantasia" | "fantasía" | "19" => Some("19"),
            "sobrenatural" | "20" | "41" => Some("20"),
            "harem" | "21" => Some("21"),
            "historico" | "histórico" | "22" => Some("22"),
            "infantil" | "23" => Some("23"),
            "josei" | "24" => Some("24"),
            "juegos" | "25" => Some("25"),
            "magia" | "26" => Some("26"),
            "mecha" | "27" => Some("27"),
            "militar" | "28" => Some("28"),
            "misterio" | "29" => Some("29"),
            "musica" | "música" | "30" => Some("30"),
            "parodia" | "31" => Some("31"),
            "policial" | "policia" | "policía" | "32" => Some("32"),
            "psicologico" | "psicológico" | "34" => Some("34"),
            "romance" | "35" => Some("35"),
            "samurai" | "36" => Some("36"),
            "seinen" | "37" => Some("37"),
            "shoujo" | "38" => Some("38"),
            "shounen" | "shonen" | "39" => Some("39"),
            "slice-of-life" | "recuentos de la vida" | "40" => Some("40"),
            "suspenso" | "42" => Some("42"),
            "terror" | "43" => Some("43"),
            "vampiros" | "44" => Some("44"),
            "yaoi" | "45" => Some("45"),
            "yuri" | "46" => Some("46"),
            _ => None,
        }
    }
}

#[async_trait]
impl AnimeExtractor for AnimeJLExtractor {
    fn id(&self) -> &'static str {
        "animejl"
    }

    fn name(&self) -> &'static str {
        "Anime-JL"
    }

    fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Búsqueda simple por texto
    async fn search(&self, query: &str) -> AppResult<Vec<AnimeResult>> {
        let search_url = self.url(&format!("/animes?q={}", urlencoding::encode(query.trim())));
        let html = fetch_html(&search_url, Some(&self.base_url))
            .await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Ok(vec![]);
        }

        let doc = Html::parse_document(&html);
        let mut results = vec![];

        let article_sel = Selector::parse("ul.ListAnimes li article, article.Anime").expect("Invalid CSS selector");
        let link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
        let title_sel = Selector::parse("h3.Title, .Title, h3").expect("Invalid CSS selector");
        let img_sel = Selector::parse("figure img, img").expect("Invalid CSS selector");
        let type_sel = Selector::parse(".Type").expect("Invalid CSS selector");
        let rating_sel = Selector::parse(".Vts").expect("Invalid CSS selector");
        let desc_sel = Selector::parse(".Description p, p").expect("Invalid CSS selector");
        let estreno_sel = Selector::parse(".Estreno").expect("Invalid CSS selector");

        for article in doc.select(&article_sel) {
            let link = match article.select(&link_sel).next() {
                Some(l) => l,
                None => continue,
            };

            let href = attr(&link, "href");
            if href.is_empty() {
                continue;
            }

            let canonical_url = self.canonical_series_url(&href);

            let title = article
                .select(&title_sel)
                .next()
                .map(|t| inner_text(&t))
                .unwrap_or_else(|| {
                    article.select(&img_sel).next().map(|i| attr(&i, "alt")).unwrap_or_default()
                });

            if title.is_empty() {
                continue;
            }

            let thumbnail_url = article
                .select(&img_sel)
                .next()
                .map(|i| {
                    let src = attr(&i, "src");
                    if src.is_empty() {
                        attr(&i, "data-src")
                    } else {
                        src
                    }
                })
                .map(|src| self.normalize_url(&src))
                .unwrap_or_default();

            let anime_type = article.select(&type_sel).next().map(|t| inner_text(&t));
            let rating = article.select(&rating_sel).next().and_then(|r| inner_text(&r).parse::<f32>().ok());
            let description = article.select(&desc_sel).next().map(|d| inner_text(&d)).filter(|s| !s.is_empty());
            let is_estreno = article.select(&estreno_sel).next().is_some();

            let status = if is_estreno {
                Some("Estreno".to_string())
            } else {
                None
            };

            results.push(AnimeResult {
                title,
                url: canonical_url,
                thumbnail_url,
                description,
                episode: None,
                anime_type,
                status,
                genres: None,
                year: None,
                rating,
                source: self.id().to_string(),
                profile_id: None,
            });
        }

        Ok(results)
    }

    /// Últimos episodios emitidos (feed de inicio o paginado)
    async fn get_latest(&self, page: u32) -> AppResult<Vec<AnimeResult>> {
        if page <= 1 {
            // Página de inicio con episodios recientes
            let html = fetch_html(&self.base_url, None).await.map_err(AppError::Network)?;
            if html.is_empty() {
                return Ok(vec![]);
            }

            let doc = Html::parse_document(&html);
            let mut results = vec![];

            // Mapear pósters oficiales de series presentes en la portada (ListAnimes, Series, Slider)
            let mut poster_map: HashMap<String, String> = HashMap::new();
            let series_card_sel = Selector::parse("ul.ListAnimes li article, article.Anime, .Series li, .Slider li, .Top li").expect("Invalid CSS selector");
            let series_link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
            let series_img_sel = Selector::parse("figure img, img").expect("Invalid CSS selector");

            for card in doc.select(&series_card_sel) {
                if let Some(link) = card.select(&series_link_sel).next() {
                    let href = attr(&link, "href");
                    if href.is_empty() {
                        continue;
                    }
                    let canonical = self.canonical_series_url(&href);
                    if let Some(img) = card.select(&series_img_sel).next() {
                        let src = attr(&img, "src");
                        let data_src = attr(&img, "data-src");
                        let chosen_src = if !src.is_empty() { src } else { data_src };
                        if !chosen_src.is_empty() && (chosen_src.contains("animes_tumbl") || !chosen_src.contains("episodes_tumbl")) {
                            poster_map.insert(canonical, self.normalize_url(&chosen_src));
                        }
                    }
                }
            }

            let item_sel = Selector::parse("ul.ListEpisodios li").expect("Invalid CSS selector");
            let link_sel = Selector::parse("a").expect("Invalid CSS selector");
            let title_sel = Selector::parse("strong.Title, .Title").expect("Invalid CSS selector");
            let capi_sel = Selector::parse(".Capi").expect("Invalid CSS selector");
            let img_sel = Selector::parse(".Image img, img").expect("Invalid CSS selector");

            for item in doc.select(&item_sel) {
                let link = match item.select(&link_sel).next() {
                    Some(l) => l,
                    None => continue,
                };

                let href = attr(&link, "href");
                if href.is_empty() {
                    continue;
                }

                // La URL de la serie (removiendo /episodio-N) para que navegar lleve a detalles
                let canonical_url = self.canonical_series_url(&href);

                let title = item
                    .select(&title_sel)
                    .next()
                    .map(|t| inner_text(&t))
                    .unwrap_or_else(|| {
                        item.select(&img_sel).next().map(|i| attr(&i, "alt")).unwrap_or_default()
                    });

                if title.is_empty() {
                    continue;
                }

                let episode_text = item
                    .select(&capi_sel)
                    .next()
                    .map(|c| inner_text(&c))
                    .or_else(|| self.extract_episode_number(&href).map(|n| format!("Episodio {}", n)));

                let raw_thumb = item
                    .select(&img_sel)
                    .next()
                    .map(|i| {
                        let src = attr(&i, "src");
                        if src.is_empty() {
                            attr(&i, "data-src")
                        } else {
                            src
                        }
                    })
                    .map(|src| self.normalize_url(&src))
                    .unwrap_or_default();

                // Preferir póster oficial si está disponible en la portada, de lo contrario usar captura
                let thumbnail_url = poster_map.get(&canonical_url).cloned().unwrap_or(raw_thumb);

                results.push(AnimeResult {
                    title,
                    url: canonical_url,
                    thumbnail_url,
                    description: None,
                    episode: episode_text,
                    anime_type: Some("Anime".to_string()),
                    status: Some("En emisión".to_string()),
                    genres: None,
                    year: None,
                    rating: None,
                    source: self.id().to_string(),
                    profile_id: None,
                });
            }

            if !results.is_empty() {
                return Ok(results);
            }
        }

        // Paginado de series en emisión
        let url = self.url(&format!("/animes?estado[]=0&page={}", page));
        let html = fetch_html(&url, Some(&self.base_url)).await.map_err(AppError::Network)?;
        let doc = Html::parse_document(&html);
        let mut results = vec![];

        let article_sel = Selector::parse("ul.ListAnimes li article, article.Anime").expect("Invalid CSS selector");
        let link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
        let title_sel = Selector::parse("h3.Title, .Title, h3").expect("Invalid CSS selector");
        let img_sel = Selector::parse("figure img, img").expect("Invalid CSS selector");
        let type_sel = Selector::parse(".Type").expect("Invalid CSS selector");

        for article in doc.select(&article_sel) {
            if let Some(link) = article.select(&link_sel).next() {
                let href = attr(&link, "href");
                if href.is_empty() {
                    continue;
                }
                let canonical_url = self.canonical_series_url(&href);
                let title = article.select(&title_sel).next().map(|t| inner_text(&t)).unwrap_or_default();
                if title.is_empty() {
                    continue;
                }

                let thumbnail_url = article
                    .select(&img_sel)
                    .next()
                    .map(|i| attr(&i, "src"))
                    .map(|src| self.normalize_url(&src))
                    .unwrap_or_default();

                let anime_type = article.select(&type_sel).next().map(|t| inner_text(&t));

                results.push(AnimeResult {
                    title,
                    url: canonical_url,
                    thumbnail_url,
                    description: None,
                    episode: None,
                    anime_type,
                    status: Some("En emisión".to_string()),
                    genres: None,
                    year: None,
                    rating: None,
                    source: self.id().to_string(),
                    profile_id: None,
                });
            }
        }

        Ok(results)
    }

    /// Horario plano
    async fn get_schedule(&self) -> AppResult<Vec<AnimeResult>> {
        let days = self.get_schedule_days().await?;
        let mut all = vec![];
        for day in days {
            all.extend(day.animes);
        }
        Ok(all)
    }

    /// Horario estructurado agrupado por días de la semana
    async fn get_schedule_days(&self) -> AppResult<Vec<ScheduleDay>> {
        let schedule_url = self.url("/programacion");
        let html = fetch_html(&schedule_url, Some(&self.base_url))
            .await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Ok(vec![]);
        }

        let doc = Html::parse_document(&html);
        let mut schedule_days = vec![];

        // Días definidos en Anime-JL: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
        let day_mappings = [
            ("Monday", "Lunes"),
            ("Tuesday", "Martes"),
            ("Wednesday", "Miércoles"),
            ("Thursday", "Jueves"),
            ("Friday", "Viernes"),
            ("Saturday", "Sábado"),
            ("Sunday", "Domingo"),
        ];

        let link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
        let title_sel = Selector::parse("h3, .Title, strong, p").expect("Invalid CSS selector");
        let img_sel = Selector::parse("img").expect("Invalid CSS selector");

        for (day_id, day_es) in day_mappings {
            if let Some(c_sel) = Selector::parse(&format!("#{0}, #{0}-hd, div[id*='{0}']", day_id)).ok() {
                let mut animes = vec![];
                for container in doc.select(&c_sel) {
                    for link in container.select(&link_sel) {
                        let href = attr(&link, "href");
                        if href.is_empty() {
                            continue;
                        }
                        let canonical_url = self.canonical_series_url(&href);
                        let title = link
                            .select(&title_sel)
                            .next()
                            .map(|t| inner_text(&t))
                            .unwrap_or_else(|| attr(&link, "title"));
                        if title.is_empty() {
                            continue;
                        }

                        let thumbnail_url = link
                            .select(&img_sel)
                            .next()
                            .map(|i| attr(&i, "src"))
                            .map(|s| self.normalize_url(&s))
                            .unwrap_or_default();

                        animes.push(AnimeResult {
                            title,
                            url: canonical_url,
                            thumbnail_url,
                            description: None,
                            episode: None,
                            anime_type: Some("Anime".to_string()),
                            status: Some("En emisión".to_string()),
                            genres: None,
                            year: None,
                            rating: None,
                            source: self.id().to_string(),
                            profile_id: None,
                        });
                    }
                }

                if !animes.is_empty() {
                    schedule_days.push(ScheduleDay {
                        day: day_es.to_string(),
                        animes,
                    });
                }
            }
        }

        Ok(schedule_days)
    }

    /// Top y populares
    async fn get_top(&self) -> AppResult<Vec<AnimeResult>> {
        let url = self.url("/animes?order=rating");
        let html = fetch_html(&url, Some(&self.base_url))
            .await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return self.get_latest(1).await;
        }

        let results = {
            let doc = Html::parse_document(&html);
            let mut res = vec![];

            let article_sel = Selector::parse("ul.ListAnimes li article, article.Anime").expect("Invalid CSS selector");
            let link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
            let title_sel = Selector::parse("h3.Title, .Title, h3").expect("Invalid CSS selector");
            let img_sel = Selector::parse("figure img, img").expect("Invalid CSS selector");
            let rating_sel = Selector::parse(".Vts").expect("Invalid CSS selector");
            let type_sel = Selector::parse(".Type").expect("Invalid CSS selector");

            for article in doc.select(&article_sel) {
                if let Some(link) = article.select(&link_sel).next() {
                    let href = attr(&link, "href");
                    if href.is_empty() {
                        continue;
                    }
                    let canonical_url = self.canonical_series_url(&href);
                    let title = article.select(&title_sel).next().map(|t| inner_text(&t)).unwrap_or_default();
                    if title.is_empty() {
                        continue;
                    }
                    let thumbnail_url = article
                        .select(&img_sel)
                        .next()
                        .map(|i| attr(&i, "src"))
                        .map(|s| self.normalize_url(&s))
                        .unwrap_or_default();

                    let rating = article.select(&rating_sel).next().and_then(|r| inner_text(&r).parse::<f32>().ok());
                    let anime_type = article.select(&type_sel).next().map(|t| inner_text(&t));

                    res.push(AnimeResult {
                        title,
                        url: canonical_url,
                        thumbnail_url,
                        description: None,
                        episode: None,
                        anime_type,
                        status: None,
                        genres: None,
                        year: None,
                        rating,
                        source: self.id().to_string(),
                        profile_id: None,
                    });
                }
            }
            res
        };

        if results.is_empty() {
            self.get_latest(1).await
        } else {
            Ok(results)
        }
    }

    /// Detalles completos de una serie y lista de episodios
    async fn get_details(&self, url: &str) -> AppResult<AnimeDetails> {
        // Normalizar URL a nivel de serie (si llega un episodio, lo reencauza)
        let series_url = self.canonical_series_url(url);
        let html = fetch_html(&series_url, Some(&self.base_url))
            .await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Err(AppError::Parse(format!("Página vacía al obtener detalles de {}", series_url)));
        }

        let doc = Html::parse_document(&html);

        // Título
        let title_sel = Selector::parse("h1.Title, h1, meta[property='og:title']").expect("Invalid CSS selector");
        let title = doc
            .select(&title_sel)
            .next()
            .map(|t| {
                if t.value().name() == "meta" {
                    attr(&t, "content")
                } else {
                    inner_text(&t)
                }
            })
            .unwrap_or_default();

        // Sinopsis
        let sinopsis_sel = Selector::parse(".Sinopsis, .Description, .overview, p.sinopsis, meta[property='og:description']").expect("Invalid CSS selector");
        let synopsis = doc
            .select(&sinopsis_sel)
            .next()
            .map(|s| {
                if s.value().name() == "meta" {
                    attr(&s, "content")
                } else {
                    inner_text(&s)
                }
            })
            .unwrap_or_default();

        // Miniatura / Portada
        let img_sel = Selector::parse(".Image figure img, figure img, .Anime-cover img, meta[property='og:image']").expect("Invalid CSS selector");
        let thumbnail_url = doc
            .select(&img_sel)
            .next()
            .map(|i| {
                if i.value().name() == "meta" {
                    attr(&i, "content")
                } else {
                    let s = attr(&i, "src");
                    if s.is_empty() {
                        attr(&i, "data-src")
                    } else {
                        s
                    }
                }
            })
            .map(|s| self.normalize_url(&s))
            .unwrap_or_default();

        // Géneros
        let mut genres = vec![];
        let genre_sel = Selector::parse("nav.Nvgnrs a, a[href*='genre'], a[href*='genero'], .genres a").expect("Invalid CSS selector");
        for g in doc.select(&genre_sel) {
            let text = inner_text(&g);
            if !text.is_empty() && !genres.contains(&text) {
                genres.push(text);
            }
        }

        // Estado y tipo
        let status_sel = Selector::parse(".estado, .fa-clock-o, span[class*='status'], .type-status").expect("Invalid CSS selector");
        let status_text = doc.select(&status_sel).next().map(|s| inner_text(&s));

        let type_sel = Selector::parse(".Type, span.type").expect("Invalid CSS selector");
        let anime_type = doc.select(&type_sel).next().map(|t| inner_text(&t));

        let rating_sel = Selector::parse(".Vts, .votes, .rating").expect("Invalid CSS selector");
        let rating = doc.select(&rating_sel).next().and_then(|r| inner_text(&r).parse::<f32>().ok());

        // Extraer lista de episodios
        let mut episodes: Vec<Episode> = vec![];

        // Método 1: Variable JavaScript 'var episodes = [[25, "episodio-25", "..."], ..., [1, "episodio-1", "..."],];'
        if let Some(caps) = EPISODES_BLOCK_RE.captures(&html) {
            if let Some(block_match) = caps.get(1) {
                let block = block_match.as_str();
                for item_caps in EPISODE_ITEM_RE.captures_iter(block) {
                    let ep_num = item_caps.get(1).and_then(|m| m.as_str().parse::<u32>().ok()).unwrap_or(0);
                    let ep_slug = item_caps.get(2).map(|m| m.as_str()).unwrap_or("");
                    let thumb_path = item_caps.get(3).map(|m| m.as_str()).unwrap_or("");

                    if ep_num > 0 {
                        let ep_url = if ep_slug.is_empty() {
                            format!("{}/episodio-{}", series_url, ep_num)
                        } else {
                            format!("{}/{}", series_url, ep_slug.trim_start_matches('/'))
                        };

                        let ep_thumb = if !thumb_path.is_empty() {
                            let clean_thumb = if thumb_path.starts_with('/') {
                                thumb_path.to_string()
                            } else {
                                format!("/storage/{}", thumb_path)
                            };
                            Some(self.normalize_url(&clean_thumb))
                        } else {
                            None
                        };

                        episodes.push(Episode {
                            number: ep_num,
                            title: Some(format!("Episodio {}", ep_num)),
                            url: ep_url,
                            thumbnail_url: ep_thumb,
                            watched: false,
                            watch_progress: None,
                        });
                    }
                }
            }
        }

        // Método 2 (fallback): Enlaces directos en el DOM
        if episodes.is_empty() {
            let ep_link_sel = Selector::parse("ul.ListEpisodios li a, ul.episodes li a, a[href*='/episodio-']").expect("Invalid CSS selector");
            for link in doc.select(&ep_link_sel) {
                let href = attr(&link, "href");
                if let Some(ep_num) = self.extract_episode_number(&href) {
                    let ep_url = self.normalize_url(&href);
                    if !episodes.iter().any(|e| e.number == ep_num) {
                        episodes.push(Episode {
                            number: ep_num,
                            title: Some(format!("Episodio {}", ep_num)),
                            url: ep_url,
                            thumbnail_url: None,
                            watched: false,
                            watch_progress: None,
                        });
                    }
                }
            }
        }

        // Ordenar cronológicamente (Episodio 1 al N)
        episodes.sort_by_key(|e| e.number);

        let total_episodes = if !episodes.is_empty() {
            Some(episodes.len().to_string())
        } else {
            None
        };

        Ok(AnimeDetails {
            title,
            url: series_url,
            thumbnail_url,
            synopsis,
            genres,
            status: status_text,
            anime_type,
            studio: None,
            duration: None,
            total_episodes,
            season: None,
            broadcast: None,
            languages: None,
            year: None,
            rating,
            episodes,
            source: self.id().to_string(),
        })
    }

    /// Servidores de video para un episodio
    async fn get_servers(&self, episode_url: &str) -> AppResult<Vec<VideoServer>> {
        // Asegurar que la URL sea un episodio válido
        let target_url = if !episode_url.contains("/episodio-") && !episode_url.contains("/capitulo-") {
            self.build_episode_url(episode_url, 1)
        } else {
            self.normalize_url(episode_url)
        };

        let html = fetch_html(&target_url, Some(&self.base_url))
            .await
            .map_err(AppError::Network)?;

        if html.is_empty() {
            return Ok(vec![]);
        }

        let mut servers = vec![];
        let mut server_names: HashMap<usize, String> = HashMap::new();

        // 1. Extraer nombres amigables de pestañas `.CapiTnv li`
        let doc = Html::parse_document(&html);
        let tab_sel = Selector::parse(".CapiTnv li").expect("Invalid CSS selector");
        let link_sel = Selector::parse("a").expect("Invalid CSS selector");

        for (idx, li) in doc.select(&tab_sel).enumerate() {
            let title_attr = attr(&li, "title");
            let data_id = attr(&li, "data-id");
            let index_val = li
                .select(&link_sel)
                .next()
                .map(|a| attr(&a, "data-index"))
                .and_then(|idx_str| idx_str.parse::<usize>().ok())
                .unwrap_or(idx);

            let clean_name = if !title_attr.is_empty() {
                title_attr
            } else if !data_id.is_empty() {
                data_id
            } else {
                format!("Opción {}", index_val + 1)
            };

            server_names.insert(index_val, clean_name);
        }

        // 2. Extraer embeds de `video[i] = '<iframe src="...">'`
        for caps in VIDEO_ARRAY_RE.captures_iter(&html) {
            if let (Some(idx_match), Some(src_match)) = (caps.get(1), caps.get(2)) {
                let idx: usize = idx_match.as_str().parse().unwrap_or(0);
                let raw_src = src_match.as_str().replace(r#"\"#, "").replace("&amp;", "&");

                if !raw_src.is_empty() && (raw_src.starts_with("http") || raw_src.starts_with("//")) {
                    let full_url = if raw_src.starts_with("//") {
                        format!("https:{}", raw_src)
                    } else {
                        raw_src
                    };

                    let friendly_name = server_names
                        .get(&idx)
                        .cloned()
                        .unwrap_or_else(|| infer_server_name(&full_url));

                    servers.push(VideoServer {
                        name: friendly_name,
                        url: full_url,
                        is_direct: false,
                        referer: Some(target_url.clone()),
                    });
                }
            }
        }

        // 3. Fallback: buscar etiquetas iframe directas si no hubo array
        if servers.is_empty() {
            for caps in IFRAME_RE.captures_iter(&html) {
                if let Some(src_match) = caps.get(1) {
                    let raw_src = src_match.as_str().replace(r#"\"#, "").replace("&amp;", "&");
                    if raw_src.starts_with("http") || raw_src.starts_with("//") {
                        let full_url = if raw_src.starts_with("//") {
                            format!("https:{}", raw_src)
                        } else {
                            raw_src
                        };

                        let name = infer_server_name(&full_url);
                        if !servers.iter().any(|s| s.url == full_url) {
                            servers.push(VideoServer {
                                name,
                                url: full_url,
                                is_direct: false,
                                referer: Some(target_url.clone()),
                            });
                        }
                    }
                }
            }
        }

        // 4. Enlaces de descarga (Mediafire / Mega)
        let dl_sel = Selector::parse("a[href*='mediafire.com'], a[href*='mega.nz'], a.Button.Download, a[href*='download']").expect("Invalid CSS selector");
        for a in doc.select(&dl_sel) {
            let href = attr(&a, "href");
            if href.starts_with("http") && !servers.iter().any(|s| s.url == href) {
                let name = infer_server_name(&href);
                servers.push(VideoServer {
                    name,
                    url: href,
                    is_direct: false,
                    referer: Some(target_url.clone()),
                });
            }
        }

        // Ordenar por prioridad de servidores
        servers.sort_by(|a, b| {
            let score_a = server_priority(&a.name, &a.url);
            let score_b = server_priority(&b.name, &b.url);
            score_b.cmp(&score_a)
        });

        Ok(servers)
    }

    /// Resolver stream a URL directa (.m3u8 / .mp4)
    async fn resolve_stream(&self, server: &VideoServer) -> AppResult<ResolvedMedia> {
        let url = &server.url;

        // 1. Directo m3u8 o mp4
        if url.contains(".m3u8") {
            return Ok(ResolvedMedia {
                direct_url: url.clone(),
                media_type: MediaType::Hls,
                referer: server.referer.clone().or_else(|| Some(self.base_url.clone())),
                user_agent: None,
                qualities: vec![],
            });
        }

        if url.contains(".mp4") || url.contains(".mkv") {
            return Ok(ResolvedMedia {
                direct_url: url.clone(),
                media_type: MediaType::Mp4,
                referer: server.referer.clone().or_else(|| Some(self.base_url.clone())),
                user_agent: None,
                qualities: vec![],
            });
        }

        // 2. Mediafire
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

        // 3. Intento de extracción de stream de páginas embed (Ok.ru, Streamwish, Vidhide, VOE, etc.)
        if let Ok(embed_html) = fetch_html(url, server.referer.as_deref()).await {
            // A) Buscar .m3u8 directo
            if let Some(m) = M3U8_DIRECT_RE.find(&embed_html) {
                let stream_url = m.as_str().replace('\\', "").replace('\'', "").replace('"', "");
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Hls,
                    referer: Some(url.clone()),
                    user_agent: None,
                    qualities: vec![],
                });
            }

            // B) JsUnpacker si estuviera empaquetado (eval(function(p,a,c,k,e,d)...))
            if let Some(stream_url) = JsUnpacker::extract_stream_url(&embed_html) {
                let media_type = if stream_url.contains(".m3u8") {
                    MediaType::Hls
                } else {
                    MediaType::Mp4
                };
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type,
                    referer: Some(url.clone()),
                    user_agent: None,
                    qualities: vec![],
                });
            }

            // C) Buscar .mp4 directo
            if let Some(m) = MP4_DIRECT_RE.find(&embed_html) {
                let stream_url = m.as_str().replace('\\', "").replace('\'', "").replace('"', "");
                return Ok(ResolvedMedia {
                    direct_url: stream_url,
                    media_type: MediaType::Mp4,
                    referer: Some(url.clone()),
                    user_agent: None,
                    qualities: vec![],
                });
            }
        }

        // 4. Fallback: retornar URL del servidor
        let media_type = if url.contains(".m3u8") {
            MediaType::Hls
        } else if url.contains(".mp4") {
            MediaType::Mp4
        } else {
            MediaType::Unknown
        };

        Ok(ResolvedMedia {
            direct_url: url.clone(),
            media_type,
            referer: server.referer.clone().or_else(|| Some(self.base_url.clone())),
            user_agent: None,
            qualities: vec![],
        })
    }

    /// Obtener lista de géneros disponibles en Anime-JL
    async fn get_genres(&self) -> AppResult<Vec<GenreItem>> {
        Ok(vec![
            GenreItem { name: "Acción".to_string(), slug: "accion".to_string() },
            GenreItem { name: "Artes Marciales".to_string(), slug: "artes-marciales".to_string() },
            GenreItem { name: "Aventuras".to_string(), slug: "aventuras".to_string() },
            GenreItem { name: "Ciencia Ficción".to_string(), slug: "ciencia-ficcion".to_string() },
            GenreItem { name: "Comedia".to_string(), slug: "comedia".to_string() },
            GenreItem { name: "Deportes".to_string(), slug: "deportes".to_string() },
            GenreItem { name: "Drama".to_string(), slug: "drama".to_string() },
            GenreItem { name: "Ecchi".to_string(), slug: "ecchi".to_string() },
            GenreItem { name: "Escolares".to_string(), slug: "escolar".to_string() },
            GenreItem { name: "Fantasía".to_string(), slug: "fantasia".to_string() },
            GenreItem { name: "Harem".to_string(), slug: "harem".to_string() },
            GenreItem { name: "Histórico".to_string(), slug: "historico".to_string() },
            GenreItem { name: "Magia".to_string(), slug: "magia".to_string() },
            GenreItem { name: "Mecha".to_string(), slug: "mecha".to_string() },
            GenreItem { name: "Militar".to_string(), slug: "militar".to_string() },
            GenreItem { name: "Misterio".to_string(), slug: "misterio".to_string() },
            GenreItem { name: "Música".to_string(), slug: "musica".to_string() },
            GenreItem { name: "Psicológico".to_string(), slug: "psicologico".to_string() },
            GenreItem { name: "Romance".to_string(), slug: "romance".to_string() },
            GenreItem { name: "Seinen".to_string(), slug: "seinen".to_string() },
            GenreItem { name: "Shoujo".to_string(), slug: "shoujo".to_string() },
            GenreItem { name: "Shounen".to_string(), slug: "shounen".to_string() },
            GenreItem { name: "Sobrenatural".to_string(), slug: "sobrenatural".to_string() },
            GenreItem { name: "Suspenso".to_string(), slug: "suspenso".to_string() },
            GenreItem { name: "Terror".to_string(), slug: "terror".to_string() },
            GenreItem { name: "Vampiros".to_string(), slug: "vampiros".to_string() },
        ])
    }

    /// Búsqueda avanzada con filtros (Estrenos, Géneros, Estado, Tipo, Año)
    async fn advanced_search(&self, filters: &SearchFilters) -> AppResult<SearchResultPage> {
        let mut query_params = vec![];

        if let Some(q) = &filters.query {
            if !q.trim().is_empty() {
                query_params.push(format!("q={}", urlencoding::encode(q.trim())));
            }
        }

        if let Some(g) = &filters.genre {
            if let Some(gid) = Self::genre_to_id(g) {
                query_params.push(format!("genre[]={}", gid));
            }
        }

        if let Some(st) = &filters.status {
            let s_lower = st.trim().to_lowercase();
            match s_lower.as_str() {
                "estreno" | "estrenos" | "2" => query_params.push("estado[]=2".to_string()),
                "en-emision" | "emision" | "en emisión" | "0" => query_params.push("estado[]=0".to_string()),
                "finalizado" | "concluido" | "finalizados" | "1" => query_params.push("estado[]=1".to_string()),
                _ => {}
            }
        }

        if let Some(t) = &filters.anime_type {
            let t_lower = t.trim().to_lowercase();
            match t_lower.as_str() {
                "anime" | "serie" | "series" | "animes" | "1" => query_params.push("tipo[]=1".to_string()),
                "ova" | "ovas" | "2" => query_params.push("tipo[]=2".to_string()),
                "pelicula" | "movie" | "película" | "peliculas" | "3" => query_params.push("tipo[]=3".to_string()),
                "donghua" | "7" => query_params.push("tipo[]=7".to_string()),
                _ => {}
            }
        }

        if let Some(y) = &filters.year {
            if !y.trim().is_empty() && y.trim() != "todos" {
                query_params.push(format!("year[]={}", urlencoding::encode(y.trim())));
            }
        }

        if filters.page > 1 {
            query_params.push(format!("page={}", filters.page));
        }

        let full_query = if query_params.is_empty() {
            "/animes".to_string()
        } else {
            format!("/animes?{}", query_params.join("&"))
        };

        let search_url = self.url(&full_query);
        let html = fetch_html(&search_url, Some(&self.base_url))
            .await
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

        let article_sel = Selector::parse("ul.ListAnimes li article, article.Anime").expect("Invalid CSS selector");
        let link_sel = Selector::parse("a[href*='/anime/']").expect("Invalid CSS selector");
        let title_sel = Selector::parse("h3.Title, .Title, h3").expect("Invalid CSS selector");
        let img_sel = Selector::parse("figure img, img").expect("Invalid CSS selector");
        let type_sel = Selector::parse(".Type").expect("Invalid CSS selector");
        let rating_sel = Selector::parse(".Vts").expect("Invalid CSS selector");
        let desc_sel = Selector::parse(".Description p, p").expect("Invalid CSS selector");
        let estreno_sel = Selector::parse(".Estreno").expect("Invalid CSS selector");

        for article in doc.select(&article_sel) {
            let link = match article.select(&link_sel).next() {
                Some(l) => l,
                None => continue,
            };

            let href = attr(&link, "href");
            if href.is_empty() {
                continue;
            }

            let canonical_url = self.canonical_series_url(&href);
            let title = article
                .select(&title_sel)
                .next()
                .map(|t| inner_text(&t))
                .unwrap_or_else(|| {
                    article.select(&img_sel).next().map(|i| attr(&i, "alt")).unwrap_or_default()
                });

            if title.is_empty() {
                continue;
            }

            let thumbnail_url = article
                .select(&img_sel)
                .next()
                .map(|i| {
                    let s = attr(&i, "src");
                    if s.is_empty() { attr(&i, "data-src") } else { s }
                })
                .map(|s| self.normalize_url(&s))
                .unwrap_or_default();

            let anime_type = article.select(&type_sel).next().map(|t| inner_text(&t));
            let rating = article.select(&rating_sel).next().and_then(|r| inner_text(&r).parse::<f32>().ok());
            let description = article.select(&desc_sel).next().map(|d| inner_text(&d)).filter(|s| !s.is_empty());
            let is_estreno = article.select(&estreno_sel).next().is_some();

            let status = if is_estreno {
                Some("Estreno".to_string())
            } else {
                None
            };

            results.push(AnimeResult {
                title,
                url: canonical_url,
                thumbnail_url,
                description,
                episode: None,
                anime_type,
                status,
                genres: None,
                year: None,
                rating,
                source: self.id().to_string(),
                profile_id: None,
            });
        }

        // Paginación: detectar si hay botón "Siguiente" o página siguiente
        let has_next = results.len() >= 20 || doc.select(&Selector::parse("ul.pagination li a[rel='next'], a.next").unwrap()).next().is_some();

        Ok(SearchResultPage {
            results,
            current_page: filters.page,
            total_pages: None,
            has_next,
        })
    }
}

// ──────────────────────────────────────────
// Helpers locales
// ──────────────────────────────────────────

fn attr(element: &scraper::ElementRef, name: &str) -> String {
    element.value().attr(name).unwrap_or_default().trim().to_string()
}

fn inner_text(element: &scraper::ElementRef) -> String {
    element.text().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn infer_server_name(url: &str) -> String {
    let lower = url.to_lowercase();
    if lower.contains("ok.ru") {
        "OK.ru".to_string()
    } else if lower.contains("voe.sx") {
        "VOE".to_string()
    } else if lower.contains("vidhide") {
        "Vidhide".to_string()
    } else if lower.contains("wish") || lower.contains("streamwish") {
        "Streamwish".to_string()
    } else if lower.contains("filemoon") || lower.contains("bysezoxexe") {
        "Filemoon".to_string()
    } else if lower.contains("uqload") {
        "Uqload".to_string()
    } else if lower.contains("mp4upload") {
        "Mp4Upload".to_string()
    } else if lower.contains("sendvid") {
        "Sendvid".to_string()
    } else if lower.contains("hqq") || lower.contains("netu") {
        "Netu".to_string()
    } else if lower.contains("mediafire") {
        "Mediafire".to_string()
    } else if lower.contains("mega.nz") || lower.contains("mega.co") {
        "Mega".to_string()
    } else if lower.contains("yourupload") {
        "YourUpload".to_string()
    } else if lower.contains("fembed") {
        "Fembed".to_string()
    } else {
        // Extraer host de la URL
        if let Ok(parsed) = url::Url::parse(url) {
            if let Some(host) = parsed.host_str() {
                return host.replace("www.", "");
            }
        }
        "Servidor".to_string()
    }
}

fn server_priority(name: &str, url: &str) -> u32 {
    let n = name.to_lowercase();
    let u = url.to_lowercase();

    if n.contains("filemoon") || u.contains("filemoon") || u.contains("bysezoxexe") {
        100
    } else if n.contains("ok.ru") || u.contains("ok.ru") {
        95
    } else if n.contains("voe") || u.contains("voe") {
        90
    } else if n.contains("vidhide") || u.contains("vidhide") {
        85
    } else if n.contains("streamwish") || u.contains("wish") {
        80
    } else if n.contains("uqload") || u.contains("uqload") {
        75
    } else if n.contains("mp4upload") || u.contains("mp4upload") {
        70
    } else if n.contains("mediafire") || u.contains("mediafire") {
        65
    } else if n.contains("sendvid") || u.contains("sendvid") {
        60
    } else if n.contains("mega") || u.contains("mega") {
        50
    } else {
        10
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canonical_series_url_strips_episode() {
        let ext = AnimeJLExtractor::new();
        let ep_url = "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7/episodio-1";
        assert_eq!(
            ext.canonical_series_url(ep_url),
            "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7"
        );
    }

    #[test]
    fn test_canonical_series_url_preserves_clean_series() {
        let ext = AnimeJLExtractor::new();
        let series = "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7";
        assert_eq!(ext.canonical_series_url(series), series);
    }

    #[test]
    fn test_build_episode_url_robustness() {
        let ext = AnimeJLExtractor::new();
        let series = "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7";
        assert_eq!(
            ext.build_episode_url(series, 12),
            "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7/episodio-12"
        );

        // Si se le pasa un episodio existente, reconstruye el solicitado
        let ep5 = "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7/episodio-5";
        assert_eq!(
            ext.build_episode_url(ep5, 20),
            "https://www.anime-jl.net/anime/1627/naruto-shippuuden-latino-v2-7/episodio-20"
        );
    }

    #[test]
    fn test_extract_episode_number() {
        let ext = AnimeJLExtractor::new();
        assert_eq!(
            ext.extract_episode_number("https://www.anime-jl.net/anime/1627/naruto/episodio-45"),
            Some(45)
        );
        assert_eq!(
            ext.extract_episode_number("https://www.anime-jl.net/anime/1627/naruto/capitulo-10"),
            Some(10)
        );
        assert_eq!(
            ext.extract_episode_number("https://www.anime-jl.net/anime/1627/naruto"),
            None
        );
    }

    #[test]
    fn test_genre_to_id_mapping() {
        assert_eq!(AnimeJLExtractor::genre_to_id("Acción"), Some("1"));
        assert_eq!(AnimeJLExtractor::genre_to_id("accion"), Some("1"));
        assert_eq!(AnimeJLExtractor::genre_to_id("comedia"), Some("9"));
        assert_eq!(AnimeJLExtractor::genre_to_id("ciencia-ficcion"), Some("33"));
    }
}
