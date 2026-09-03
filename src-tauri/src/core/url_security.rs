use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use url::Url;

use crate::core::{AppError, AppResult};

const DNS_CACHE_TTL: Duration = Duration::from_secs(60);

/// Entrada en la caché DNS con marca de tiempo e IPs validadas
#[derive(Debug, Clone)]
struct CacheEntry {
    timestamp: Instant,
    ips: Vec<IpAddr>,
}

/// Caché DNS thread-safe para mitigar sobrecarga en HLS y prevenir ataques de rebote
pub struct DnsCache {
    entries: RwLock<HashMap<String, CacheEntry>>,
    ttl: Duration,
}

impl DnsCache {
    pub fn new(ttl: Duration) -> Self {
        Self {
            entries: RwLock::new(HashMap::new()),
            ttl,
        }
    }

    /// Obtiene las IPs en caché si no han expirado
    pub fn get(&self, host: &str) -> Option<Vec<IpAddr>> {
        let read_guard = self.entries.read();
        if let Some(entry) = read_guard.get(host) {
            if entry.timestamp.elapsed() < self.ttl {
                return Some(entry.ips.clone());
            }
        }
        None
    }

    /// Almacena o actualiza las IPs resueltas
    pub fn insert(&self, host: String, ips: Vec<IpAddr>) {
        let mut write_guard = self.entries.write();
        write_guard.insert(
            host,
            CacheEntry {
                timestamp: Instant::now(),
                ips,
            },
        );
    }

    /// Limpia entradas expiradas
    pub fn prune(&self) {
        let mut write_guard = self.entries.write();
        write_guard.retain(|_, entry| entry.timestamp.elapsed() < self.ttl);
    }
}

pub static GLOBAL_DNS_CACHE: Lazy<Arc<DnsCache>> =
    Lazy::new(|| Arc::new(DnsCache::new(DNS_CACHE_TTL)));

/// Comprueba exhaustivamente si una dirección IP pertenece a rangos privados,
/// bucle local (loopback), enlace local (link-local), multidifusión o reservados.
pub fn is_ip_private_or_reserved(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(ipv4) => {
            // Loopback (127.0.0.0/8)
            if ipv4.is_loopback() {
                return true;
            }

            let octets = ipv4.octets();

            // Esta red (0.0.0.0/8)
            if octets[0] == 0 {
                return true;
            }

            // Redes privadas RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
            if octets[0] == 10
                || (octets[0] == 172 && (octets[1] >= 16 && octets[1] <= 31))
                || (octets[0] == 192 && octets[1] == 168)
            {
                return true;
            }

            // Link-local RFC 3927 (169.254.0.0/16)
            if octets[0] == 169 && octets[1] == 254 {
                return true;
            }

            // Carrier-grade NAT RFC 6598 (100.64.0.0/10)
            if octets[0] == 100 && (octets[1] >= 64 && octets[1] <= 127) {
                return true;
            }

            // IETF Protocol Assignments (192.0.0.0/24)
            if octets[0] == 192 && octets[1] == 0 && octets[2] == 0 {
                return true;
            }

            // Documentación RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24)
            if (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
                || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
                || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113)
            {
                return true;
            }

            // Benchmarking RFC 2544 (198.18.0.0/15)
            if octets[0] == 198 && (octets[1] == 18 || octets[1] == 19) {
                return true;
            }

            // Multicast (224.0.0.0/4)
            if ipv4.is_multicast() {
                return true;
            }

            // Reservado para uso futuro RFC 1112 (240.0.0.0/4) y Broadcast limitado (255.255.255.255)
            if octets[0] >= 240 {
                return true;
            }

            false
        }
        IpAddr::V6(ipv6) => {
            // Loopback (::1)
            if ipv6.is_loopback() {
                return true;
            }

            // No especificado (::)
            if ipv6.is_unspecified() {
                return true;
            }

            // Multicast (ff00::/8)
            if ipv6.is_multicast() {
                return true;
            }

            let segments = ipv6.segments();

            // IPv4-mapped IPv6 (::ffff:x.x.x.x)
            if let Some(v4) = ipv6.to_ipv4_mapped() {
                return is_ip_private_or_reserved(&IpAddr::V4(v4));
            }

            // Unique Local Address RFC 4193 (fc00::/7 -> fc00... y fd00...)
            if (segments[0] & 0xfe00) == 0xfc00 {
                return true;
            }

            // Link-Local RFC 4291 (fe80::/10)
            if (segments[0] & 0xffc0) == 0xfe80 {
                return true;
            }

            false
        }
    }
}

