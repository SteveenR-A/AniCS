import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';
import { cancelDownload, pauseDownload, startDownload, deleteDownloadRecord, getAllDownloads } from '@/services/downloadService';

interface DownloadStore {
  tasks: Map<string, DownloadTask>;
  expandedFolders: Record<string, boolean>;
  loadDownloads: () => Promise<void>;
  addTask: (task: DownloadTask) => void;
  updateProgress: (progress: DownloadProgress) => void;
  removeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  toggleFolder: (folderPath: string) => void;
  setFolderExpanded: (folderPath: string, isExpanded: boolean) => void;
}

// Helper to notify Android Bridge if available
const notifyAndroidBridge = (title: string, progress: number, speed: number, isFinished: boolean) => {
  if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
    const bridge = (window as any).AndroidBridge;
    if (isFinished) {
      bridge.stopDownloadService();
    } else if (progress === 0 && speed === 0) {
      bridge.startDownloadService(title);
    } else {
      const speedText = speed > 0 ? `${(speed / 1024).toFixed(1)} MB/s` : '';
      bridge.updateDownloadNotification(title, Math.round(progress), speedText);
    }
  }
};

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: new Map(),

  loadDownloads: async () => {
    try {
      const dbTasks = await getAllDownloads();
      const map = new Map<string, DownloadTask>();
      dbTasks.forEach((t) => map.set(t.id, t));
      set({ tasks: map });
    } catch (e) {
      console.error('Error loading downloads', e);
    }
  },
  expandedFolders: {},

  toggleFolder: (folderPath) =>
    set((state) => ({
      expandedFolders: {
        ...state.expandedFolders,
        [folderPath]: !state.expandedFolders[folderPath],
      },
    })),

  setFolderExpanded: (folderPath, isExpanded) =>
    set((state) => ({
      expandedFolders: {
        ...state.expandedFolders,
        [folderPath]: isExpanded,
      },
    })),

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
        // Solo actualizar tareas que ya existen — nunca crear tareas nuevas desde eventos de progreso
        const updated = {
          ...existing,
          progress: progress.progress,
          speedKbps: progress.speedKbps,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes ?? existing.totalBytes,
          status: progress.status,
          error: progress.error,
        };
        next.set(progress.id, updated);

        // Notify Android bridge
        const isFinished = progress.status === 'completed' || progress.status === 'failed' || progress.status === 'canceled';
        const hasOtherActive = Array.from(next.values()).some(t => t.id !== progress.id && t.status === 'downloading');

        if (isFinished && !hasOtherActive) {
          notifyAndroidBridge('', 0, 0, true);
        } else if (!isFinished && progress.status === 'downloading') {
          notifyAndroidBridge(`${existing.animeTitle} - Ep. ${existing.episodeNumber}`, progress.progress, progress.speedKbps, false);
        }
      }
      // Si no existe la tarea, descartar silenciosamente (evita entradas fantasma por race condition)
      return { tasks: next };
    }),

  removeTask: async (id) => {
    try {
      await deleteDownloadRecord(id);
      set((state) => {
        const next = new Map(state.tasks);
        next.delete(id);
        return { tasks: next };
      });
    } catch(e) {
      console.error('Error removing task', e);
    }
  },

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

  pauseTask: async (id) => {
    try {
      await pauseDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        const task = next.get(id);
        if (task) {
          next.set(id, { ...task, status: 'paused' });
        }
        return { tasks: next };
      });
    } catch (e) {
      console.error('Error pausing download', e);
    }
  },

  resumeTask: async (id) => {
    try {
      const state = get();
      const task = state.tasks.get(id);
      if (task) {
        // Enviar evento a Android Bridge para abrir foreground
        notifyAndroidBridge(`${task.animeTitle} - Ep. ${task.episodeNumber}`, 0, 0, false);

        // Remove old task id, new one will be generated, but actually let's keep the same state or wait for new progress
        await startDownload({
          animeTitle: task.animeTitle,
          episodeNumber: task.episodeNumber,
          streamUrl: task.streamUrl,
          referer: task.referer,
        });

        set((state) => {
          const next = new Map(state.tasks);
          next.set(id, { ...task, status: 'queued' }); // It will get overwritten or updated by progress
          return { tasks: next };
        });
      }
    } catch (e) {
      console.error('Error resuming download', e);
    }
  },

  retryTask: async (id) => {
    try {
      const state = get();
      const task = state.tasks.get(id);
      if (task) {
        notifyAndroidBridge(`${task.animeTitle} - Ep. ${task.episodeNumber}`, 0, 0, false);
        await startDownload({
          animeTitle: task.animeTitle,
          episodeNumber: task.episodeNumber,
          streamUrl: task.streamUrl,
          referer: task.referer,
        });
        set((state) => {
          const next = new Map(state.tasks);
          next.set(id, { ...task, status: 'queued', error: undefined });
          return { tasks: next };
        });
      }
    } catch (e) {
      console.error('Error retrying download', e);
    }
  },
}));
