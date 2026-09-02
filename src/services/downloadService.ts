import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DownloadProgress, DownloadTask, DownloadStatus } from '@/types';

// ─── Puente Android Foreground Service ──────────────────────

function androidBridge() {
  return (window as Record<string, any>)['AndroidBridge'] as
    | {
        startDownloadService: (title: string, subtitle?: string, details?: string) => void;
        updateDownloadNotification: (
          title: string,
          subtitle: string,
          progress: number,
          details: string
        ) => void;
        stopDownloadService: () => void;
        notifyDownloadComplete: (title: string, episodeInfo: string) => void;
        showUpdateNotification: (title: string, body: string) => void;
        setKeepScreenOn: (enabled: boolean) => void;
        setFullscreenMode: (enabled: boolean) => void;
        setScreenOrientation: (orientation: string) => void;
        saveSecureToken: (key: string, token: string) => void;
        getSecureToken: (key: string) => string | null | undefined;
        deleteSecureToken: (key: string) => void;
      }
    | undefined;
}

export const setNativeFullscreen = (enabled: boolean): void => {
  try {
    androidBridge()?.setFullscreenMode(enabled);
  } catch (e) {
    console.warn('Error toggling Android native fullscreen:', e);
  }
};

export const setNativeScreenOrientation = (
  orientation: 'landscape' | 'portrait' | 'auto' | 'sensor' | 'unspecified'
): void => {
  try {
    androidBridge()?.setScreenOrientation(orientation);
  } catch (e) {
    console.warn('Error setting Android native screen orientation:', e);
  }
};

export const notifyServiceStart = (
  title: string,
  subtitle = 'Iniciando descargas...',
  details = ''
): void => {
  try {
    androidBridge()?.startDownloadService(title, subtitle, details);
  } catch (e) {
    console.warn('Error starting Android DownloadService:', e);
  }
};

export const notifyServiceUpdate = (
  title: string,
  subtitle: string,
  progress: number,
  details = ''
): void => {
  try {
    androidBridge()?.updateDownloadNotification(
      title,
      subtitle,
      Math.round(progress),
      details
    );
  } catch (e) {
    console.warn('Error updating Android DownloadService:', e);
  }
};

export const notifyServiceStop = (): void => {
  try {
    androidBridge()?.stopDownloadService();
  } catch (e) {
    console.warn('Error stopping Android DownloadService:', e);
  }
};

export const notifyDownloadComplete = (
  title: string,
  episodeInfo: string
): void => {
  try {
    androidBridge()?.notifyDownloadComplete(title, episodeInfo);
  } catch (e) {
    console.warn('Error notifying download complete:', e);
  }
};

export const showUpdateNotification = (
  title: string,
  body: string
): void => {
  try {
    androidBridge()?.showUpdateNotification(title, body);
  } catch (e) {
    console.warn('Error showing update notification:', e);
  }
};

export const setKeepScreenOn = (enabled: boolean): void => {
  try {
    androidBridge()?.setKeepScreenOn(enabled);
  } catch (e) {
    console.warn('Error setting keep screen on:', e);
  }
};

// ─── Comandos Tauri de Descarga ─────────────────────────────

/** Obtener todas las descargas registradas en SQLite */
export const getAllDownloads = (): Promise<DownloadTask[]> =>
  invoke('get_all_downloads');

/** Iniciar descarga de un episodio (HLS o directo MP4) */
export const startDownload = (params: {
  animeTitle: string;
  episodeNumber: number;
  streamUrl: string;
  referer?: string;
  outputDir?: string;
}): Promise<string> =>
  invoke('start_download', {
    animeTitle: params.animeTitle,
    episodeNumber: params.episodeNumber,
    streamUrl: params.streamUrl,
    referer: params.referer,
    outputDir: params.outputDir,
  });

/** Pausar una descarga activa limpiamente */
export const pauseDownload = (downloadId: string): Promise<void> =>
  invoke('pause_download', { downloadId });

/** Pausar todas las descargas activas en curso */
export const pauseAllDownloads = (): Promise<void> =>
  invoke('pause_all_downloads');

/** Reanudar una descarga pausada o interrumpida */
export const resumeDownload = (downloadId: string): Promise<void> =>
  invoke('resume_download', { downloadId });

/** Reiniciar una descarga fallida desde cero */
export const retryDownload = (downloadId: string): Promise<void> =>
  invoke('retry_download', { downloadId });

