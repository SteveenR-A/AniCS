use std::collections::HashMap;
use std::net::IpAddr;
use std::time::Duration;

use futures::future::join_all;
use parking_lot::Mutex;
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde::Serialize;
use tauri::State;
use tokio::net::UdpSocket;
use tokio::time::timeout;
use url::Url;

use crate::{downloader::media_server, AppState};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DlnaDevice {
    pub id: String,
    pub name: String,
    pub model: Option<String>,
    pub address: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DlnaPlaybackState {
    pub device_name: String,
    pub transport_state: String,
    pub position_seconds: f64,
    pub duration_seconds: f64,
}

#[derive(Clone, Debug)]
struct Renderer {
    device: DlnaDevice,
    av_transport: Url,
    rendering_control: Option<Url>,
}

#[derive(Default)]
pub struct DlnaManager {
    renderers: Mutex<HashMap<String, Renderer>>,
    active_device: Mutex<Option<String>>,
    active_local_token: Mutex<Option<String>>,
}

impl DlnaManager {
    pub fn new() -> Self {
        Self::default()
    }

    fn renderer(&self, id: &str) -> Result<Renderer, String> {
        self.renderers
            .lock()
            .get(id)
            .cloned()
            .ok_or_else(|| "La TV ya no está disponible; vuelve a buscar dispositivos.".to_string())
    }

    fn set_active(&self, id: &str, token: Option<String>) {
        *self.active_device.lock() = Some(id.to_string());
        *self.active_local_token.lock() = token;
    }

    fn clear_active(&self) -> Option<String> {
        self.active_device.lock().take();
        self.active_local_token.lock().take()
    }
}

#[tauri::command]
pub async fn discover_dlna_devices(state: State<'_, AppState>) -> Result<Vec<DlnaDevice>, String> {
    let locations = discover_locations().await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;
    let tasks = locations.into_iter().map(|location| {
        let client = client.clone();
        async move { describe_renderer(&client, &location).await }
    });
    let mut discovered = Vec::new();
    for result in join_all(tasks).await.into_iter().flatten() {
        discovered.push(result);
    }
    discovered.sort_by(|a, b| {
        a.device
            .name
            .to_lowercase()
            .cmp(&b.device.name.to_lowercase())
    });
    discovered.dedup_by(|a, b| a.device.id == b.device.id);
    if discovered.is_empty() {
        return Err("No se encontraron TVs DLNA en la red local. Comprueba que ambos dispositivos estén en la misma red Wi-Fi.".to_string());
    }
    let devices = discovered
        .iter()
        .map(|renderer| renderer.device.clone())
        .collect();
    let mut renderers = state.dlna.renderers.lock();
    renderers.clear();
    for renderer in discovered {
        renderers.insert(renderer.device.id.clone(), renderer);
    }
    Ok(devices)
}

#[tauri::command]
pub async fn cast_to_dlna_device(
    device_id: String,
    stream_url: String,
    local_file_path: Option<String>,
    title: String,
    media_type: String,
    start_position: f64,
    start_playing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let previous_device = state.dlna.active_device.lock().clone();
    let renderer = state.dlna.renderer(&device_id)?;
    let (media_url, token) =
        if let Some(path) = local_file_path.filter(|path| !path.trim().is_empty()) {
            let renderer_ip = renderer
                .av_transport
                .host_str()
                .and_then(|host| host.parse::<IpAddr>().ok())
                .ok_or_else(|| "No se pudo determinar la dirección de la TV.".to_string())?;
            let url = media_server::prepare_dlna_file(&path, renderer_ip).await?;
            let token = url.rsplit('/').nth(1).map(str::to_string);
            (url, token)
        } else {
            let parsed = Url::parse(&stream_url)
                .map_err(|_| "La URL del video no es válida.".to_string())?;
            if !matches!(parsed.scheme(), "http" | "https") {
                return Err("La TV solo puede recibir videos HTTP o HTTPS.".to_string());
            }
            (stream_url, None)
        };

    let content_type = match media_type.as_str() {
        "hls" => "application/vnd.apple.mpegurl",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    };
    let metadata = didl_metadata(&title, &media_url, content_type);
    let _ = soap_action(
        &renderer.av_transport,
        "AVTransport",
        "Stop",
        "<InstanceID>0</InstanceID>",
    )
    .await;
    soap_action(
        &renderer.av_transport,
        "AVTransport",
        "SetAVTransportURI",
        &format!("<InstanceID>0</InstanceID><CurrentURI>{}</CurrentURI><CurrentURIMetaData>{}</CurrentURIMetaData>", xml_escape(&media_url), xml_escape(&metadata)),
    ).await?;
    if start_playing {
        soap_action(
            &renderer.av_transport,
            "AVTransport",
            "Play",
            "<InstanceID>0</InstanceID><Speed>1</Speed>",
        )
        .await?;
    } else {
        let _ = soap_action(
            &renderer.av_transport,
            "AVTransport",
            "Pause",
            "<InstanceID>0</InstanceID>",
        )
        .await;
    }
    if start_position.is_finite() && start_position >= 1.0 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        let target = format_time(start_position);
        let _ = soap_action(
            &renderer.av_transport,
            "AVTransport",
            "Seek",
            &format!("<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>{target}</Target>"),
        )
        .await;
    }
    if let Some(previous_id) = previous_device.filter(|previous_id| previous_id != &device_id) {
        if let Ok(previous) = state.dlna.renderer(&previous_id) {
            let _ = soap_action(
                &previous.av_transport,
                "AVTransport",
                "Stop",
                "<InstanceID>0</InstanceID>",
            )
            .await;
        }
    }
    let old_token = state.dlna.clear_active();
    if let Some(token) = old_token {
        media_server::clear_dlna_file(&token);
    }
    state.dlna.set_active(&device_id, token);
    Ok(())
}

