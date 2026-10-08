use base64::prelude::*;
use once_cell::sync::Lazy;
use regex::Regex;

use crate::error::{CoreError, CoreResult};
use crate::http::fetch_html_with_url;
use crate::models::{MediaType, ResolvedMedia};
use crate::unpacker::JsUnpacker;

static VOE_REDIR_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"window\.location\.href\s*=\s*['"](https?://[^'"]+)['"]"#).unwrap()
});

static HLS_SOURCE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)['"]hls['"]\s*:\s*['"](https?://[^'"]+)['"]"#).unwrap()
});

static MP4_SOURCE_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)['"]mp4['"]\s*:\s*['"](https?://[^'"]+)['"]"#).unwrap()
});

static SOURCES_OBJ_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?i)sources\s*=\s*\{\s*["']hls["']\s*:\s*["'](https?://[^'"]+)["']"#).unwrap()
});

static B64_PAYLOAD_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"atob\s*\(\s*['"]([A-Za-z0-9+/=]{20,})['"]\s*\)"#).unwrap()
});

static VOE_JSON_SCRIPT_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<script[^>]+type=["']application/json["'][^>]*>\s*\[\s*["']([^"']+)["']"#).unwrap()
});

fn rot13(s: &str) -> String {
    s.chars().map(|c| {
        match c {
            'a'..='m' | 'A'..='M' => (c as u8 + 13) as char,
            'n'..='z' | 'N'..='Z' => (c as u8 - 13) as char,
            _ => c,
        }
    }).collect()
}

pub fn decode_voe_json_payload(raw: &str) -> Option<String> {
    // 1. ROT13
    let rotated = rot13(raw);

    // 2. Pattern stripping: remove dummy pairs: @$, ^^, ~@, %?, *~, !!, #&
    let stripped = rotated
        .replace("@$", "")
        .replace("^^", "")
        .replace("~@", "")
        .replace("%?", "")
        .replace("*~", "")
        .replace("!!", "")
        .replace("#&", "");

    // 3. Base64 Decode
    let bytes1 = BASE64_STANDARD.decode(&stripped).ok()?;
    let str1 = String::from_utf8(bytes1).ok()?;

    // 4. Character Shifting: subtract 3 from each char code
    let shifted: String = str1.chars().map(|c| {
        char::from_u32((c as u32).saturating_sub(3)).unwrap_or(c)
    }).collect();

    // 5. String Reversal
    let reversed: String = shifted.chars().rev().collect();

    // 6. Final Base64 Decode
    let bytes2 = BASE64_STANDARD.decode(&reversed).ok()?;
    let json_text = String::from_utf8(bytes2).ok()?;

    // 7. Extract hls or direct_access_url or mp4 from JSON
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json_text) {
        if let Some(hls) = v.get("hls").and_then(|h| h.as_str()) {
            if JsUnpacker::is_video_url(hls) {
                return Some(hls.to_string());
            }
        }
        if let Some(url) = v.get("direct_access_url").and_then(|u| u.as_str()) {
            if JsUnpacker::is_video_url(url) {
                return Some(url.to_string());
            }
        }
        if let Some(mp4) = v.get("mp4").and_then(|m| m.as_str()) {
            if JsUnpacker::is_video_url(mp4) {
                return Some(mp4.to_string());
            }
        }
    }

    if let Some(cap) = HLS_SOURCE_RE.captures(&json_text) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    None
}

pub fn extract_stream(html: &str) -> Option<String> {
    // 0. Payload moderno en <script type="application/json">["..."]</script>
    if let Some(cap) = VOE_JSON_SCRIPT_RE.captures(html) {
        if let Some(stream) = decode_voe_json_payload(&cap[1]) {
            return Some(stream);
        }
    }

    // 1. Regex directa 'hls': '...'
    if let Some(cap) = HLS_SOURCE_RE.captures(html) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    // 2. sources = { 'hls': '...' }
    if let Some(cap) = SOURCES_OBJ_RE.captures(html) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    // 3. Regex directa 'mp4': '...'
    if let Some(cap) = MP4_SOURCE_RE.captures(html) {
        let stream = cap[1].replace('\\', "");
        if JsUnpacker::is_video_url(&stream) {
            return Some(stream);
        }
    }

    // 4. Búsqueda en bloques base64 (payloads ofuscados antiguos de VOE)
    for cap in B64_PAYLOAD_RE.captures_iter(html) {
        let b64_str = &cap[1];
        if let Ok(decoded_bytes) = BASE64_STANDARD.decode(b64_str) {
            if let Ok(decoded_text) = String::from_utf8(decoded_bytes) {
                if let Some(hls_cap) = HLS_SOURCE_RE.captures(&decoded_text) {
                    let stream = hls_cap[1].replace('\\', "");
                    if JsUnpacker::is_video_url(&stream) {
                        return Some(stream);
                    }
                }
                if let Some(stream) = JsUnpacker::extract_stream_url(&decoded_text) {
                    return Some(stream);
                }
            }
        }
    }

    // 5. Fallback con unpacker
    JsUnpacker::extract_stream_url(html)
}

