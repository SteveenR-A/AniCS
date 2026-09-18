use once_cell::sync::Lazy;
use regex::Regex;

/// Algoritmo de desofuscación de scripts JavaScript tipo eval(function(p,a,c,k,e,d)...)
/// Conocido como "Dean Edwards Packer" o "P,A,C,K,E,R".
///
/// Muchos reproductores de anime embeben las URLs de video dentro de
/// scripts eval() ofuscados con codificación base-N. Este módulo los
/// decodifica en memoria sin necesidad de un motor JavaScript real.
pub struct JsUnpacker;

static PACKER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"eval\(function\(p,a,c,k,e,(?:r|d)\).*?return\s+p\}.*?\('(.*?)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split"#,
    )
    .expect("Invalid packer regex")
});

impl JsUnpacker {
    /// Devuelve true si el texto contiene un script ofuscado P,A,C,K,E,R.
    pub fn is_packed(script: &str) -> bool {
        script.contains("eval(function(p,a,c,k,e,")
    }

    /// Intenta desofuscar todos los bloques eval() en el HTML/script dado.
    /// Devuelve el primer bloque que se desofusca exitosamente.
    pub fn unpack(html_or_script: &str) -> Option<String> {
        for cap in PACKER_RE.captures_iter(html_or_script) {
            let p = cap.get(1)?.as_str();
            let a: u32 = cap.get(2)?.as_str().parse().ok()?;
            let c: u32 = cap.get(3)?.as_str().parse().ok()?;
            let k_raw = cap.get(4)?.as_str();
            let k: Vec<&str> = k_raw.split('|').collect();

            if let Some(result) = Self::unpack_inner(p, a, c, &k) {
                return Some(result);
            }
        }
        None
    }

    fn unpack_inner(p: &str, a: u32, c: u32, k: &[&str]) -> Option<String> {
        let mut result = p.to_string();

        for i in (0..c).rev() {
            let key = k.get(i as usize).copied().unwrap_or("");
            if key.is_empty() {
                continue;
            }
            let encoded = Self::encode_base(i, a);
            // Reemplazar la palabra completa "\bencode\b" por key
            let pattern = format!(r"\b{}\b", regex::escape(&encoded));
            if let Ok(re) = Regex::new(&pattern) {
                result = re.replace_all(&result, key).to_string();
            }
        }
        Some(result)
    }

    /// Convierte un número a su representación en base `a`.
    pub fn encode_base(c: u32, a: u32) -> String {
        if a == 0 {
            return c.to_string();
        }
        if c < a {
            Self::encode_char(c)
        } else {
            Self::encode_base(c / a, a) + &Self::encode_char(c % a)
        }
    }

    /// Convierte un dígito a su representación en base-62.
    pub fn encode_char(c: u32) -> String {
        if c > 35 {
            // Letras mayúsculas del rango extendido (Base62)
            char::from_u32(c + 29).map(|ch| ch.to_string()).unwrap_or_else(|| c.to_string())
        } else {
            const CHARS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
            (CHARS[c as usize] as char).to_string()
        }
    }

    /// Extrae la primera URL de stream (.m3u8 o .mp4) de texto posiblemente ofuscado.
    pub fn extract_stream_url(html: &str) -> Option<String> {
        // 1. Intentar desofuscar si está empaquetado
        let text = if Self::is_packed(html) {
            Self::unpack(html).unwrap_or_else(|| html.to_string())
        } else {
            html.to_string()
        };

        fn is_discarded_url(u: &str) -> bool {
            let lower = u.to_lowercase();
            // Ignorar scripts, estilos, imágenes y fuentes
            if lower.ends_with(".js")
                || lower.ends_with(".css")
                || lower.ends_with(".png")
                || lower.ends_with(".jpg")
                || lower.ends_with(".jpeg")
                || lower.ends_with(".gif")
                || lower.ends_with(".svg")
                || lower.ends_with(".ico")
                || lower.ends_with(".webp")
                || lower.ends_with(".html")
                || lower.ends_with(".php")
                || lower.ends_with(".json")
                || lower.ends_with(".xml")
            {
                return true;
            }
            // Ignorar analíticas y rastreadores
            if lower.contains("cloudflareinsights")
                || lower.contains("googletagmanager")
                || lower.contains("google-analytics")
                || lower.contains("doubleclick")
                || lower.contains("ads-twitter")
                || lower.contains("facebook")
                || lower.contains("yandex")
                || lower.contains("beacon")
                || lower.contains("test-videos.co.uk")
            {
                return true;
            }
            false
        }

        // 2. Buscar .m3u8 (HLS directo o maestro)
        static M3U8_RE: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r#"(https?://[^\s"'\\<>]+\.m3u8[^\s"'\\<>]*)"#).unwrap()
        });
        for m in M3U8_RE.find_iter(&text) {
            let u = m.as_str().replace('\\', "");
            if !is_discarded_url(&u) {
                return Some(u);
            }
        }

        // 3. Buscar .mp4 directo
        static MP4_RE: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r#"(https?://[^\s"'\\<>]+\.mp4[^\s"'\\<>]*)"#).unwrap()
        });
        for m in MP4_RE.find_iter(&text) {
            let u = m.as_str().replace('\\', "");
            if !is_discarded_url(&u) {
                return Some(u);
            }
        }

        // 4. Buscar asignaciones explícitas file: "url" o source: "url"
        static FILE_RE: Lazy<Regex> = Lazy::new(|| {
            Regex::new(r#"(?:file|source|src)\s*[:=]\s*["'](https?://[^"']+)["']"#).unwrap()
        });
        for cap in FILE_RE.captures_iter(&text) {
            let u = cap[1].replace('\\', "");
            if !is_discarded_url(&u) {
                let lower = u.to_lowercase();
                if lower.contains(".m3u8")
                    || lower.contains(".mp4")
                    || lower.contains(".mkv")
                    || lower.contains("hls")
                    || lower.contains("/stream")
                    || lower.contains("master")
                {
                    return Some(u);
                }
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_base() {
        assert_eq!(JsUnpacker::encode_base(0, 62), "0");
        assert_eq!(JsUnpacker::encode_base(10, 62), "a");
        assert_eq!(JsUnpacker::encode_base(35, 62), "z");
        assert_eq!(JsUnpacker::encode_base(36, 62), "A"); // base-62 extended
    }

    #[test]
    fn test_is_packed() {
        assert!(JsUnpacker::is_packed("eval(function(p,a,c,k,e,d){"));
        assert!(!JsUnpacker::is_packed("normal javascript code"));
    }

    #[test]
    fn test_extract_m3u8_direct() {
        let html = r#"var url = "https://cdn.example.com/stream/video.m3u8?token=abc";"#;
        let result = JsUnpacker::extract_stream_url(html);
        assert!(result.is_some());
        assert!(result.unwrap().contains(".m3u8"));
    }
}
