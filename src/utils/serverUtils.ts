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
 * Función de compatibilidad: en la versión vanilla libre no existen servidores restringidos.
 */
export function isVipServer(_nameOrUrl: string): boolean {
  return false;
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
      maskedName = 'Servidor Dedicado (1080p Ultra HD)';
    } else if (rawName.includes('desu')) {
      maskedName = 'Servidor Alta Velocidad (1080p)';
    } else if (rawName.includes('vidhide')) {
      maskedName = 'Servidor Principal (1080p)';
    } else if (rawName.includes('streamwish')) {
      maskedName = 'Servidor Alta Velocidad (1080p)';
    } else if (rawName.includes('asura') || rawUrl.includes('redirector.php')) {
      maskedName = 'Servidor Espejo Web';
    } else if (rawName.includes('mediafire')) {
      maskedName = 'Servidor Espejo (MP4 Directo)';
    } else if (rawName.includes('voe')) {
      maskedName = 'Servidor Rápido (720p HD)';
    } else if (rawName.includes('gupload') || rawUrl.includes('gupload')) {
      maskedName = 'Servidor GUpload (1080p HD)';
    } else if (rawName.includes('fmoon') || rawName.includes('byse') || rawUrl.includes('byse')) {
      maskedName = 'Servidor Byse (720p HD)';
    } else if (rawName.includes('morencius') || rawUrl.includes('morencius')) {
      maskedName = 'Servidor Morencius (HD)';
    } else if (rawName.includes('dht') || rawUrl.includes('dhtpre')) {
      maskedName = 'Servidor DHT (HD)';
    } else if (rawName.includes('ok.ru') || rawUrl.includes('ok.ru')) {
      maskedName = 'Servidor Ok.ru (1080p HD)';
    } else if (rawName.includes('yourupload') || rawUrl.includes('yourupload')) {
      maskedName = 'Servidor YourUpload (720p)';
    } else if (rawName.includes('mp4upload') || rawUrl.includes('mp4upload')) {
      maskedName = 'Servidor MP4Upload (Directo HD)';
    } else {
      maskedName = `Servidor CDN ${cdnCounter++}`;
    }

    return {
      ...srv,
      name: maskedName,
    };
  });
}