#[tauri::command]
pub async fn control_dlna_playback(
    action: String,
    position_seconds: Option<f64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let active_id = state
        .dlna
        .active_device
        .lock()
        .clone()
        .ok_or_else(|| "No hay una TV conectada.".to_string())?;
    let renderer = state.dlna.renderer(&active_id)?;
    match action.as_str() {
        "play" => {
            soap_action(
                &renderer.av_transport,
                "AVTransport",
                "Play",
                "<InstanceID>0</InstanceID><Speed>1</Speed>",
            )
            .await?;
        }
        "pause" => {
            soap_action(
                &renderer.av_transport,
                "AVTransport",
                "Pause",
                "<InstanceID>0</InstanceID>",
            )
            .await?;
        }
        "seek" => {
            let position = position_seconds
                .filter(|value| value.is_finite() && *value >= 0.0)
                .ok_or_else(|| "La posición solicitada no es válida.".to_string())?;
            soap_action(
                &renderer.av_transport,
                "AVTransport",
                "Seek",
                &format!(
                    "<InstanceID>0</InstanceID><Unit>REL_TIME</Unit><Target>{}</Target>",
                    format_time(position)
                ),
            )
            .await?;
        }
        "stop" => {
            soap_action(
                &renderer.av_transport,
                "AVTransport",
                "Stop",
                "<InstanceID>0</InstanceID>",
            )
            .await?;
            if let Some(token) = state.dlna.clear_active() {
                media_server::clear_dlna_file(&token);
            }
            return Ok(());
        }
        _ => return Err("Control de reproducción DLNA desconocido.".to_string()),
    }
    Ok(())
}

#[tauri::command]
pub async fn get_dlna_playback_state(
    state: State<'_, AppState>,
) -> Result<Option<DlnaPlaybackState>, String> {
    let Some(id) = state.dlna.active_device.lock().clone() else {
        return Ok(None);
    };
    let renderer = state.dlna.renderer(&id)?;
    let transport = soap_action(
        &renderer.av_transport,
        "AVTransport",
        "GetTransportInfo",
        "<InstanceID>0</InstanceID>",
    )
    .await?;
    let position = soap_action(
        &renderer.av_transport,
        "AVTransport",
        "GetPositionInfo",
        "<InstanceID>0</InstanceID>",
    )
    .await?;
    Ok(Some(DlnaPlaybackState {
        device_name: renderer.device.name,
        transport_state: xml_value(&transport, "CurrentTransportState")
            .unwrap_or_else(|| "UNKNOWN".to_string()),
        position_seconds: xml_value(&position, "RelTime")
            .as_deref()
            .and_then(parse_time)
            .unwrap_or(0.0),
        duration_seconds: xml_value(&position, "TrackDuration")
            .as_deref()
            .and_then(parse_time)
            .unwrap_or(0.0),
    }))
}

#[derive(Default)]
struct SsdpState {
    locations: Vec<String>,
}

async fn discover_locations() -> Result<Vec<String>, String> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| format!("No se pudo iniciar el descubrimiento DLNA: {e}"))?;
    let search = "M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n";
    socket
        .send_to(search.as_bytes(), "239.255.255.250:1900")
        .await
        .map_err(|e| format!("No se pudo buscar TVs DLNA: {e}"))?;
    let mut state = SsdpState::default();
    let mut buffer = [0u8; 8192];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }
        match timeout(remaining, socket.recv_from(&mut buffer)).await {
            Ok(Ok((length, _))) => {
                let response = String::from_utf8_lossy(&buffer[..length]);
                if let Some(location) = header_value(&response, "location") {
                    if is_private_device_url(&location) && !state.locations.contains(&location) {
                        state.locations.push(location);
                    }
                }
            }
            Ok(Err(_)) | Err(_) => break,
        }
        if state.locations.len() >= 24 {
            break;
        }
    }
    Ok(state.locations)
}

async fn describe_renderer(client: &reqwest::Client, location: &str) -> Option<Renderer> {
    let url = Url::parse(location).ok()?;
    let ip = url.host_str()?.parse::<IpAddr>().ok()?;
    if !is_private_ip(ip) {
        return None;
    }
    let xml = client
        .get(url.clone())
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .await
        .ok()?;
    if !xml.to_ascii_lowercase().contains("mediarenderer") {
        return None;
    }
    let av_transport = service_control_url(&xml, "AVTransport", &url)?;
    let rendering_control = service_control_url(&xml, "RenderingControl", &url);
    let name = xml_value(&xml, "friendlyName").unwrap_or_else(|| "Reproductor DLNA".to_string());
    let model = xml_value(&xml, "modelName");
    let device = DlnaDevice {
        id: location.to_string(),
        name,
        model,
        address: ip.to_string(),
    };
    let renderer = Renderer {
        device: device.clone(),
        av_transport,
        rendering_control,
    };
    Some(renderer)
}

