import type { VideoServer } from '@/types';

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
];

/**
 * Detecta si un servidor es exclusivo para el nivel VIP de la presentación.
 */
export function isVipServer(nameOrUrl: string): boolean {
  return /magi|desu|dedicado|vip/i.test(nameOrUrl);
}

/**
 * Filtra servidores inestables/no soportados y aplica enmascaramiento profesional (Server Aliasing)
 * para presentar una arquitectura limpia de nodos de red y CDN sin exponer fuentes de terceros.
 */
export function maskAndFilterServers(servers: VideoServer[]): VideoServer[] {
  if (!servers || !Array.isArray(servers)) return [];

  // 1. Filtrar servidores no soportados
  const supported = servers.filter((srv) => {
    if (!srv.url) return false;
    const lowerUrl = srv.url.toLowerCase();
    const lowerName = (srv.name || '').toLowerCase();

    // Descartar dominios no compatibles con el reproductor nativo
    const isUnsupported = UNSUPPORTED_DOMAINS.some(
      (domain) => lowerUrl.includes(domain) || lowerName.includes(domain)
    );

    return !isUnsupported;
  });

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
    } else if (rawName.includes('vidhide') || rawName.includes('fmoon')) {
      maskedName = 'Servidor Respaldo CDN';
    } else {
      maskedName = `Servidor CDN ${cdnCounter++}`;
    }

    return {
      ...srv,
      name: maskedName,
    };
  });
}
