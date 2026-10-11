import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isTauri } from '@tauri-apps/api/core';
import { CheckCircle2, Download, Pause, AlertCircle, X } from 'lucide-react';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { formatSpeed } from '@/services/downloadService';
import type { DownloadTask } from '@/types';
import './DesktopDownloadIndicator.css';

interface Notice { title: string; body: string; failed?: boolean }

async function systemNotice(notice: Notice) {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) sendNotification({ title: notice.title, body: notice.body });
  } catch { /* The in-app notice remains available when system notifications are disabled. */ }
}

export function DesktopDownloadIndicator() {
  const tasks = useDownloadStore(state => state.tasks);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let previous = useDownloadStore.getState().tasks;
    let dismiss: ReturnType<typeof setTimeout> | undefined;
    let batchTimer: ReturnType<typeof setTimeout> | undefined;
    const started = new Map<string, DownloadTask>();
    const show = (next: Notice) => {
      clearTimeout(dismiss);
      setNotice(next);
      dismiss = setTimeout(() => setNotice(null), 6000);
    };
    const stop = useDownloadStore.subscribe(state => {
      const before = previous;
      previous = state.tasks;
      for (const task of state.tasks.values()) {
        const old = before.get(task.id);
        if (!old && (task.status === 'queued' || task.status === 'downloading')) {
          started.set(task.id, task);
          if (!batchTimer) batchTimer = setTimeout(() => {
            const entries = [...started.values()].filter(entry => {
              const status = useDownloadStore.getState().tasks.get(entry.id)?.status;
              return status === 'queued' || status === 'downloading';
            });
            started.clear();
            batchTimer = undefined;
            if (!entries.length) return;
            const next = {
              title: entries.length === 1 ? 'Descarga añadida' : `${entries.length} descargas añadidas`,
              body: entries.length === 1 ? `${entries[0].animeTitle} · Ep. ${entries[0].episodeNumber}` : 'El lote está en la cola de descargas.',
            };
            show(next);
            void systemNotice(next);
          }, 300);
        }
        if (old && old.status !== task.status && (task.status === 'completed' || task.status === 'failed')) {
          const next = { title: task.status === 'completed' ? 'Descarga completada' : 'Error en la descarga',
            body: `${task.animeTitle} · Ep. ${task.episodeNumber}${task.error ? `: ${task.error}` : ''}`,
            failed: task.status === 'failed' };
          show(next);
          // Completion system notifications are already sent by the download store.
          if (next.failed) void systemNotice(next);
        }
      }
    });
    return () => { stop(); clearTimeout(dismiss); clearTimeout(batchTimer); };
  }, []);

  const all = [...tasks.values()];
  const downloading = all.filter(task => task.status === 'downloading');
  const queued = all.filter(task => task.status === 'queued');
  const paused = all.filter(task => task.status === 'paused');
  const visible = downloading.length ? downloading : queued.length ? queued : paused;
  const waiting = !downloading.length && queued.length > 0;
  const isPaused = !downloading.length && !queued.length;
  const knownBytes = visible.length > 0 && visible.every(task => Number.isFinite(task.totalBytes) && task.totalBytes! > 0);
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const progress = Math.round(knownBytes
    ? clamp(visible.reduce((sum, task) => sum + task.downloadedBytes, 0) / visible.reduce((sum, task) => sum + task.totalBytes!, 0) * 100)
    : visible.reduce((sum, task) => sum + clamp(task.progress), 0) / Math.max(1, visible.length));
  const indeterminate = waiting || (!knownBytes && progress === 0 && !isPaused);
  const speed = downloading.reduce((sum, task) => sum + (Number.isFinite(task.speedKbps) ? Math.max(0, task.speedKbps!) : 0), 0);
  const primary = visible[0];
  if (!primary && !notice) return null;

  return <aside className="desktop-download-indicator" aria-label="Estado de descargas">
    {notice && <div className="desktop-download-notice" role="status">
      {notice.failed ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
      <div><strong>{notice.title}</strong><span>{notice.body}</span></div>
      <button type="button" aria-label="Cerrar aviso de descarga" onClick={() => setNotice(null)}><X size={16} /></button>
    </div>}
    {primary && <Link to="/downloads" className="desktop-download-card" aria-label="Ver descargas">
      <div className="desktop-download-ring" role="progressbar" aria-label="Progreso de descargas"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : progress}
        aria-valuetext={waiting ? 'En cola' : indeterminate ? 'Iniciando descarga' : `${progress}%${isPaused ? ', en pausa' : ''}`}>
        <svg viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="23" />
          <circle cx="28" cy="28" r="23" pathLength="100" className={indeterminate ? 'is-indeterminate' : ''}
            strokeDasharray={indeterminate ? '25 75' : `${progress} 100`} />
        </svg>
        <span>{isPaused ? <Pause size={20} /> : indeterminate ? <Download size={20} /> : `${progress}%`}</span>
      </div>
      <div className="desktop-download-info">
        <strong>{waiting ? 'Descargas en cola' : isPaused ? 'Descargas en pausa' : 'Descargando'}</strong>
        <span>{visible.length === 1 ? `${primary.animeTitle} · Ep. ${primary.episodeNumber}` : `${visible.length} episodios`}</span>
        <small>{downloading.length ? `${formatSpeed(speed)}${queued.length ? ` · ${queued.length} en cola` : ''}` : 'Ver descargas'}</small>
      </div>
    </Link>}
  </aside>;
}
