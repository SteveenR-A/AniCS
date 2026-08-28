import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';
import { cancelDownload } from '@/services/downloadService';

interface DownloadStore {
  tasks: Map<string, DownloadTask>;
  expandedFolders: Record<string, boolean>;
  addTask: (task: DownloadTask) => void;
  updateProgress: (progress: DownloadProgress) => void;
  removeTask: (id: string) => void;
  cancelTask: (id: string) => Promise<void>;
  toggleFolder: (folderPath: string) => void;
  setFolderExpanded: (folderPath: string, isExpanded: boolean) => void;
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: new Map(),
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
        next.set(progress.id, {
          ...existing,
          progress: progress.progress,
          speedKbps: progress.speedKbps,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes ?? existing.totalBytes,
          status: progress.status,
          error: progress.error,
        });
      }
      // Si no existe la tarea, descartar silenciosamente (evita entradas fantasma por race condition)
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
