import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { DownloadProgress } from '@/types';

/** Iniciar descarga de un episodio HLS */
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

/** Cancelar una descarga en curso */
export const cancelDownload = (downloadId: string): Promise<void> =>
  invoke('cancel_download', { downloadId });

/** Suscribirse a eventos de progreso de descarga */
export const onDownloadProgress = (
  callback: (progress: DownloadProgress) => void
) => listen<DownloadProgress>('download-progress', (event) => callback(event.payload));

/** Suscribirse al evento de descarga completada */
export const onDownloadCompleted = (
  callback: (result: { id: string; path: string }) => void
) => listen<{ id: string; path: string }>('download-completed', (event) => callback(event.payload));

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
 * Copia la portada de un anime al directorio local de la serie como poster.jpg.
 * Garantiza disponibilidad offline sin depender del CDN.
 * Retorna la ruta local del poster o lanza un error si falla.
 */
export const saveLocalAnimeCover = (
  folderPath: string,
  coverUrl: string
): Promise<string> => invoke('save_local_anime_cover', { folderPath, coverUrl });

/** Obtener estadísticas de uso de caché de imágenes */
export const getCacheStats = (): Promise<import('@/types').CacheStats> =>
  invoke('get_cache_stats');

/** Limpiar la caché de imágenes en disco */
export const clearImageCache = (): Promise<{ freedBytes: number; freedFormatted: string }> =>
  invoke('clear_image_cache');

/** Obtiene la URL de streaming local HTTP para reproducir un archivo descargado */
export const getLocalMediaUrl = (filePath: string): Promise<string> =>
  invoke('get_local_media_url', { filePath });