/// Valida si una URL es segura para descargar o consultar, empleando la caché DNS
/// para mitigar ataques de DNS Rebinding y SSRF sin penalizar fragmentos HLS.
pub async fn validate_url_cached(raw_url: &str) -> AppResult<Url> {
    let parsed = Url::parse(raw_url)
        .map_err(|e| AppError::Security(format!("URL inválida o malformada: {e}")))?;

    // 1. Validar esquema permitido
    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(AppError::Security(format!(
                "Esquema de URL no permitido: '{other}'. Solo se acepta http/https."
            )));
        }
    }

    let host_str = match parsed.host_str() {
        Some(h) => h,
        None => return Err(AppError::Security("URL sin host especificado".to_string())),
    };

    let port = parsed.port_or_known_default().unwrap_or(80);

    // 2. Comprobar excepción legítima: Servidor de medios local con token de sesión
    let local_media_port = crate::downloader::media_server::get_server_port();
    let local_media_token = crate::downloader::media_server::get_media_token();

    if (host_str == "127.0.0.1" || host_str == "localhost") && local_media_port > 0 && port == local_media_port {
        let provided_token = parsed
            .query_pairs()
            .find(|(k, _)| k == "token")
            .map(|(_, v)| v.to_string())
            .unwrap_or_default();

        if !local_media_token.is_empty() && crate::downloader::media_server::verify_token_constant_time(local_media_token.as_bytes(), provided_token.as_bytes()) {
            return Ok(parsed);
        } else {
            return Err(AppError::Security("Acceso a loopback bloqueado: token de sesión local inválido o ausente".to_string()));
        }
    }

    // 3. Si el host es directamente una IP, validarlo de inmediato sin DNS
    if let Ok(ip) = host_str.parse::<IpAddr>() {
        if is_ip_private_or_reserved(&ip) {
            return Err(AppError::Security(
                "Acceso denegado: La IP de destino pertenece a un rango privado o reservado".to_string(),
            ));
        }
        return Ok(parsed);
    }

    // 4. Si es un dominio, consultar caché o resolver
    let cache = &GLOBAL_DNS_CACHE;
    let ips = match cache.get(host_str) {
        Some(cached_ips) => cached_ips,
        None => {
            // Resolver DNS de forma asíncrona
            let addr_str = format!("{}:{}", host_str, port);
            let mut resolved = Vec::new();

            match tokio::net::lookup_host(&addr_str).await {
                Ok(addrs) => {
                    for addr in addrs {
                        let ip = addr.ip();
                        if is_ip_private_or_reserved(&ip) {
                            return Err(AppError::Security(
                                "Acceso denegado: El dominio resuelve a una IP de rango privado o reservado (Anti-SSRF/Rebinding)".to_string(),
                            ));
                        }
                        resolved.push(ip);
                    }
                }
                Err(e) => {
                    return Err(AppError::Security(format!(
                        "Error en resolución DNS para el host: {e}"
                    )));
                }
            }

            if resolved.is_empty() {
                return Err(AppError::Security(
                    "No se pudo resolver ninguna dirección IP para el host".to_string(),
                ));
            }

            cache.insert(host_str.to_string(), resolved.clone());
            resolved
        }
    };

    // Doble verificación: comprobar que ninguna de las IPs sea privada
    for ip in &ips {
        if is_ip_private_or_reserved(ip) {
            return Err(AppError::Security(
                "Acceso denegado: IP privada detectada en la caché de resolución".to_string(),
            ));
        }
    }

    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_private_and_reserved_ipv4() {
        let loopback: IpAddr = "127.0.0.1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&loopback));

        let priv_class_a: IpAddr = "10.0.1.2".parse().unwrap();
        assert!(is_ip_private_or_reserved(&priv_class_a));

        let priv_class_b: IpAddr = "172.20.0.1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&priv_class_b));

        let priv_class_c: IpAddr = "192.168.1.1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&priv_class_c));

        let link_local: IpAddr = "169.254.169.254".parse().unwrap();
        assert!(is_ip_private_or_reserved(&link_local));

        let public_dns: IpAddr = "8.8.8.8".parse().unwrap();
        assert!(!is_ip_private_or_reserved(&public_dns));

        let cloudflare_dns: IpAddr = "1.1.1.1".parse().unwrap();
        assert!(!is_ip_private_or_reserved(&cloudflare_dns));
    }

    #[test]
    fn test_private_and_reserved_ipv6() {
        let loopback_v6: IpAddr = "::1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&loopback_v6));

        let unspecified_v6: IpAddr = "::".parse().unwrap();
        assert!(is_ip_private_or_reserved(&unspecified_v6));

        let ula_v6: IpAddr = "fd12:3456:789a:1::1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&ula_v6));

        let link_local_v6: IpAddr = "fe80::1".parse().unwrap();
        assert!(is_ip_private_or_reserved(&link_local_v6));

        let google_dns_v6: IpAddr = "2001:4860:4860::8888".parse().unwrap();
        assert!(!is_ip_private_or_reserved(&google_dns_v6));
    }

    #[tokio::test]
    async fn test_url_schemes() {
        assert!(validate_url_cached("file:///etc/passwd").await.is_err());
        assert!(validate_url_cached("ftp://ftp.example.com").await.is_err());
        assert!(validate_url_cached("javascript:alert(1)").await.is_err());
        assert!(validate_url_cached("data:text/html,evil").await.is_err());
    }

    #[tokio::test]
    async fn test_blocked_private_ips() {
        assert!(validate_url_cached("http://127.0.0.1/admin").await.is_err());
        assert!(validate_url_cached("http://192.168.0.1/").await.is_err());
        assert!(validate_url_cached("http://10.0.0.1/").await.is_err());
        assert!(validate_url_cached("http://[::1]/").await.is_err());
    }

    #[test]
    fn test_dns_cache_ttl() {
        let cache = DnsCache::new(Duration::from_millis(50));
        let host = "test.local".to_string();
        let ips = vec!["1.1.1.1".parse().unwrap()];

        cache.insert(host.clone(), ips.clone());
        assert_eq!(cache.get(&host), Some(ips));

        std::thread::sleep(Duration::from_millis(70));
        assert_eq!(cache.get(&host), None);
    }
}
