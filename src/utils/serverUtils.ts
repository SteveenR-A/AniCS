import type { VideoServer } from '@/types';
import { FEATURE_FLAGS } from '@/config/features';

/**
 * Dominios y protocolos no compatibles con reproducción nativa directa en el reproductor HTML5
 * (alojamientos que requieren interacción web, captchas externos o descargas manuales no directas).
 */
const UNSUPPORTED_DOMAINS = [
  'mega.nz',
  'mega.io',
  '1fichier.com',
  'rapidgator.net',
  'zippyshare.com',
  'torrent',
  'fembed',
  'movearnpre',
  'dhcplay',
];

/**
 * Detecta si un servidor es exclusivo para el nivel VIP de la presentación.
 */
export function isVipServer(nameOrUrl: string): boolean {
  if (!FEATURE_FLAGS.SHOW_SUBSCRIPTION) return false;
  return /magi|desu|dedicado|vip/i.test(nameOrUrl);
}

/**
 * Retorna la puntuación de compatibilidad y estabilidad del servidor para streaming.
 */
export function getServerPriority(server: VideoServer): number {
  const name = (server.name || '').toLowerCase();
  const url = (server.url || '').toLowerCase();

  // 1. VIP / Servidores dedicados principales (Magi, Desu)
  if (name.includes('magi')) return 100;
  if (name.includes('desu') && !name.includes('desuka')) return 95;

  // 2. Servidores HLS principales y streams directos
  if (name.includes('asura') || url.includes('redirector.php') || url.includes('.m3u8') || name.includes('m3u8')) return 90;
  if (name.includes('uqload') || url.includes('uqload')) return 88;
  if (name.includes('lulustream') || url.includes('luluvdo')) return 85;
  if (name.includes('mp4upload') || url.includes('mp4upload')) return 82;
  if (name.includes('mediafire') || url.includes('mediafire')) return 75;
  if (server.isDirect || url.endsWith('.mp4')) return 70;

  // 3. Otros servidores de streaming conocidos
  if (name.includes('voe') || url.includes('voe.sx')) return 65;
  if (name.includes('streamwish') || url.includes('streamwish') || url.includes('swish')) return 60;
  if (name.includes('filemoon') || url.includes('filemoon') || url.includes('fmoon') || url.includes('bysesukior')) return 50;
  if (name.includes('vidhide') || url.includes('vidhide')) return 30;

  return 10;
}

/**
 * Filtra servidores inestables/no soportados y aplica enmascaramiento profesional (Server Aliasing)
 * cuando FEATURE_FLAGS.MASK_SERVERS está activo, o devuelve el nombre real cuando está inactivo.
 */
export function maskAndFilterServers(servers: VideoServer[], forceMask?: boolean): VideoServer[] {
  if (!servers || !Array.isArray(servers)) return [];

  // 1. Filtrar servidores no soportados
  const supported = servers.filter((srv) => {
    if (!srv.url) return false;
    const lowerUrl = srv.url.toLowerCase();
    const lowerName = (srv.name || '').toLowerCase();

    // Descartar opciones de descarga externa no aptas para streaming
    if (lowerName.startsWith('descarga ') || lowerName === 'descarga') {
      return false;
    }

    // Descartar dominios no compatibles con el reproductor nativo
    const isUnsupported = UNSUPPORTED_DOMAINS.some(
      (domain) => lowerUrl.includes(domain) || lowerName.includes(domain)
    );

    return !isUnsupported;
  });

  // Ordenar por compatibilidad y estabilidad
  supported.sort((a, b) => getServerPriority(b) - getServerPriority(a));

  const shouldMask = forceMask ?? FEATURE_FLAGS.MASK_SERVERS;

  // Si no se requiere enmascarar, devolver el nombre real del servidor
  if (!shouldMask) {
    return supported.map((srv) => ({
      ...srv,
      name: srv.name?.trim() || 'Servidor Directo',
    }));
  }

  // 2. Enmascarar con nombres limpios y profesionales de infraestructura
  let cdnCounter = 1;

  return supported.map((srv) => {
    const rawName = (srv.name || '').toLowerCase();
    const rawUrl = (srv.url || '').toLowerCase();

    let maskedName = srv.name;

    if (rawName.includes('magi')) {
      maskedName = 'Servidor Dedicado VIP (1080p Ultra HD)';
    } else if (rawName.includes('desu')) {
      maskedName = 'Servidor Alta Velocidad (1080p)';
    } else if (rawName.includes('asura') || rawUrl.includes('redirector.php') || rawUrl.includes('.m3u8')) {
      maskedName = 'Servidor Principal HLS (1080p)';
    } else if (rawName.includes('mediafire')) {
      maskedName = 'Servidor Espejo (MP4 Directo)';
    } else if (rawName.includes('voe')) {
      maskedName = 'Servidor Rápido (720p HD)';
    } else if (rawName.includes('streamwish')) {
      maskedName = 'Servidor Alternativo CDN';
    } else if (rawName.includes('vidhide') || rawName.includes('filemoon') || rawName.includes('fmoon')) {
      maskedName = 'Servidor Respaldo CDN';
    } else if (rawName.includes('descarga') || rawName.includes('direct')) {
      maskedName = 'Servidor Descarga Directa (1080p)';
    } else {
      maskedName = `Servidor CDN ${cdnCounter++}`;
    }

    return {
      ...srv,
      name: maskedName,
    };
  });
}