/** Cancelar una descarga en curso */
export const cancelDownload = (downloadId: string): Promise<void> =>
  invoke('cancel_download', { downloadId });

/** Eliminar el registro de descarga de SQLite y opcionalmente su archivo */
export const deleteDownloadRecord = (
  downloadId: string,
  deleteFile = false
): Promise<void> =>
  invoke('delete_download_record', { downloadId, deleteFile });

/** Suscribirse a eventos de progreso de descarga */
export const onDownloadProgress = (
  callback: (progress: DownloadProgress) => void
) => listen<DownloadProgress>('download-progress', (event) => callback(event.payload));

/** Suscribirse al evento de descarga completada */
export const onDownloadCompleted = (
  callback: (result: { id: string; path?: string }) => void
) => listen<{ id: string; path?: string }>('download-completed', (event) => callback(event.payload));

/** Suscribirse al evento de descarga pausada */
export const onDownloadPaused = (
  callback: (result: { id: string }) => void
) => listen<{ id: string }>('download-paused', (event) => callback(event.payload));

/** Formatea velocidad en texto legible */
export const formatSpeed = (kbps: number): string => {
  if (kbps <= 0) return '0 KB/s';
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  return `${Math.round(kbps)} KB/s`;
};

/** Devuelve si el estado es activo (en curso o en cola) */
export const isActiveStatus = (status: DownloadStatus): boolean =>
  status === 'queued' || status === 'downloading';

/** Obtener la carpeta de descargas por defecto */
export const getDefaultDownloadDir = (): Promise<string> =>
  invoke('get_default_download_dir');

/** Guardar la carpeta de descargas seleccionada */
export const setDownloadDir = (folderPath: string): Promise<void> =>
  invoke('set_download_dir', { folderPath });

/** Escanear carpeta de descargas buscando animes y episodios agrupados */
export const scanLocalDownloads = (folderPath?: string): Promise<import('@/types').LocalAnimeFolder[]> =>
  invoke('scan_local_downloads', { folderPath });

/** Eliminar un archivo de episodio descargado */
export const deleteLocalDownload = (filePath: string): Promise<void> =>
  invoke('delete_local_download', { filePath });

/** Eliminar una carpeta completa de anime descargado */
export const deleteLocalAnimeFolder = (folderPath: string): Promise<void> =>
  invoke('delete_local_anime_folder', { folderPath });

/** Obtener o guardar en caché local una imagen */
export const cacheImage = (url: string): Promise<string> =>
  invoke('cache_image', { url });

/** Precarga un lote de imágenes en paralelo en el backend y retorna un Record { [url]: dataUri } en RAM */
export const preloadImagesBatch = (urls: string[]): Promise<Record<string, string>> => {
  const filtered = urls.filter((u) => u && u.startsWith('http'));
  if (filtered.length === 0) return Promise.resolve({});
  return invoke<Record<string, string>>('preload_images_batch', { urls: filtered });
};

/**
 * Guarda la portada de un anime en el almacenamiento interno de la app (app_data_dir/covers).
 * Garantiza disponibilidad offline permanente sin contaminar la carpeta pública de descargas ni la galería en Android.
 * Retorna la ruta local interna del poster.
 */
export const saveLocalAnimeCover = (
  folderPathOrTitle: string,
  coverUrl: string,
  animeTitle?: string
): Promise<string> =>
  invoke('save_local_anime_cover', {
    folderPath: folderPathOrTitle.includes('/') || folderPathOrTitle.includes('\\') ? folderPathOrTitle : undefined,
    animeTitle: animeTitle || (!folderPathOrTitle.includes('/') && !folderPathOrTitle.includes('\\') ? folderPathOrTitle : undefined),
    coverUrl,
  });

/** Obtener estadísticas de uso de caché de imágenes */
export const getCacheStats = (): Promise<import('@/types').CacheStats> =>
  invoke('get_cache_stats');

/** Limpiar la caché de imágenes en disco */
export const clearImageCache = (): Promise<{ freedBytes: number; freedFormatted: string }> =>
  invoke('clear_image_cache');

/** Obtiene la URL de streaming local HTTP para reproducir un archivo descargado */
export const getLocalMediaUrl = (filePath: string): Promise<string> =>
  invoke('get_local_media_url', { filePath });
