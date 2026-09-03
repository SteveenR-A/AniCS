import type Hls from 'hls.js';

/**
 * Reemplaza dominios de CDNs conocidos por estar caídos, inalcanzables o bloqueados
 * por espejos saludables y activos con el mismo contenido y ruta de segmentos.
 *
 * Ejemplo crítico: `cdn2.ducvomes.com` y `cdn5.ducvomes.com` (IP 130.78.217.218)
 * sufren timeouts continuos de 30s-2min, provocando que la reproducción se detenga
 * cada 3 segundos en servidores HLS populares (Magi / Desu de JKAnime).
 * `cdn1.ducvomes.com` y `cdn3.ducvomes.com` (IP 213.193.252.242) responden en ~50ms.
 */
export function rewriteDeadCdnUrl(input: string): string {
  if (!input) return input;
  return input
    .replace(/cdn2\.ducvomes\.com/g, 'cdn1.ducvomes.com')
    .replace(/cdn5\.ducvomes.com/g, 'cdn1.ducvomes.com');
}

/**
 * Crea una clase de cargador personalizado que hereda de Hls.DefaultConfig.loader
 * para interceptar tanto el manifiesto `.m3u8` (reescribiendo todas las URLs internas)
 * como las solicitudes de fragmentos `.ts`, con conmutación por error ante cualquier caída de CDN.
 */
export function createRobustHlsLoader(HlsClass: typeof Hls) {
  const BaseLoader = HlsClass.DefaultConfig.loader;

  return class RobustHlsLoader extends BaseLoader {
    private retryCdnIndex = 0;

    load(context: any, config: any, callbacks: any) {
      if (context && context.url) {
        context.url = rewriteDeadCdnUrl(context.url);
      }

      const origSuccess = callbacks.onSuccess;
      callbacks.onSuccess = (response: any, stats: any, ctx: any, networkDetails: any) => {
        // Si la respuesta es texto (ej. lista de reproducción .m3u8), sanitizar todas las URLs del manifiesto
        if (typeof response?.data === 'string') {
          response.data = rewriteDeadCdnUrl(response.data);
        }
        if (origSuccess) {
          origSuccess(response, stats, ctx, networkDetails);
        }
      };

      const origError = callbacks.onError;
      callbacks.onError = (error: any, ctx: any, networkDetails: any, stats: any) => {
        // Si un fragmento falla en un CDN de ducvomes, rotar a espejos conocidos antes de fallar
        if (ctx && ctx.url && ctx.url.includes('ducvomes.com') && this.retryCdnIndex < 3) {
          const healthyCdns = ['1', '3', '4', '6'];
          const match = ctx.url.match(/cdn(\d)\.ducvomes\.com/);
          const currentCdn = match ? match[1] : '1';
          const candidates = healthyCdns.filter(c => c !== currentCdn);
          const nextCdn = candidates[this.retryCdnIndex % candidates.length];
          this.retryCdnIndex++;

          ctx.url = ctx.url.replace(/cdn\d\.ducvomes\.com/, `cdn${nextCdn}.ducvomes.com`);
          console.warn(`[AniCS Stream] Fragmento fallido en CDN original. Reintentando de inmediato en cdn${nextCdn}.ducvomes.com...`);

          // Reintentar la carga con la nueva URL de CDN saludable
          return super.load(ctx, config, callbacks);
        }

        if (origError) {
          origError(error, ctx, networkDetails, stats);
        }
      };

      return super.load(context, config, callbacks);
    }
  };
}
