import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  ArrowDownCircle, Play, FolderOpen, RefreshCw, Folder, FileVideo,
  ChevronDown, ChevronUp, Check, Eye, EyeOff, Pause, RotateCcw, Loader2, AlertCircle
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getHistory, clearHistory, getFavorites, removeFavorite } from '@/services/storageService';
import {
  scanLocalDownloads, deleteLocalDownload, deleteLocalAnimeFolder,
  getDefaultDownloadDir, getLocalMediaUrl
} from '@/services/downloadService';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { CachedImage } from '@/components/CachedImage';
import type { HistoryEntry, AnimeResult, LocalAnimeFolder, LocalEpisodeItem } from '@/types';

function formatSpeed(kbps: number) {
  if (kbps <= 0) return '0 KB/s';
  if (kbps >= 1024) {
    return `${(kbps / 1024).toFixed(1)} MB/s`;
  }
  return `${Math.round(kbps)} KB/s`;
}

// ──────────────────────────────────────────
// Página de Historial Móvil
// ──────────────────────────────────────────
export function MobileHistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getHistory(150, 0);
      const seen = new Set<string>();
      const deduplicated = data.filter((item) => {
        const uniqueAnimeKey = item.animeUrl || item.id || item.animeTitle.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = `${uniqueAnimeKey}-ep-${item.episodeNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setEntries(deduplicated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleClear = async () => {
    await clearHistory();
    setEntries([]);
  };

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <History size={20} color="var(--accent-primary)" />
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Historial</h2>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-full)', padding: '5px 12px',
              color: 'var(--accent-error)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
            }}
          >
            <Trash2 size={12} /> Borrar
          </button>
        )}
      </div>

      {!isLoading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 16px' }}>
          <Inbox size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600, margin: 0 }}>Sin historial</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ width: 44, height: 60, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              <CachedImage src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {entry.animeTitle}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 6px' }}>
                <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 700 }}>
                  Episodio {entry.episodeNumber}
                </span>
                {entry.watchProgress >= 0.85 && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 5px', borderRadius: 3 }}>
                    Visto
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(entry.watchProgress * 100)}%`, height: '100%', background: entry.watchProgress >= 0.85 ? '#34d399' : 'var(--accent-primary)' }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {Math.round(entry.watchProgress * 100)}%
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Página de Favoritos Móvil (2 Columnas)
// ──────────────────────────────────────────
export function MobileFavoritesPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFavs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getFavorites();
      setFavorites(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavs();
  }, [loadFavs]);

  const handleRemove = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    try {
      await removeFavorite(url);
      setFavorites(favorites.filter(f => f.url !== url));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Bookmark size={20} color="var(--accent-primary)" />
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Favoritos ({favorites.length})</h2>
      </div>

      {!isLoading && favorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 16px' }}>
          <BookmarkX size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 600, margin: 0 }}>No tienes favoritos</p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
      }}>
        {favorites.map((anime) => (
          <motion.div
            key={anime.url}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
              <CachedImage
                src={anime.thumbnailUrl}
                alt={anime.title}
                fallbackIconSize={30}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                onClick={(e) => handleRemove(e, anime.url)}
                style={{
                  position: 'absolute', top: 6, right: 6,
                  background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%',
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f87171', cursor: 'pointer',
                }}
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ padding: '8px 10px 10px' }}>
              <p style={{
                fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                margin: 0,
              }}>
                {anime.title}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Página de Descargas Móvil
// ──────────────────────────────────────────
export function MobileDownloadsPage() {
  const navigate = useNavigate();
  const {
    tasks, pauseTask, resumeTask, retryTask, cancelTask, removeTask,
    expandedFolders, toggleFolder
  } = useDownloadStore();
  const {
    openPlayer, setCurrentEpisode, setCurrentAnime, setServers, setResolvedMedia, resetPlayback
  } = usePlayerStore();

  const [activeTab, setActiveTab] = useState<'local' | 'active'>('local');
  const [downloadFolder, setDownloadFolder] = useState<string>('');
  const [animeFolders, setAnimeFolders] = useState<LocalAnimeFolder[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  const loadLocalFolders = useCallback(async () => {
    setIsScanning(true);
    try {
      const folder = downloadFolder || await getDefaultDownloadDir();
      setDownloadFolder(folder);
      const groups = await scanLocalDownloads(folder);
      setAnimeFolders(groups);
    } catch (e) {
      console.error('Error scanning downloads folder in Mobile:', e);
    } finally {
      setIsScanning(false);
    }
  }, [downloadFolder]);

  useEffect(() => {
    loadLocalFolders();
    const handleFocus = () => {
      loadLocalFolders();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadLocalFolders]);

  const handleDeleteEpisode = async (filePath: string, animeTitle: string) => {
    try {
      await deleteLocalDownload(filePath);
      setAnimeFolders(prev => prev.map(folder => {
        if (folder.animeTitle === animeTitle) {
          const remaining = folder.episodes.filter(e => e.filePath !== filePath);
          return { ...folder, episodes: remaining, totalEpisodes: remaining.length };
        }
        return folder;
      }).filter(folder => folder.episodes.length > 0));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAnimeFolder = async (folderPath: string) => {
    if (!window.confirm('¿Eliminar esta serie descargada?')) return;
    try {
      await deleteLocalAnimeFolder(folderPath);
      setAnimeFolders(prev => prev.filter(f => f.folderPath !== folderPath));
    } catch (e) {
      console.error(e);
    }
  };

  const handlePlayEpisode = async (ep: LocalEpisodeItem, anime: LocalAnimeFolder) => {
    resetPlayback();
    let streamUrl = '';
    try {
      streamUrl = await getLocalMediaUrl(ep.filePath);
    } catch {
      streamUrl = convertFileSrc(ep.filePath);
    }
    const isTs = ep.filePath.toLowerCase().endsWith('.ts');
    setCurrentAnime({
      title: anime.animeTitle,
      url: ep.filePath,
      thumbnailUrl: anime.coverImage || '',
      synopsis: `Archivo local en: ${ep.filePath}`,
      genres: ['Descarga local'],
      episodes: anime.episodes.map(e => ({
        number: e.episodeNumber,
        title: e.fileName,
        url: e.filePath,
        watched: e.watchStatus === 'completed',
        watchProgress: e.watchProgress,
      })),
      source: 'local',
    });
    setCurrentEpisode({
      number: ep.episodeNumber,
      title: ep.fileName,
      url: ep.filePath,
      watched: ep.watchStatus === 'completed',
      watchProgress: ep.watchProgress,
    });
    setResolvedMedia({
      directUrl: streamUrl,
      mediaType: isTs ? 'hls' : 'mp4',
      qualities: [],
    });
    setServers([]);
    openPlayer();
    navigate('/player');
  };

  const taskList = Array.from(tasks.values());
  const activeTasks = taskList.filter(t => t.status === 'downloading' || t.status === 'queued');

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Header Móvil Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setActiveTab('local')}
          style={{
            flex: 1,
            background: activeTab === 'local' ? 'var(--accent-primary)' : 'var(--bg-surface)',
            color: activeTab === 'local' ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '7px 12px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <Folder size={14} /> Animes ({animeFolders.length})
        </button>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            flex: 1,
            background: activeTab === 'active' ? 'var(--accent-secondary)' : 'var(--bg-surface)',
            color: activeTab === 'active' ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)', padding: '7px 12px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <ArrowDownCircle size={14} /> Cola ({activeTasks.length})
        </button>
      </div>

      {/* TAB 1: Carpetas en Móvil */}
      {activeTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {animeFolders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
              <Folder size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>Sin animes descargados</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Los episodios descargados se organizarán automáticamente aquí.</p>
            </div>
          ) : (
            animeFolders.map((anime) => {
              const isExpanded = Boolean(expandedFolders[anime.folderPath]);
              return (
                <div
                  key={anime.folderPath}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => toggleFolder(anime.folderPath)}
                    style={{
                      padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      cursor: 'pointer', background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 38, height: 52, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
                        {anime.coverImage ? (
                          <CachedImage src={anime.coverImage} alt={anime.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                            <Film size={18} />
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {anime.animeTitle}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)' }}>
                            {anime.totalEpisodes} ep{anime.totalEpisodes === 1 ? '' : 's'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>• {anime.totalSizeFormatted}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteAnimeFolder(anime.folderPath)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: 4, cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                      {isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-base)' }}
                      >
                        {anime.episodes.map((ep) => {
                          const isCompleted = ep.watchStatus === 'completed';
                          const isInProgress = ep.watchStatus === 'in_progress';
                          return (
                            <div
                              key={ep.filePath}
                              style={{
                                padding: '9px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderBottom: '1px solid var(--border-subtle)', gap: 8,
                              }}
                            >
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  Episodio {ep.episodeNumber}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ep.fileSizeFormatted}</span>
                                  {isCompleted ? (
                                    <span style={{
                                      fontSize: 10, fontWeight: 800, color: 'var(--accent-success)',
                                      background: 'rgba(16,185,129,0.15)', padding: '1px 6px', borderRadius: 4,
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}>
                                      <Check size={10} /> Visto
                                    </span>
                                  ) : isInProgress ? (
                                    <span style={{
                                      fontSize: 10, fontWeight: 800, color: 'var(--accent-primary)',
                                      background: 'rgba(59,130,246,0.15)', padding: '1px 6px', borderRadius: 4,
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}>
                                      <Eye size={10} /> En progreso ({Math.round(ep.watchProgress * 100)}%)
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                                      background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 4,
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}>
                                      <EyeOff size={10} /> No visto
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  onClick={() => handlePlayEpisode(ep, anime)}
                                  style={{
                                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                    border: 'none', borderRadius: 'var(--radius-sm)',
                                    padding: '6px 12px', color: 'white', fontSize: 11, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                                  }}
                                >
                                  <Play size={11} fill="white" /> Ver
                                </button>
                                <button
                                  onClick={() => handleDeleteEpisode(ep.filePath, anime.animeTitle)}
                                  style={{
                                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-sm)', padding: 6, color: 'var(--text-muted)', cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Cola en Móvil (Sin Emojis) */}
      {activeTab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {taskList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
              <ArrowDownCircle size={36} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>No hay descargas en la cola</p>
            </div>
          ) : (
            taskList.map((task) => {
              const isDownloading = task.status === 'downloading';
              const isQueued = task.status === 'queued';
              const isPaused = task.status === 'paused';
              const isCompleted = task.status === 'completed';
              const isCanceled = task.status === 'canceled';
              const isError = task.status === 'failed';

              return (
                <div
                  key={task.id}
                  style={{
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    padding: 12,
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {task.animeTitle} {task.episodeNumber > 0 && `· Ep. ${task.episodeNumber}`}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          color: isCompleted
                            ? 'var(--accent-success)'
                            : isDownloading
                              ? 'var(--accent-primary)'
                              : isPaused
                                ? '#f97316'
                                : isQueued
                                  ? '#f59e0b'
                                  : isCanceled
                                    ? 'var(--text-muted)'
                                    : 'var(--accent-error)',
                        }}>
                          {isCompleted && <><Check size={11} /> Completado</>}
                          {isDownloading && <><Loader2 size={11} className="animate-spin" /> Descargando</>}
                          {isPaused && <><Pause size={11} /> Pausado</>}
                          {isQueued && <><Clock size={11} /> En Cola</>}
                          {isCanceled && <>Cancelado</>}
                          {isError && <><AlertCircle size={11} /> Error</>}
                        </span>
                        {isDownloading && (task.speedKbps ?? 0) > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            • {formatSpeed(task.speedKbps ?? 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botones de acción dinámicos */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isDownloading && (
                        <>
                          <button
                            onClick={() => pauseTask(task.id)}
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-sm)', padding: '5px 9px', color: 'var(--text-primary)',
                              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}
                            title="Pausar descarga"
                          >
                            <Pause size={11} /> Pausar
                          </button>
                          <button
                            onClick={() => cancelTask(task.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)', border: 'none',
                              borderRadius: 'var(--radius-sm)', padding: '5px 9px', color: 'var(--accent-error)',
                              fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}
                            title="Cancelar descarga"
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}

                      {isQueued && (
                        <button
                          onClick={() => cancelTask(task.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)', border: 'none',
                            borderRadius: 'var(--radius-sm)', padding: '5px 9px', color: 'var(--accent-error)',
                            fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          }}
                          title="Cancelar"
                        >
                          <Trash2 size={11} /> Cancelar
                        </button>
                      )}

                      {isPaused && (
                        <>
                          <button
                            onClick={() => resumeTask(task.id)}
                            style={{
                              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                              border: 'none', borderRadius: 'var(--radius-sm)', padding: '5px 10px',
                              color: 'white', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}
                            title="Reanudar descarga"
                          >
                            <Play size={11} fill="white" /> Reanudar
                          </button>
                          <button
                            onClick={() => removeTask(task.id, false)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                            title="Eliminar de la lista"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}

                      {isError && (
                        <>
                          <button
                            onClick={() => retryTask(task.id)}
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: 'var(--radius-sm)', padding: '5px 10px', color: 'var(--accent-primary)',
                              display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}
                            title="Reintentar descarga"
                          >
                            <RotateCcw size={11} /> Reintentar
                          </button>
                          <button
                            onClick={() => removeTask(task.id, false)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                            title="Eliminar de la lista"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}

                      {(isCompleted || isCanceled) && (
                        <button
                          onClick={() => removeTask(task.id, false)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                          title="Eliminar de la lista"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isQueued && (
                    <div style={{
                      fontSize: 11, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)',
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Clock size={12} /> En cola (máx. 2 simultáneas)...
                    </div>
                  )}

                  {isPaused && (
                    <div style={{
                      fontSize: 11, color: '#f97316', background: 'rgba(249, 115, 22, 0.1)',
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Pause size={12} /> Descarga pausada. Presiona Reanudar para continuar.
                    </div>
                  )}

                  {isError && task.error && (
                    <div style={{
                      fontSize: 11, color: 'var(--accent-error)', background: 'rgba(239, 68, 68, 0.1)',
                      padding: '6px 10px', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <AlertCircle size={12} /> {task.error}
                    </div>
                  )}

                  {(isDownloading || isPaused) && (
                    <div>
                      {(() => {
                        const totalBytes = task.totalBytes;
                        const downloadedBytes = task.downloadedBytes;
                        const pct = (totalBytes && totalBytes > 0)
                          ? Math.min(100, Math.max(0, Math.round((downloadedBytes / totalBytes) * 100)))
                          : Math.min(100, Math.max(0, Math.round(task.progress)));

                        const dlMB = (downloadedBytes / (1024 * 1024)).toFixed(1);
                        const totalMB = totalBytes ? (totalBytes / (1024 * 1024)).toFixed(1) : null;
                        return (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                              <span style={{ fontWeight: 600 }}>
                                {totalMB ? `${dlMB} / ${totalMB} MB` : `${dlMB} MB`}
                                {isDownloading && (task.speedKbps ?? 0) > 0 && ` · ${formatSpeed(task.speedKbps ?? 0)}`}
                              </span>
                              <span style={{ color: isPaused ? '#f97316' : 'var(--accent-primary)', fontWeight: 700 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct}%`,
                                height: '100%',
                                background: isPaused
                                  ? '#f97316'
                                  : 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                                transition: 'width 0.3s ease',
                              }} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
