import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  XCircle, CheckCircle2, AlertCircle, ArrowDownCircle, HardDrive, Play,
  FolderOpen, Pause, RefreshCw, Sparkles
} from 'lucide-react';
import { getHistory, clearHistory, getFavorites } from '@/services/storageService';
import { useDownloadStore } from '@/stores/useDownloadStore';
import type { HistoryEntry, AnimeResult, DownloadTask } from '@/types';

function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSpeed(kbps: number) {
  if (kbps <= 0) return '0 KB/s';
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.round(kbps)} KB/s`;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getHistory(100, 0).then(data => { setEntries(data); setIsLoading(false); });
  }, []);

  const handleClear = async () => {
    await clearHistory();
    setEntries([]);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={22} color="var(--accent-primary)" />
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Historial de Visualización</h1>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', padding: '8px 14px',
              color: 'var(--accent-error)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            }}
          >
            <Trash2 size={14} /> Borrar Todo
          </button>
        )}
      </div>

      {!isLoading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <Inbox size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>Sin historial reciente</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Los episodios que reproduzcas se guardarán automáticamente aquí</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ x: 4 }}
            onClick={() => navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14,
              cursor: 'pointer', border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ width: 44, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              {entry.thumbnailUrl
                ? <img src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Film size={18} /></div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.animeTitle}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Episodio {entry.episodeNumber} · {Math.round((entry.watchProgress ?? 0) * 100)}% visto
              </p>
              <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2, marginTop: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(entry.watchProgress ?? 0) * 100}%`,
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
              <Clock size={11} />
              {new Date(entry.watchedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function FavoritesPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getFavorites().then(data => { setFavorites(data); setIsLoading(false); });
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Bookmark size={22} color="var(--accent-primary)" />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Series Favoritas</h1>
      </div>

      {!isLoading && favorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <BookmarkX size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>Sin favoritos guardados</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Guarda animes en favoritos desde la página de detalles para acceder rápidamente</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
        {favorites.map((anime, i) => (
          <motion.div
            key={anime.url}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -4 }}
            onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
              {anime.thumbnailUrl
                ? <img src={anime.thumbnailUrl} alt={anime.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Film size={32} /></div>
              }
            </div>
            <div style={{ padding: '8px 10px 10px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {anime.title}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function DownloadsPage() {
  const { tasks, cancelTask, removeTask } = useDownloadStore();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const taskList = Array.from(tasks.values());
  const activeTasks = taskList.filter(t => t.status === 'downloading' || t.status === 'queued');
  const completedTasks = taskList.filter(t => t.status === 'completed');

  const filteredTasks = filter === 'active'
    ? activeTasks
    : filter === 'completed'
    ? completedTasks
    : taskList;

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Download size={22} color="var(--accent-secondary)" />
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Monitor de Descargas</h1>
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, background: 'var(--bg-surface)', padding: 4, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setFilter('all')}
            style={{
              background: filter === 'all' ? 'var(--accent-primary-glow)' : 'transparent',
              color: filter === 'all' ? 'var(--accent-primary)' : 'var(--text-muted)',
              border: filter === 'all' ? '1px solid var(--accent-primary)' : 'none',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Todas ({taskList.length})
          </button>
          <button
            onClick={() => setFilter('active')}
            style={{
              background: filter === 'active' ? 'var(--accent-secondary-glow)' : 'transparent',
              color: filter === 'active' ? 'var(--accent-secondary)' : 'var(--text-muted)',
              border: filter === 'active' ? '1px solid var(--accent-secondary)' : 'none',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Activas ({activeTasks.length})
          </button>
          <button
            onClick={() => setFilter('completed')}
            style={{
              background: filter === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: filter === 'completed' ? 'var(--accent-success)' : 'var(--text-muted)',
              border: filter === 'completed' ? '1px solid var(--accent-success)' : 'none',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Completadas ({completedTasks.length})
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredTasks.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <Inbox size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>No hay descargas en esta sección</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Descarga episodios desde la vista de cualquier anime para verlos sin conexión
          </p>
        </div>
      )}

      {/* Lista de Tareas de Descarga */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AnimatePresence>
          {filteredTasks.map((task) => {
            const isDownloading = task.status === 'downloading';
            const isCompleted = task.status === 'completed';
            const isCanceled = task.status === 'canceled';
            const isError = task.status === 'failed';

            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 20, stiffness: 280 }}
                style={{
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                  padding: '16px 20px', border: '1px solid var(--border-subtle)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  boxShadow: isDownloading ? '0 0 15px var(--accent-secondary-glow)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-md)',
                      background: isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isCompleted && <CheckCircle2 size={22} color="var(--accent-success)" />}
                      {isDownloading && <ArrowDownCircle size={22} color="var(--accent-secondary)" style={{ animation: 'bounce 1s infinite' }} />}
                      {isCanceled && <XCircle size={22} color="var(--text-muted)" />}
                      {isError && <AlertCircle size={22} color="var(--accent-error)" />}
                    </div>

                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                        {task.animeTitle} {task.episodeNumber > 0 && `· Ep. ${task.episodeNumber}`}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          color: isCompleted ? 'var(--accent-success)' : isDownloading ? 'var(--accent-secondary)' : 'var(--text-muted)',
                        }}>
                          {isCompleted ? 'Completado' : isDownloading ? 'Descargando' : isCanceled ? 'Cancelado' : 'Error'}
                        </span>
                        {isDownloading && (
                          <>
                            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>•</span>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                              {formatSpeed(task.speedKbps)}
                            </span>
                            {task.downloadedBytes > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                ({formatBytes(task.downloadedBytes)} {task.totalBytes && task.totalBytes > 0 ? `/ ${formatBytes(task.totalBytes)}` : ''})
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isDownloading && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => cancelTask(task.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: 'var(--radius-md)', padding: '6px 12px',
                          color: 'var(--accent-error)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <XCircle size={14} /> Cancelar
                      </motion.button>
                    )}

                    {(isCompleted || isCanceled || isError) && (
                      <button
                        onClick={() => removeTask(task.id)}
                        style={{
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)', padding: '6px 10px',
                          color: 'var(--text-muted)', cursor: 'pointer',
                        }}
                        title="Eliminar de la lista"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Barra de progreso */}
                {isDownloading && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <span>Progreso de descarga</span>
                      <span style={{ color: 'var(--accent-secondary)' }}>{Math.round(task.progress * 100)}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${task.progress * 100}%` }}
                        transition={{ ease: 'linear', duration: 0.2 }}
                        style={{
                          height: '100%', borderRadius: 3,
                          background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                        }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
