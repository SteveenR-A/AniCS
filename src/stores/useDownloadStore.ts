import { create } from 'zustand';
import type { DownloadTask, DownloadProgress } from '@/types';
import { orderDownloadTasks } from '@/utils/downloadQueue';
import {
  getAllDownloads,
  pauseDownload,
  resumeDownload,
  retryDownload,
  cancelDownload,
  deleteDownloadRecord,
  onDownloadProgress,
  onDownloadCreated,
  onDownloadCompleted,
  onDownloadPaused,
  notifyServiceStart,
  notifyServiceUpdate,
  notifyServiceStop,
  notifyDownloadComplete,
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
  clearCompletedTasks: () => Promise<void>;

  toggleFolder: (folderPath: string) => void;
  setFolderExpanded: (folderPath: string, isExpanded: boolean) => void;
  activeCount: () => number;
  syncWithDb: () => Promise<void>;
}

let unlistenProgress: (() => void) | null = null;
let unlistenCreated: (() => void) | null = null;
let unlistenCompleted: (() => void) | null = null;
let unlistenPaused: (() => void) | null = null;

let lastNotifyTime = 0;
let notifyTimer: ReturnType<typeof setTimeout> | null = null;
const pendingProgress = new Map<string, DownloadProgress>();
let listenerGeneration = 0;
let handleVisibilityOrFocus: (() => void) | null = null;

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

  syncWithDb: async () => {
    const generation = listenerGeneration;
    const initialTasks = get().tasks;
    try {
      const saved = await getAllDownloads();
      if (generation !== listenerGeneration) return;
      set((state) => {
        const next = new Map(state.tasks);
        for (const t of saved) {
          // A snapshot fetched before a local deletion must not resurrect it.
          if (initialTasks.has(t.id) && !next.has(t.id)) continue;
          const existing = next.get(t.id);
          if (existing) {
            next.set(t.id, {
              ...(existing === initialTasks.get(t.id) ? { ...existing, ...t } : { ...t, ...existing }),
              outputPath: t.outputPath || existing.outputPath,
            });
          } else {
            const pending = pendingProgress.get(t.id);
            next.set(t.id, pending ? { ...t, ...pending } : t);
          }
          pendingProgress.delete(t.id);
        }
        return { tasks: orderDownloadTasks(next) };
      });
      triggerNotificationSync();
    } catch (e) {
      console.error('Error syncing downloads with SQLite:', e);
    }
  },

  init: async () => {
    if (get().initialized) return;
    const generation = ++listenerGeneration;
    const initialTasks = get().tasks;
    set({ initialized: true });

    try {
      // Subscribe before hydrating: new backend tasks must enter the store before
      // their progress arrives, including while a batch is being registered.
      const stopCreated = await onDownloadCreated(task => {
        if (generation !== listenerGeneration) return;
        set(state => {
          const next = new Map(state.tasks);
          const pending = pendingProgress.get(task.id);
          const existing = next.get(task.id);
          next.set(task.id, { ...existing, ...task, ...(pending ?? {}) });
          pendingProgress.delete(task.id);
          return { tasks: orderDownloadTasks(next) };
        });
        triggerNotificationSync();
      });

      if (generation !== listenerGeneration) { stopCreated(); return; }
      unlistenCreated = stopCreated;

      // 2. Escuchar progreso en tiempo real
      const stopProgress = await onDownloadProgress((p) => {
        if (generation !== listenerGeneration) return;
        if (!get().tasks.has(p.id)) {
          pendingProgress.set(p.id, p);
          void get().syncWithDb();
          return;
        }
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
        triggerNotificationSync();
      });

      if (generation !== listenerGeneration) { stopProgress(); return; }
      unlistenProgress = stopProgress;

      // 3. Escuchar completados
      const stopCompleted = await onDownloadCompleted((res) => {
        if (generation !== listenerGeneration) return;
        let completedTask: DownloadTask | undefined;
        set((state) => {
          const next = new Map(state.tasks);
          const existing = next.get(res.id);
          if (existing) {
            completedTask = {
              ...existing,
              status: 'completed',
              progress: 100,
              speedKbps: 0,
              outputPath: res.path || existing.outputPath,
              error: undefined,
            };
            next.set(res.id, completedTask);
          }
          return { tasks: next };
        });

        if (completedTask) {
          notifyDownloadComplete(
            (completedTask as DownloadTask).animeTitle,
            `Episodio ${(completedTask as DownloadTask).episodeNumber}`
          );

          (async () => {
            try {
              const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');
              if (await isPermissionGranted()) {
                sendNotification({
                  title: 'Descarga completada',
                  body: `${(completedTask as DownloadTask).animeTitle} - Ep. ${(completedTask as DownloadTask).episodeNumber}`,
                });
              }
            } catch {}
          })();
        }

        triggerNotificationSync();
      });

      if (generation !== listenerGeneration) { stopCompleted(); return; }
      unlistenCompleted = stopCompleted;

      // 4. Escuchar pausados
      const stopPaused = await onDownloadPaused((res) => {
        if (generation !== listenerGeneration) return;
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

      if (generation !== listenerGeneration) { stopPaused(); return; }
      unlistenPaused = stopPaused;

      // Hydrate after registering all listeners. Live events take precedence over
      // a snapshot fetched while a worker was changing state.
      try {
        const saved = await getAllDownloads();
        if (generation !== listenerGeneration) return;
        set(state => {
          const taskMap = new Map(saved.map(task => [task.id, task]));
          for (const [id, task] of state.tasks) {
            if (task !== initialTasks.get(id)) taskMap.set(id, task);
          }
          for (const id of initialTasks.keys()) {
            if (!state.tasks.has(id)) taskMap.delete(id);
          }
          return { tasks: orderDownloadTasks(taskMap) };
        });
      } catch (e) {
        console.error('Error hydrating downloads from SQLite:', e);
      }

      if (generation !== listenerGeneration) return;
      if (typeof window !== 'undefined') {
        handleVisibilityOrFocus = () => {
          if (document.visibilityState === 'visible') {
            get().syncWithDb();
          }
        };
        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
      }
      if (get().activeCount() > 0) {
        triggerNotificationSync();
      }
    } catch (e) {
      if (generation !== listenerGeneration) return;
      // Release partially registered listeners and allow a later init retry.
      get().cleanup();
      console.error('Error initializing download listeners:', e);
    }
  },

  cleanup: () => {
    listenerGeneration++;
    if (handleVisibilityOrFocus) {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      handleVisibilityOrFocus = null;
    }
    unlistenCreated?.();
    unlistenProgress?.();
    unlistenCompleted?.();
    unlistenPaused?.();
    unlistenProgress = null;
    unlistenCreated = null;
    pendingProgress.clear();
    lastNotifyTime = 0;
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
      // The caller's placeholder must not overwrite a backend event that has
      // already provided the real status and FIFO position.
      next.set(task.id, { ...task, ...next.get(task.id) });
      return { tasks: orderDownloadTasks(next) };
    });

    if (wasEmpty && isActiveStatus(get().tasks.get(task.id)?.status ?? task.status)) {
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
      await get().syncWithDb();
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
      await get().syncWithDb();
    } catch (e) {
      console.error('Error retrying download:', e);
    }
  },

  cancelTask: async (id) => {
    try {
      await cancelDownload(id);
      set((state) => {
        const next = new Map(state.tasks);
        next.delete(id);
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

  clearCompletedTasks: async () => {
    const tasks = Array.from(get().tasks.values());
    const completedOrCanceled = tasks.filter(
      (t) => t.status === 'completed' || t.status === 'canceled'
    );
    for (const task of completedOrCanceled) {
      try {
        await deleteDownloadRecord(task.id, false);
      } catch (e) {
        console.warn('Error removing completed task record:', task.id, e);
      }
    }
    set((state) => {
      const next = new Map(state.tasks);
      for (const task of completedOrCanceled) {
        next.delete(task.id);
      }
      return { tasks: next };
    });
    triggerNotificationSync();
  },
}));
