import { getAnalytics, isSupported, logEvent, type Analytics } from 'firebase/analytics';
import { firebaseApp } from './firebaseConfig';

let analyticsInstance: Analytics | null = null;
let isInitialized = false;

/**
 * Inicializa Firebase Analytics de forma segura y no bloqueante.
 * Solo se activa en entornos que soporten Web Analytics (IndexedDB / cookies).
 */
export async function initAnalytics(): Promise<Analytics | null> {
  if (isInitialized) return analyticsInstance;
  isInitialized = true;

  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(firebaseApp);
    }
  } catch (err) {
    // Analytics es opcional y no debe interrumpir el funcionamiento de la aplicación
    console.debug('[AniCS Analytics] No inicializado o entorno no soportado:', err);
  }

  return analyticsInstance;
}

// Inicialización diferida automática al cargar el módulo
if (typeof window !== 'undefined') {
  initAnalytics().catch(() => {});
}

/**
 * Registra un evento personalizado en Firebase Analytics si está disponible.
 */
export function logAnalyticsEvent(eventName: string, params?: Record<string, any>): void {
  if (!analyticsInstance) return;
  try {
    logEvent(analyticsInstance, eventName, params);
  } catch (error) {
    console.debug(`[AniCS Analytics] Error registrando evento "${eventName}":`, error);
  }
}

/**
 * Eventos específicos de AniCS
 */
export const AniCSAnalytics = {
  logLogin(method: 'google' | 'email') {
    logAnalyticsEvent('login', { method });
  },
  logSyncSuccess(platform: 'windows' | 'android' | 'web', itemsCount: { history: number; favorites: number }) {
    logAnalyticsEvent('cloud_sync_success', {
      platform,
      history_count: itemsCount.history,
      favorites_count: itemsCount.favorites,
    });
  },
  logSyncError(platform: 'windows' | 'android' | 'web', errorCode: string) {
    logAnalyticsEvent('cloud_sync_error', { platform, error_code: errorCode });
  },
  logAnimeWatch(animeTitle: string, episodeNumber: number, source: string) {
    logAnalyticsEvent('anime_episode_watch', {
      anime_title: animeTitle,
      episode_number: episodeNumber,
      source,
    });
  },
};
