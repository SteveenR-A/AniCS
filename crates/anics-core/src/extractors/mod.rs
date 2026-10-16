pub mod filemoon;
pub mod generic;
pub mod jkplayer;
pub mod lulustream;
pub mod mediafire;
pub mod mp4upload;
pub mod streamwish;
pub mod uqload;
pub mod vidhide;
pub mod voe;

use crate::error::CoreResult;
use crate::models::{MediaType, ResolvedMedia, VideoServer};

fn direct_media_type(raw_url: &str) -> Option<MediaType> {
    let url = url::Url::parse(raw_url).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".m3u8") || path.ends_with(".ts") {
        Some(MediaType::Hls)
    } else if path.ends_with(".mp4") || path.ends_with(".mkv") {
        Some(MediaType::Mp4)
    } else if path.ends_with(".webm") {
        Some(MediaType::Unknown)
    } else {
        None
    }
}

fn direct_media(url: &str, referer: Option<&str>) -> Option<ResolvedMedia> {
    Some(ResolvedMedia {
        direct_url: url.to_string(),
        media_type: direct_media_type(url)?,
        referer: referer.map(str::to_string),
        user_agent: None,
        qualities: vec![],
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VideoHost {
    Direct,
    Mp4upload,
    Streamwish,
    Vidhide,
    Voe,
    Uqload,
    Lulustream,
    Filemoon,
    Mediafire,
    JkPlayer,
    Generic,
}

impl VideoHost {
    pub fn as_str(&self) -> &'static str {
        match self {
            VideoHost::Direct => "direct",
            VideoHost::Mp4upload => "mp4upload",
            VideoHost::Streamwish => "streamwish",
            VideoHost::Vidhide => "vidhide",
            VideoHost::Voe => "voe",
            VideoHost::Uqload => "uqload",
            VideoHost::Lulustream => "lulustream",
            VideoHost::Filemoon => "filemoon",
            VideoHost::Mediafire => "mediafire",
            VideoHost::JkPlayer => "jkplayer",
            VideoHost::Generic => "generic",
        }
    }
}

/// Detecta el alojamiento de video basándose en la URL o dominios asociados.
pub fn detect_host(url: &str) -> VideoHost {
    let parsed = match url::Url::parse(url) {
        Ok(parsed) if matches!(parsed.scheme(), "http" | "https") => parsed,
        _ => return VideoHost::Generic,
    };
    let lower = parsed.host_str().unwrap_or_default().to_ascii_lowercase();
    let path = parsed.path().to_ascii_lowercase();

    // 1. Enlace directo
    if direct_media_type(url).is_some() || path.ends_with("redirector.php") {
        return VideoHost::Direct;
    }

    // 2. Mediafire
    if lower == "mediafire.com" || lower.ends_with(".mediafire.com") {
        return VideoHost::Mediafire;
    }

    // 3. Mp4upload
    if lower == "mp4upload.com" || lower.ends_with(".mp4upload.com") {
        return VideoHost::Mp4upload;
    }

    // 4. JKAnime Embedded Player (Magi / Desu)
    if path.contains("/jkplayer")
        || path.contains("desu.php")
        || path.contains("/um/")
        || path.contains("/umv/")
        || path.contains("/c1.php")
        || path.contains("/c2.php")
    {
        return VideoHost::JkPlayer;
    }

    // 5. VOE
    if lower.contains("voe.sx")
        || lower.contains("voe-network.")
        || lower.contains("turing.voe.")
        || lower.contains("teresapoliticallearn.com")
        || lower.contains("audaciousdefaulthouse.com")
        || lower.contains("launchthefuture.com")
        || lower.contains("repackers.")
    {
        return VideoHost::Voe;
    }

    // 6. Uqload
    if lower.contains("uqload.") {
        return VideoHost::Uqload;
    }

    // 7. Streamwish y sus múltiples dominios espejos
    if lower.contains("streamwish.")
        || lower.contains("embedwish.")
        || lower.contains("sfastwish.")
        || lower.contains("awish.")
        || lower.contains("flaswish.")
        || lower.contains("mwish.")
        || lower.contains("wishembed.")
        || lower.contains("hlswish.")
        || lower.contains("swishsrv.")
        || lower.contains("eplayer.click")
        || lower.contains("strwish.")
    {
        return VideoHost::Streamwish;
    }

    // 8. Vidhide y sus espejos
    if lower.contains("vidhide.")
        || lower.contains("vidhidepro.")
        || lower.contains("vidhidepre.")
        || lower.contains("vidhidevip.")
        || lower.contains("filelions.")
    {
        return VideoHost::Vidhide;
    }

    // 9. Lulustream
    if lower.contains("lulustream.") || lower.contains("luluvdo.") {
        return VideoHost::Lulustream;
    }

    // 10. Filemoon
    if lower.contains("filemoon.") || lower.contains("bysekoze.") || lower.contains("bysesukior.") {
        return VideoHost::Filemoon;
    }

    VideoHost::Generic
}

/// Detecta el host utilizando tanto la URL como el nombre del servidor como pista.
pub fn detect_host_with_hint(url: &str, hint: Option<&str>) -> VideoHost {
    let host = detect_host(url);
    if host != VideoHost::Generic {
        return host;
    }
    if let Some(h) = hint {
        let lower = h.to_lowercase();
        if lower.contains("voe") {
            return VideoHost::Voe;
        }
        if lower.contains("mp4upload") {
            return VideoHost::Mp4upload;
        }
        if lower.contains("streamwish") || lower.contains("swish") {
            return VideoHost::Streamwish;
        }
        if lower.contains("vidhide") {
            return VideoHost::Vidhide;
        }
        if lower.contains("uqload") {
            return VideoHost::Uqload;
        }
        if lower.contains("lulustream") || lower.contains("lulu") {
            return VideoHost::Lulustream;
        }
        if lower.contains("filemoon") || lower.contains("fmoon") {
            return VideoHost::Filemoon;
        }
        if lower.contains("mediafire") {
            return VideoHost::Mediafire;
        }
        if lower.contains("magi") || lower.contains("desu") {
            return VideoHost::JkPlayer;
        }
    }
    host
}

/// Resuelve un VideoServer empleando el motor de extractores nativo en Rust.
pub async fn resolve_server(server: &VideoServer) -> CoreResult<ResolvedMedia> {
    if let Some(media) = direct_media(&server.url, server.referer.as_deref()) {
        return Ok(media);
    }

    let host = detect_host_with_hint(&server.url, Some(&server.name));
    match host {
        VideoHost::Direct => generic::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Mp4upload => mp4upload::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Streamwish => streamwish::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Vidhide => vidhide::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Voe => voe::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Uqload => uqload::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Lulustream => lulustream::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Filemoon => filemoon::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Mediafire => mediafire::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::JkPlayer => jkplayer::resolve(&server.url, server.referer.as_deref()).await,
        VideoHost::Generic => generic::resolve(&server.url, server.referer.as_deref()).await,
    }
}

/// Resuelve una URL arbitraria delegando en el extractor correspondiente.
pub async fn resolve_url(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    // Si ya es directo
    if let Some(media) = direct_media(url, referer) {
        return Ok(media);
    }

    let host = detect_host(url);
    match host {
        VideoHost::Direct => generic::resolve(url, referer).await,
        VideoHost::Mp4upload => mp4upload::resolve(url, referer).await,
        VideoHost::Streamwish => streamwish::resolve(url, referer).await,
        VideoHost::Vidhide => vidhide::resolve(url, referer).await,
        VideoHost::Voe => voe::resolve(url, referer).await,
        VideoHost::Uqload => uqload::resolve(url, referer).await,
        VideoHost::Lulustream => lulustream::resolve(url, referer).await,
        VideoHost::Filemoon => filemoon::resolve(url, referer).await,
        VideoHost::Mediafire => mediafire::resolve(url, referer).await,
        VideoHost::JkPlayer => jkplayer::resolve(url, referer).await,
        VideoHost::Generic => generic::resolve(url, referer).await,
    }
}

/// Lista de servidores con soporte nativo verificado.
pub fn supported_hosts() -> Vec<&'static str> {
    vec![
        "direct",
        "mp4upload",
        "streamwish",
        "vidhide",
        "voe",
        "uqload",
        "lulustream",
        "filemoon",
        "mediafire",
        "jkplayer",
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_detection_uses_the_path_instead_of_query_or_fragment() {
        for url in [
            "https://cdn.example.com/video.MP4?signature=abc#play",
            "https://cdn.example.com/video.mkv?token=abc",
            "https://cdn.example.com/master.M3U8?token=abc",
        ] {
            assert_eq!(detect_host(url), VideoHost::Direct);
        }
        for url in [
            "https://example.com/embed?next=video.m3u8",
            "https://example.com/embed#video.mp4",
            "https://example.com/video.m3u8/preview",
            "file:///video.mp4",
        ] {
            assert!(direct_media_type(url).is_none(), "{url}");
            assert_eq!(detect_host(url), VideoHost::Generic);
        }
    }

    #[test]
    fn known_hosts_take_precedence_over_display_names() {
        assert_eq!(detect_host_with_hint("https://filemoon.sx/e/123", Some("VOE")), VideoHost::Filemoon);
        assert_eq!(detect_host_with_hint("https://cdn.example.com/video.mp4?token=abc", Some("Mediafire")), VideoHost::Direct);
        assert_eq!(detect_host_with_hint("https://mirror.example.com/e/123", Some("Filemoon")), VideoHost::Filemoon);
        assert_eq!(detect_host("https://example.com/embed?next=https://voe.sx/e/123"), VideoHost::Generic);
        assert_eq!(detect_host("https://mediafire.com.example.com/embed"), VideoHost::Generic);
        assert_eq!(detect_host("https://bysesukior.com/e/123"), VideoHost::Filemoon);
    }

    #[tokio::test]
    async fn direct_resolvers_preserve_signed_urls_and_referers() {
        let referer = Some("https://example.com/episode");
        for (url, expected_type) in [
            ("https://cdn.example.com/video.MP4?signature=a%2Fb#play", MediaType::Mp4),
            ("https://cdn.example.com/video.mkv?token=abc", MediaType::Mp4),
            ("https://cdn.example.com/master.M3U8?token=abc", MediaType::Hls),
            ("https://cdn.example.com/video.TS?token=abc", MediaType::Hls),
            ("https://cdn.example.com/video.webm?token=abc", MediaType::Unknown),
        ] {
            let server = VideoServer {
                name: "Mediafire".to_string(),
                url: url.to_string(),
                is_direct: false,
                referer: referer.map(str::to_string),
            };
            for media in [
                resolve_server(&server).await.unwrap(),
                resolve_url(url, referer).await.unwrap(),
                generic::resolve(url, referer).await.unwrap(),
            ] {
                assert_eq!(media.direct_url, url);
                assert_eq!(media.referer.as_deref(), referer);
                assert_eq!(media.media_type, expected_type);
            }
        }
    }

    #[test]
    fn test_detect_all_hosts() {
        assert_eq!(detect_host("https://www.mp4upload.com/embed-123.html"), VideoHost::Mp4upload);
        assert_eq!(detect_host("https://embedwish.com/e/xyz"), VideoHost::Streamwish);
        assert_eq!(detect_host("https://sfastwish.com/e/abc"), VideoHost::Streamwish);
        assert_eq!(detect_host("https://vidhidepro.com/v/xyz"), VideoHost::Vidhide);
        assert_eq!(detect_host("https://voe.sx/e/xyz"), VideoHost::Voe);
        assert_eq!(detect_host("https://uqload.to/embed-xyz.html"), VideoHost::Uqload);
        assert_eq!(detect_host("https://luluvdo.com/e/xyz"), VideoHost::Lulustream);
        assert_eq!(detect_host("https://filemoon.sx/e/xyz"), VideoHost::Filemoon);
        assert_eq!(detect_host("https://www.mediafire.com/file/xyz/video.mp4/file"), VideoHost::Mediafire);
        assert_eq!(detect_host("https://jkanime.net/jkplayer/um.php?v=123"), VideoHost::JkPlayer);
        assert_eq!(detect_host("https://cdn.example.com/video.mp4"), VideoHost::Direct);
        assert_eq!(detect_host("https://cdn.example.com/stream.m3u8"), VideoHost::Direct);
    }
}