fn service_control_url(xml: &str, service: &str, base: &Url) -> Option<Url> {
    let lower = xml.to_ascii_lowercase();
    let marker = format!("{service}:1").to_ascii_lowercase();
    let index = lower.find(&marker)?;
    let start = lower[..index].rfind("<service>")?;
    let end = lower[index..].find("</service>")? + index;
    let block = &xml[start..end + "</service>".len()];
    let control = xml_value(block, "controlURL")?;
    base.join(&control)
        .ok()
        .filter(|url| is_private_device_url(url.as_str()))
}

fn is_private_device_url(value: &str) -> bool {
    Url::parse(value)
        .ok()
        .and_then(|url| url.host_str().and_then(|host| host.parse::<IpAddr>().ok()))
        .is_some_and(is_private_ip)
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_link_local() || ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_unique_local() || ip.is_unicast_link_local() || ip.is_loopback(),
    }
}

fn header_value(response: &str, name: &str) -> Option<String> {
    response.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case(name)
            .then(|| value.trim().to_string())
    })
}

fn xml_value(xml: &str, tag: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let open = format!("<{tag}");
    let start = lower.find(&open)?;
    let content_start = lower[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let end = lower[content_start..].find(&close)? + content_start;
    Some(xml[content_start..end].trim().to_string())
}

fn didl_metadata(title: &str, url: &str, content_type: &str) -> String {
    format!(
        "<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>{}</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo=\"http-get:*:{}:*\">{}</res></item></DIDL-Lite>",
        xml_escape(title), content_type, xml_escape(url)
    )
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

async fn soap_action(
    url: &Url,
    service: &str,
    action: &str,
    arguments: &str,
) -> Result<String, String> {
    let service_type = format!("urn:schemas-upnp-org:service:{service}:1");
    let body = format!("<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:{action} xmlns:u=\"{service_type}\">{arguments}</u:{action}></s:Body></s:Envelope>");
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/xml; charset=\"utf-8\""),
    );
    headers.insert(
        "soapaction",
        HeaderValue::from_str(&format!("\"{service_type}#{action}\""))
            .map_err(|e| e.to_string())?,
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .post(url.clone())
        .headers(headers)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("No se pudo contactar la TV: {e}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(xml_value(&body, "errorDescription")
            .unwrap_or_else(|| format!("La TV rechazó {action} ({status}).")));
    }
    Ok(body)
}

fn format_time(seconds: f64) -> String {
    let whole = seconds.floor() as u64;
    format!(
        "{:02}:{:02}:{:02}",
        whole / 3600,
        (whole % 3600) / 60,
        whole % 60
    )
}

fn parse_time(value: &str) -> Option<f64> {
    let mut parts = value.split(':').map(str::parse::<f64>);
    Some(parts.next()?.ok()? * 3600.0 + parts.next()?.ok()? * 60.0 + parts.next()?.ok()?)
}

#[tauri::command]
pub async fn set_dlna_volume(volume: f64, state: State<'_, AppState>) -> Result<(), String> {
    let volume = volume.clamp(0.0, 1.0);
    let active_id = state
        .dlna
        .active_device
        .lock()
        .clone()
        .ok_or_else(|| "No hay una TV conectada.".to_string())?;
    let renderer = state.dlna.renderer(&active_id)?;
    let control = renderer
        .rendering_control
        .ok_or_else(|| "Esta TV no expone control de volumen DLNA.".to_string())?;
    let steps = (volume * 100.0).round() as u16;
    soap_action(&control, "RenderingControl", "SetVolume", &format!("<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>{steps}</DesiredVolume>")).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssdp_location_header_case_insensitively() {
        assert_eq!(
            header_value(
                "HTTP/1.1 200 OK\r\nLOCATION: http://192.168.1.5/device.xml\r\n",
                "location"
            )
            .as_deref(),
            Some("http://192.168.1.5/device.xml")
        );
    }

    #[test]
    fn accepts_lan_addresses_and_rejects_public_devices() {
        assert!(is_private_device_url("http://192.168.1.5:1400/device.xml"));
        assert!(!is_private_device_url("http://example.com/device.xml"));
        assert!(!is_private_device_url("http://8.8.8.8/device.xml"));
    }

    #[test]
    fn generates_escaped_didl_metadata_and_formats_position() {
        let didl = didl_metadata(
            "Show & Episode",
            "http://192.168.1.2/video?a=1&b=2",
            "video/mp4",
        );
        assert!(didl.contains("Show &amp; Episode"));
        assert!(didl.contains("a=1&amp;b=2"));
        assert_eq!(format_time(3661.9), "01:01:01");
        assert_eq!(parse_time("00:01:01").unwrap(), 61.0);
    }
}
