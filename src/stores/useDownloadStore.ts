import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';
import {
  getAllDownloads,
  pauseDownload,
  resumeDownload,
  retryDownload,
  cancelDownload,
  deleteDownloadRecord,
  onDownloadProgress,
  onDownloadCompleted,
  onDownloadPaused,
  notifyServiceStart,
  notifyServiceUpdate,
  notifyServiceStop,
  formatSpeed,
  isActiveStatus,
} from '@/services/downloadService';

interface DownloadStore {
  tasks: Map<string, DownloadTask>;
  expandedFolders: Record<string, boolean>;
  initialized: boolean;

  init: () => Promise<void>;
  cleanup: () => void;

  addTask: (task: DownloadTask) => void;
  updateProgress: (progress: DownloadProgress) => void;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  removeTask: (id: string, deleteFile?: boolean) => Promise<void>;

  toggleFolder: (folderPath: string) => void;
  setFolderExpanded: (folderPath: string, isExpanded: boolean) => void;
  activeCount: () => number;
}

let unlistenProgress: (() => void) | null = null;
let unlistenCompleted: (() => void) | null = null;
let unlistenPaused: (() => void) | null = null;

let lastNotifyTime = 0;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;

function triggerNotificationSync() {
  const now = Date.now();
  if (now - lastNotifyTime >= 400) {
    lastNotifyTime = now;
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    syncNotification();
  } else if (!notifyTimer) {
    notifyTimer = setTimeout(() => {
      lastNotifyTime = Date.now();
      notifyTimer = null;
      syncNotification();
    }, 400);
  }
}

function syncNotification() {
  const tasks = Array.from(useDownloadStore.getState().tasks.values());
  const activeDownloading = tasks.filter((t) => t.status === 'downloading');
  const queued = tasks.filter((t) => t.status === 'queued');

  if (activeDownloading.length === 0 && queued.length === 0) {
    notifyServiceStop();
    return;
  }

  // 1. Título descriptivo según cantidad de descargas y animes
  let title = '';
  if (activeDownloading.length === 1 && queued.length === 0) {
    const single = activeDownloading[0];
    title = `${single.animeTitle} · Ep ${single.episodeNumber}`;
  } else if (activeDownloading.length === 1 && queued.length > 0) {
    const single = activeDownloading[0];
    title = `${single.animeTitle} · Ep ${single.episodeNumber} (+${queued.length} en cola)`;
  } else {
    title = `Descargando ${activeDownloading.length} episodios (${queued.length} en cola)`;
  }

  // 2. Progreso y velocidad combinada en tiempo real
  let totalBytesAll = 0;
  let downloadedBytesAll = 0;
  let totalSpeed = 0;
  let countWithBytes = 0;

  for (const t of activeDownloading) {
    totalSpeed += t.speedKbps ?? 0;
    if (t.totalBytes && t.totalBytes > 0) {
      totalBytesAll += t.totalBytes;
      downloadedBytesAll += t.downloadedBytes;
      countWithBytes++;
    }
  }

  let aggregateProgress = 0;
  if (countWithBytes > 0 && totalBytesAll > 0) {
    aggregateProgress = Math.min(
      100,
      Math.max(0, Math.round((downloadedBytesAll / totalBytesAll) * 100))
    );
  } else if (activeDownloading.length > 0) {
    const sumProgress = activeDownloading.reduce(
      (acc, t) => acc + (t.progress || 0),
      0
    );
    aggregateProgress = Math.round(sumProgress / activeDownloading.length);
  }

  const speedFormatted = formatSpeed(totalSpeed);
  const subtitle = `${aggregateProgress}% · ${speedFormatted}`;

  // 3. Desglose detallado al expandir la notificación en Android (BigTextStyle)
  const detailLines: string[] = [];
  for (const t of activeDownloading) {
    const p = Math.round(t.progress || 0);
    const sp =
      (t.speedKbps ?? 0) > 0 ? ` · ${formatSpeed(t.speedKbps ?? 0)}` : '';
    detailLines.push(`• ${t.animeTitle} Ep.${t.episodeNumber}: ${p}%${sp}`);
  }
  if (queued.length > 0) {
    const queuedNames = queued
      .slice(0, 2)
      .map((q) => `${q.animeTitle} Ep.${q.episodeNumber}`)
      .join(', ');
    const remaining = queued.length > 2 ? ` (+${queued.length - 2} más)` : '';
    detailLines.push(`• En cola: ${queuedNames}${remaining}`);
  }

  const details = detailLines.join('\n');
  notifyServiceUpdate(title, subtitle, aggregateProgress, details);
}

