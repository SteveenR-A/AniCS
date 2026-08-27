import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';

interface DownloadStore {
  tasks: Map<string, DownloadTask>;
  addTask: (task: DownloadTask) => void;
  updateProgress: (progress: DownloadProgress) => void;
  removeTask: (id: string) => void;
}

export const useDownloadStore = create<DownloadStore>((set) => ({
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
      }
      return { tasks: next };
    }),

  removeTask: (id) =>
    set((state) => {
      const next = new Map(state.tasks);
      next.delete(id);
      return { tasks: next };
    }),
}));
