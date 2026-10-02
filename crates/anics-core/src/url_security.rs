use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use url::Url;

use crate::error::{CoreError, CoreResult};

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

/// Valida si una URL remota es segura, empleando la caché DNS para mitigar
/// ataques de DNS Rebinding y SSRF.
pub async fn validate_remote_url(raw_url: &str) -> CoreResult<Url> {
    let parsed = Url::parse(raw_url)
        .map_err(|e| CoreError::Security(format!("URL inválida o malformada: {e}")))?;

    // 1. Validar esquema permitido
    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(CoreError::Security(format!(
                "Esquema de URL no permitido: '{other}'. Solo se acepta http/https."
            )));
        }
    }

    let host_str = match parsed.host_str() {
        Some(h) => h,
        None => return Err(CoreError::Security("URL sin host especificado".to_string())),
    };

    let port = parsed.port_or_known_default().unwrap_or(80);

    // 2. Si el host es directamente una IP, validarlo de inmediato sin DNS
    if let Ok(ip) = host_str.parse::<IpAddr>() {
        if is_ip_private_or_reserved(&ip) {
            return Err(CoreError::Security(
                "Acceso denegado: La IP de destino pertenece a un rango privado o reservado".to_string(),
            ));
        }
        return Ok(parsed);
    }

    // 3. Si es un dominio, consultar caché o resolver
    let cache = &GLOBAL_DNS_CACHE;
    let ips = match cache.get(host_str) {
        Some(cached_ips) => cached_ips,
        None => {
            let addr_str = format!("{}:{}", host_str, port);
            let mut resolved = Vec::new();

            match tokio::net::lookup_host(&addr_str).await {
                Ok(addrs) => {
                    for addr in addrs {
                        let ip = addr.ip();
                        if is_ip_private_or_reserved(&ip) {
                            return Err(CoreError::Security(
                                "Acceso denegado: El dominio resuelve a una IP de rango privado o reservado (Anti-SSRF/Rebinding)".to_string(),
                            ));
                        }
                        resolved.push(ip);
                    }
                }
                Err(e) => {
                    return Err(CoreError::Security(format!(
                        "Error en resolución DNS para el host: {e}"
                    )));
                }
            }

            if resolved.is_empty() {
                return Err(CoreError::Security(
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
            return Err(CoreError::Security(
                "Acceso denegado: IP privada detectada en la caché de resolución".to_string(),
            ));
        }
    }

    Ok(parsed)
}