export const useDownloadStore = create<DownloadStore>((set, get) => ({
  tasks: new Map(),
  expandedFolders: {},
  initialized: false,

  activeCount: () => {
    let count = 0;
    for (const task of get().tasks.values()) {
      if (isActiveStatus(task.status)) count++;
    }
    return count;
  },

  init: async () => {
    if (get().initialized) return;

    try {
      // 1. Hidratar tareas guardadas desde SQLite
      const saved = await getAllDownloads();
      const taskMap = new Map<string, DownloadTask>();
      for (const t of saved) {
        taskMap.set(t.id, t);
      }
      set({ tasks: taskMap, initialized: true });
    } catch (e) {
      console.error('Error hydrating downloads from SQLite:', e);
      set({ initialized: true });
    }

    // 2. Escuchar progreso en tiempo real
    unlistenProgress = await onDownloadProgress((p) => {
      set((state) => {
        const next = new Map(state.tasks);
        const existing = next.get(p.id);
        if (existing) {
          next.set(p.id, {
            ...existing,
            progress: p.progress,
            speedKbps: p.speedKbps,
            downloadedBytes: p.downloadedBytes,
            totalBytes: p.totalBytes ?? existing.totalBytes,
            status: p.status,
            error: p.error,
          });
        }
        return { tasks: next };
      });

      // Sincronización inteligente de la notificación en Android
      if (p.status === 'downloading') {
        triggerNotificationSync();
      }
    });

    // 3. Escuchar completados
    unlistenCompleted = await onDownloadCompleted((res) => {
      set((state) => {
        const next = new Map(state.tasks);
        const existing = next.get(res.id);
        if (existing) {
          next.set(res.id, {
            ...existing,
            status: 'completed',
            progress: 100,
            speedKbps: 0,
            outputPath: res.path || existing.outputPath,
            error: undefined,
          });
        }
        return { tasks: next };
      });

      triggerNotificationSync();
    });

    // 4. Escuchar pausados
    unlistenPaused = await onDownloadPaused((res) => {
      set((state) => {
        const next = new Map(state.tasks);
        const existing = next.get(res.id);
        if (existing) {
          next.set(res.id, {
            ...existing,
            status: 'paused',
            speedKbps: 0,
          });
        }
        return { tasks: next };
      });

      triggerNotificationSync();
    });
  },

  cleanup: () => {
    unlistenProgress?.();
    unlistenCompleted?.();
    unlistenPaused?.();
    unlistenProgress = null;
    unlistenCompleted = null;
    unlistenPaused = null;
    if (notifyTimer) {
      clearTimeout(notifyTimer);
      notifyTimer = null;
    }
    set({ initialized: false });
  },

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

  addTask: (task) => {
    const wasEmpty = get().activeCount() === 0;
    set((state) => {
      const next = new Map(state.tasks);
      next.set(task.id, task);
      return { tasks: next };
    });

    if (wasEmpty) {
      notifyServiceStart(
        `${task.animeTitle} · Ep ${task.episodeNumber}`,
        'Iniciando descarga...'
      );
    } else {
      triggerNotificationSync();
    }
  },

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
          totalBytes: progress.totalBytes ?? existing.totalBytes,
          status: progress.status,
          error: progress.error,
        });
      }
      return { tasks: next };
    }),

  pauseTask: async (id) => {
    try {
      await pauseDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        const task = next.get(id);
        if (task) {
          next.set(id, { ...task, status: 'paused', speedKbps: 0 });
        }
        return { tasks: next };
      });
      triggerNotificationSync();
    } catch (e) {
      console.error('Error pausing download:', e);
    }
  },

  resumeTask: async (id) => {
    const task = get().tasks.get(id);
    if (get().activeCount() === 0 && task) {
      notifyServiceStart(
        `${task.animeTitle} · Ep ${task.episodeNumber}`,
        'Reanudando descarga...'
      );
    }
    try {
      await resumeDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        const t = next.get(id);
        if (t) {
          next.set(id, { ...t, status: 'queued', error: undefined });
        }
        return { tasks: next };
      });
      triggerNotificationSync();
    } catch (e) {
      console.error('Error resuming download:', e);
    }
  },

  retryTask: async (id) => {
    const task = get().tasks.get(id);
    if (get().activeCount() === 0 && task) {
      notifyServiceStart(
        `${task.animeTitle} · Ep ${task.episodeNumber}`,
        'Reintentando descarga...'
      );
    }
    try {
      await retryDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        const t = next.get(id);
        if (t) {
          next.set(id, {
            ...t,
            status: 'queued',
            progress: 0,
            downloadedBytes: 0,
            error: undefined,
          });
        }
        return { tasks: next };
      });
      triggerNotificationSync();
    } catch (e) {
      console.error('Error retrying download:', e);
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
      triggerNotificationSync();
    } catch (e) {
      console.error('Error canceling download:', e);
    }
  },

  removeTask: async (id, deleteFile = false) => {
    try {
      await deleteDownloadRecord(id, deleteFile);
      set((state) => {
        const next = new Map(state.tasks);
        next.delete(id);
        return { tasks: next };
      });
      triggerNotificationSync();
    } catch (e) {
      console.error('Error removing download task:', e);
    }
  },
}));