pub async fn resolve(url: &str, referer: Option<&str>) -> CoreResult<ResolvedMedia> {
    let (mut html, mut effective_url) = fetch_html_with_url(url, referer.or(Some("https://voe.sx/")))
        .await
        .map_err(CoreError::Network)?;

    if html.is_empty() {
        return Err(CoreError::Resolver("Página de VOE vacía o no disponible".to_string()));
    }

    // Si VOE usa redirección de ventana JavaScript (seguir hasta 3 saltos)
    for _ in 0..3 {
        if let Some(cap) = VOE_REDIR_RE.captures(&html) {
            let redir_url = cap[1].to_string();
            if redir_url != effective_url {
                if let Ok((redir_html, final_url)) = fetch_html_with_url(&redir_url, Some(&effective_url)).await {
                    html = redir_html;
                    effective_url = final_url;
                    continue;
                }
            }
        }
        break;
    }

    if let Some(stream_url) = extract_stream(&html) {
        let media_type = if stream_url.contains(".m3u8") {
            MediaType::Hls
        } else {
            MediaType::Mp4
        };

        Ok(ResolvedMedia {
            direct_url: stream_url,
            media_type,
            referer: Some(effective_url),
            user_agent: None,
            qualities: vec![],
        })
    } else {
        Err(CoreError::Resolver("No se pudo extraer el enlace de video de VOE".to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_voe_hls() {
        let html = r#"const sources = {'hls': 'https://delivery-node-01.voe.sx/engine/hls2/master.m3u8'};"#;
        assert_eq!(
            extract_stream(html).as_deref(),
            Some("https://delivery-node-01.voe.sx/engine/hls2/master.m3u8")
        );
    }

    #[test]
    fn test_extract_voe_atob() {
        // base64 encoding of: {"hls":"https://node.voe.sx/hls/stream.m3u8"}
        let b64 = BASE64_STANDARD.encode(r#"{"hls":"https://node.voe.sx/hls/stream.m3u8"}"#);
        let html = format!(r#"var config = JSON.parse(atob("{}"));"#, b64);
        assert_eq!(
            extract_stream(&html).as_deref(),
            Some("https://node.voe.sx/hls/stream.m3u8")
        );
    }

    #[test]
    fn test_extract_voe_json_payload() {
        let payload = r#"CR1J#&MKyE%?pR94@$GIgp^^o3gX~@MJgE@$JzDm@$o0cy*~rHIo@$KU1M!!pTMi~@IKSZ@$BHkJ#&KKqW@$pTIc%?JHca@$p1Sk*~GUMZ%?EyO4@$ET1C*~r0kf^^Hzj3#&AJIm^^HKSz@$o102!!J3II*~AJMf~@rzkZ~@rmAU@$KKOH*~E2M3^^BSMF@$rSI9^^M3gp#&J1W6@$IQIo!!BQf0*~HQAz!!sIR3~@B0yD!!rxEg~@HJyI*~oyOY%?AT5L*~sIkM*~H3uq~@sSRm~@MxqF#&rmAg~@MK1W#&pR16%?na1D^^CRD2#&MaOh@$I1O7*~A1MD@$A0uK#&H3Aq%?IyA6!!qz5b%?oGt1!!MUuA^^sIqq!!GGAa^^ATL1*~MGI2~@sSSH#&EIqb*~JH1L!!HSOe%?JSu3^^GKSH~@KGkV#&M01q^^pS1E*~FGIa*~n3Ak@$IUt0@$I11h@$CUOy@$pSE9@$HGMH!!I1V1#&ESqF@$CSkj!!GKcR%?E1Rm%?FSqG#&o11J~@HKgL*~E1S8%?ISqD^^BTMK^^HQkD!!pH02#&BQAK@$AyIh#&JQL3*~JTH4#&FQAz^^qKZ2@$KRqa@$ASSZ*~CScE^^GyIV@$IaMe~@E1cq@$p3Sz@$rQtm!!M1MI*~E1yV#&r1ua*~FSIV@$IID0%?E2pl%?IRqz@$qmuf*~MJya%?pJqm^^HKSD%?Z0yo*~MGI3!!Fy1e~@CRMo^^A1OK*~HQqV*~sH9z~@FHqD%?rKcW*~KJf8@$FzI4^^MmMy#&owkT%?J284#&JzEk#&BScq%?rKcM~@MKyE!!pR9i^^IIga#&rH1o^^GmL8^^Fy14*~omIa#&oyx2#&MKME^^pR8m@$Mxcb#&qaZ2^^M3kL#&Ayj2#&FIgD^^oHyj@$nQyE@$oJI3#&MaOy^^p2f1!!KTgE~@Jx94#&IGIp!!q1N1^^KGD8%?Eyg5@$rz9F%?sHIY*~MmAe%?pRj5@$GRMy@$sSx2%?J31E^^J11g#&HIcp!!nIH2^^KT9A^^J2Eh^^GHMC^^o1SY@$MJgq%?pSWf^^IScq*~AwkX~@MKMW#&AIg9!!HIgq#&oISn^^KTyI~@Ayki!!GIgx!!ox1T~@G2kz#&oyqn@$KK1p^^EySk*~MayW!!JzE9^^MwEp%?Z0uo!!IagM@$FzE8!!M25a*~Gz9W#&IHIq#&o1Ek%?JHqE~@Hxyj^^M3SI@$pIu3@$q3OZ^^BHkT@$M31M%?Jzq7^^JKOz!!oUcJ%?JmkA~@Iy19*~JKOy%?n0Io@$KR5A~@oSWf%?JQIq^^n1x2*~KKuW*~FzIf~@rzkZ^^n3Aj#&GQyZ#&Iy1h@$CQIH*~BR1Y^^M3uM^^AzIg*~GKkb%?MKAg^^GU1M^^AI1e*~JGMq*~rRyX@$MJx8!!JzEh@$JIgp!!oUcf#&GUgE~@pHj5%?GSMq#&pHyn~@M3R4*~Jyk2^^CQEy!!p1In!!M2f8@$FJq2*~JIgp^^pSyX@$KJk6~@Iy19!!r1cp%?pUAg#&GUyi*~Fy00#&FGIo%?p1IY^^MGD0#&pRk2@$GSMz^^sH1f#&HzkL%?AI1e#&JGMq#&rRyX*~MJyE@$pJI5%?o0ca@$rxx1*~KTyI*~F2H0^^FKOq*~o1Ij#&GULm@$ASb5@$GUkz#&rQkn#&MQAS~@J1kg!!GHMC~@M3qi~@Hzk2*~AIke%?GHcy!!qxyj%?KJk6*~oRkY^^BT5M~@AIOj~@IU1A*~AzIe^^omID!!J1SX~@HKgi%?JTMi#&n3Oz!!F11k~@Iy1I~@JSEn@$GGAq%?ASEg~@I2gq~@Ay0m#&GIyy~@qGEK!!Makq~@oTH8%?FUSA*~AyE9!!HGqV@$I1A4*~HIgp!!pREU%?HQEZ*~I1A6!!HKSA!!BRuK%?HUuV#&E1W7#&Z1qx@$pQAU*~HR9m*~Ayk4@$q3Oy^^sQgL@$JxMa@$J1Sk!!CUOE*~qJMU%?JUch^^J1yT^^FHqK!!GRyM%?MKkA^^JScG!!IIgJ^^pS1n~@I2ga!!J1j5#&GJ5y~@CSuX^^KKx4#&pR0m~@Ma1E%?Z25g!!HKch!!I1Aj#&KHMD^^ryEU^^HKfm*~I11j#&JSqD@$ASEg@$HQAV!!I1V2~@FSqG*~sI1J*~JT9m!!AJE9^^p1ub^^qyR0!!IKES!!sJq4!!EGEq*~EJgn%?G1Z8^^FJMe!!omAa@$ARt2^^MIqa%?E1OS!!GGMJ#&sJ9o!!MGIW%?Jzqm%?M1cq!!CSD2!!HmqL^^AyO3@$BTkz!!o1H2^^Mzf0*~AH9z@$IIgq^^sKgj#&MwD4!!Ex94^^r3ko@$Ay1o#&MU1A~@E2q7#&AUOa@$qIIn%?KUy6*~FIW9@$FRqF!!rmgT*~J3gR@$sH9z#&GK1z!!qzf1^^G2MM!!pTIm~@M3Oy^^omkT!!J3p8*~AIk4*~JRca*~AQkj*~Maqz%?AzIh~@BScx@$AyIn#&M3y7~@AIk4@$IU1q*~A3gj!!nQMA#&I2qg@$M1gz#&r1On%?KQym#&AyO4@$AUkq#&rT9X%?MT1W~@AIk3!!A0cq%?oGE8%?KUSM^^Ax9z^^CRMo#&BIOY!!MwAI~@F2Ef~@pz1Z*~o1Sj!!MwD8*~AJMf*~rzkZ~@Z0Eo@$MKuh~@oJHm*~MygD%?AJ9U^^HT48~@JIWc@$HHqE@$AzMU!!HzyS%?E1O6@$KU1o*~FR19^^IISA*~ASOn*~GJkF%?oSuX!!MGAi#&Fzqf!!ryMq%?sKgn^^KUOm#&oHk8%?JHcq@$p3f1*~Mz80@$JzDm*~CSyq*~qx1n%?KU1i#&Fy1f@$rxMD#&rxEU!!HUcR@$E1N0!!pz1Z#&o3Ao#&MU08^^o2Mi!!KKOq^^AR1j#&GUMR#&E1W7!!pz1Z^^pyH2%?KKuM^^FzIc~@GIgq^^pS1n*~M2kA~@Ex9f#&JUOy*~rGuj*~GQyZ^^Ey1e#&CRcy!!o01Y#&MzyW@$Fzqe@$IIcp@$Z1yn@$MJk6!!oRk8^^n0cD%?BSkY%?HQy7^^Fzt0!!M0qb!!oUWg#&GT9I%?AJIg^^CSyq@$qz9j^^KJk6^^Iy19%?r1cp%?pUAg^^GUIE~@Jy1l#&HKOZ!!qyun#&M3kI@$pIWf%?oygp%?qxIk^^MaAW#&pRk2%?JQIz^^qxyj~@KGyZ@$Iy12*~IIgx!!Zmj0*~M3ye*~AJMf^^rzkZ!!pHIk^^MUuZ~@E1qc^^IKOz^^nmkj!!KQuA#&AzHm#&HGMo!!sTgX~@HQup@$F1N5#&r0cb%?ATqU~@nUy6%?JI1l%?HIcp@$oGkT^^J3p8~@AIk4@$A3Oz#&n1yX~@MKMW*~AIkm%?IIgx!!qwkX#&MzgE!!J118%?JHca^^rKb0^^G2Mm~@sJM6#&IHga*~px1f*~Hzk6!!JzEe#&BUOp@$q1yY*~MQAA~@Ex9f*~IRgx!!pJ9j#&Mapm*~AJHm%?IGMy*~oR1f^^Hzj3%?AJIm@$IIgx~@sGkX#&Mzx8@$AI15%?r3OZ!!qxkf*~GQyZ~@EzI8!!JGMo^^rJp1*~MKMA!!Ex9f@$GTkF#&oTcX#&M2gS@$Ayg5%?MmIy%?qx1T%?G29E!!F2Ie!!KKOF#&oSEn~@KKMA%?Jyk4!!JGIo~@rJp1^^MKMA@$Ex9i@$JKSz!!Z3Ag*~GUR4~@JzE8!!FHcx*~sH1T*~G2kZ~@pSL5*~HGEC%?Mapm#&GwEE@$FSL1~@ISgH~@AIk9%?HGMD#&oIuD#&p29K^^paZm%?HKkV~@FIW0#&FKSz^^BT5W#&JQMD^^JIH1*~naSK*~EKZ2%?IKOi^^AyM5%?JJ1b~@qx1i!!IHyA^^J1qh!!qmAq@$rKcW*~Iz5e#&oyy5!!GJkF~@oT5o#&KKIA!!sTt=@$"#;
        let decoded = decode_voe_json_payload(payload);
        println!("Decoded VOE payload: {:?}", decoded);
        assert!(decoded.is_some());
        let url = decoded.unwrap();
        assert!(url.contains(".m3u8") || url.contains(".mp4"));
    }
}
