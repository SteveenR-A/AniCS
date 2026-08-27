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
