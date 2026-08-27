import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';
import { cancelDownload } from '@/services/downloadService';

interface DownloadStore {
  tasks: Map<string, DownloadTask>;
  addTask: (task: DownloadTask) => void;
  updateProgress: (progress: DownloadProgress) => void;
  removeTask: (id: string) => void;
  cancelTask: (id: string) => Promise<void>;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: new Map(),

  addTask: (task) =>
    set((state) => {
      const next = new Map(state.tasks);
      next.set(task.id, task);
      return { tasks: next };
    }),

  updateProgress: (progress) =>
    set((state) => {
      const next = new Map(state.tasks);
      const existing = next.get(progress.id);
      if (existing) {
        next.set(progress.id, {
          ...existing,
          progress: progress.progress,
          speedKbps: progress.speedKbps,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          status: progress.status,
          error: progress.error,
        });
      } else {
        // Si no existe, crear la tarea con los datos del progreso
        next.set(progress.id, {
          id: progress.id,
          animeTitle: `Episodio`,
          episodeNumber: 1,
          streamUrl: '',
          outputPath: '',
          progress: progress.progress,
          speedKbps: progress.speedKbps,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          status: progress.status,
          error: progress.error,
        });
      }
      return { tasks: next };
    }),

  removeTask: (id) =>
    set((state) => {
      const next = new Map(state.tasks);
      next.delete(id);
      return { tasks: next };
    }),

  cancelTask: async (id) => {
    try {
      await cancelDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        const task = next.get(id);
        if (task) {
          next.set(id, { ...task, status: 'canceled' });
        }
        return { tasks: next };
      });
    } catch (e) {
      console.error('Error canceling download', e);
    }
  },
}));
