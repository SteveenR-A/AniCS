use crate::core::VideoServer;

fn supported(server: &VideoServer) -> bool {
    let name = server.name.trim().to_lowercase();
    let url = server.url.to_lowercase();
    let unsupported = [
        "mega.nz",
        "mega.io",
        "1fichier.com",
        "rapidgator.net",
        "zippyshare.com",
        "torrent",
        "fembed",
        "movearnpre",
        "dhcplay",
        "mixdrop",
        "streamtape",
        "doodstream",
        "dooodster",
        "d-s.io",
        "bysesukior",
    ];
    !server.url.trim().is_empty()
        && name != "descarga"
        && !name.starts_with("descarga ")
        && !unsupported
            .iter()
            .any(|host| name.contains(host) || url.contains(host))
}

fn priority(server: &VideoServer) -> u32 {
    let name = server.name.to_lowercase();
    let url = server.url.to_lowercase();
    if name.contains("magi") {
        100
    } else if name.contains("desu") && !name.contains("desuka") {
        95
    } else if name.contains("mediafire") || url.contains("mediafire") {
        90
    } else if name.contains("mp4upload") || url.contains("mp4upload") {
        89
    } else if name.contains("vidhide") || url.contains("vidhide") {
        88
    } else if name.contains("asura")
        || url.contains("redirector.php")
        || url.contains(".m3u8")
        || name.contains("m3u8")
    {
        85
    } else if name.contains("streamwish")
        || url.contains("streamwish")
        || url.contains("embedwish")
        || url.contains("sfastwish")
    {
        84
    } else if name.contains("voe") || url.contains("voe") {
        83
    } else if name.contains("uqload") || url.contains("uqload") {
        82
    } else if name.contains("filemoon") || url.contains("filemoon") || url.contains("bysekoze") {
        81
    } else if name.contains("lulustream") || url.contains("luluvdo") {
        80
    } else if server.is_direct || url.ends_with(".mp4") {
        70
    } else {
        10
    }
}

/// Match by the original provider name, never by a per-episode URL or a UI alias.
pub fn candidates(
    servers: Vec<VideoServer>,
    preferred: Option<&str>,
    allow_fallback: bool,
) -> Result<Vec<VideoServer>, String> {
    let preferred = preferred
        .map(|name| name.trim().to_lowercase())
        .filter(|name| !name.is_empty());
    let mut servers: Vec<_> = servers.into_iter().filter(supported).collect();
    if !allow_fallback {
        if let Some(name) = &preferred {
            servers.retain(|server| server.name.trim().to_lowercase() == *name);
        }
    }
    servers.sort_by_key(|server| {
        (
            std::cmp::Reverse(
                preferred
                    .as_ref()
                    .is_some_and(|name| server.name.trim().to_lowercase() == *name),
            ),
            std::cmp::Reverse(priority(server)),
        )
    });
    if servers.is_empty() {
        return Err(if let Some(name) = preferred {
            format!("El servidor {name} no está disponible para este episodio")
        } else {
            "No hay servidores compatibles para este episodio".to_string()
        });
    }
    Ok(servers)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(name: &str, url: &str) -> VideoServer {
        VideoServer {
            name: name.to_string(),
            url: url.to_string(),
            is_direct: false,
            referer: None,
        }
    }
    #[test]
    fn automatic_excludes_unsupported_hosts_and_prioritizes_known_servers() {
        let ordered = candidates(
            vec![
                server("Mega", "https://mega.nz/file/1"),
                server("CDN", "https://cdn.test/file.mp4"),
                server("Magi", "https://cdn.test/episode.m3u8"),
            ],
            None,
            true,
        )
        .unwrap();
        assert_eq!(
            ordered.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
            vec!["Magi", "CDN"]
        );
    }
    #[test]
    fn selected_provider_is_first_even_with_a_different_episode_url() {
        let ordered = candidates(
            vec![
                server("Magi", "https://cdn.test/2.m3u8"),
                server("Mediafire", "https://mediafire.com/file/episode2"),
            ],
            Some("Mediafire"),
            true,
        )
        .unwrap();
        assert_eq!(ordered[0].name, "Mediafire");
        assert_eq!(ordered[1].name, "Magi");
    }
    #[test]
    fn strict_selection_reports_missing_provider_and_does_not_choose_another() {
        assert!(candidates(
            vec![server("Magi", "https://cdn.test/2.m3u8")],
            Some("Mediafire"),
            false
        )
        .is_err());
        let ordered = candidates(
            vec![
                server("Magi", "https://cdn.test/2.m3u8"),
                server("Mediafire", "https://mediafire.com/file/2"),
            ],
            Some("Mediafire"),
            false,
        )
        .unwrap();
        assert_eq!(ordered.len(), 1);
    }
}
