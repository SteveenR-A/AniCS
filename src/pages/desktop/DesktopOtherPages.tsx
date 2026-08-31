import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  ArrowDownCircle, HardDrive, Play, FolderOpen, RefreshCw, Search, Folder, FileVideo,
  ChevronDown, ChevronUp, Check, Eye, EyeOff, Pause, RotateCcw, Loader2, AlertCircle
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getHistory, clearHistory, getFavorites, removeFavorite } from '@/services/storageService';
import {
  scanLocalDownloads, deleteLocalDownload, deleteLocalAnimeFolder,
  getDefaultDownloadDir, setDownloadDir, saveLocalAnimeCover, getLocalMediaUrl
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
// Página de Historial Desktop
// ──────────────────────────────────────────
export function DesktopHistoryPage() {
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
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(124, 58, 237, 0.15)', color: 'var(--accent-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <History size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Historial de Reproducción</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              Continúa viendo tus animes desde el punto exacto donde los dejaste
            </p>
          </div>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', padding: '10px 18px',
              color: 'var(--accent-error)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            }}
          >
            <Trash2 size={15} /> Borrar Todo el Historial
          </button>
        )}
      </div>

      {!isLoading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 24, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <Inbox size={52} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700 }}>Sin historial reciente</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Los episodios que reproduzcas se guardarán automáticamente aquí</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
        {entries.map((entry) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -3, scale: 1.01 }}
            onClick={() => navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
              cursor: 'pointer', border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card)', position: 'relative',
            }}
          >
            <div style={{ width: 54, height: 76, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              <CachedImage src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {entry.animeTitle}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 700 }}>
                  Episodio {entry.episodeNumber}
                </span>
                {entry.watchProgress >= 0.85 && (
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 4 }}>
                    Visto
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(entry.watchProgress * 100)}%`, height: '100%', background: entry.watchProgress >= 0.85 ? '#34d399' : 'var(--accent-primary)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
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
// Página de Favoritos Desktop
// ──────────────────────────────────────────
export function DesktopFavoritesPage() {
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
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(236, 72, 153, 0.15)', color: '#ec4899',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Bookmark size={22} />
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Mis Animes Favoritos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
            {favorites.length} animes guardados en tu biblioteca local
          </p>
        </div>
      </div>

      {!isLoading && favorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 24, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <BookmarkX size={52} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 18, fontWeight: 700 }}>No tienes animes favoritos</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Guarda tus animes preferidos haciendo clic en "Añadir a Favoritos" desde la vista de detalles.
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 18,
      }}>
        {favorites.map((anime) => (
          <motion.div
            key={anime.url}
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
              position: 'relative', boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
              <CachedImage
                src={anime.thumbnailUrl}
                alt={anime.title}
                fallbackIconSize={36}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                onClick={(e) => handleRemove(e, anime.url)}
                title="Eliminar de favoritos"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%',
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f87171', cursor: 'pointer', backdropFilter: 'blur(6px)',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div style={{ padding: '12px 14px' }}>
              <p style={{
                fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
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
// Página de Descargas Desktop
// ──────────────────────────────────────────
export function DesktopDownloadsPage() {
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

  const loadLocalFolders = useCallback(async (customPath?: string) => {
    setIsScanning(true);
    try {
      const folder = customPath || downloadFolder || await getDefaultDownloadDir();
      setDownloadFolder(folder);
      const groups = await scanLocalDownloads(folder);
      setAnimeFolders(groups);
    } catch (e) {
      console.error('Error scanning downloads folder:', e);
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

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: downloadFolder,
      });
      if (selected && typeof selected === 'string') {
        setDownloadFolder(selected);
        await setDownloadDir(selected);
        loadLocalFolders(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
    if (!window.confirm('¿Seguro que deseas eliminar esta serie y todos sus episodios descargados?')) {
      return;
    }
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

  const handleSearchOnline = (anime: LocalAnimeFolder) => {
    if (
      anime.coverImage &&
      anime.coverImage.startsWith('http') &&
      anime.folderPath
    ) {
      saveLocalAnimeCover(anime.folderPath, anime.coverImage).catch(() => {});
    }
    navigate(`/search?q=${encodeURIComponent(anime.animeTitle)}`);
  };

  const taskList = Array.from(tasks.values());
  const activeTasks = taskList.filter(t => t.status === 'downloading' || t.status === 'queued');

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Download size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Gestor de Descargas</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              Series organizadas en carpetas y cola de descarga activa
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface)', padding: 4, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('local')}
            style={{
              background: activeTab === 'local' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'local' ? 'white' : 'var(--text-secondary)',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 18px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Folder size={15} /> Animes en Disco ({animeFolders.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              background: activeTab === 'active' ? 'var(--accent-secondary)' : 'transparent',
              color: activeTab === 'active' ? 'white' : 'var(--text-secondary)',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 18px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <ArrowDownCircle size={15} /> Cola de Descarga ({activeTasks.length})
          </button>
        </div>
      </div>

      {/* TAB 1: Carpetas en Disco */}
      {activeTab === 'local' && (
        <div>
          {/* Barra de Directorio */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <HardDrive size={18} color="var(--accent-primary)" />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 700 }}>
                  Ubicación actual de guardado
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                  {downloadFolder || 'Cargando directorio...'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleSelectFolder}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <FolderOpen size={14} /> Cambiar carpeta
              </button>
              <button
                onClick={() => loadLocalFolders()}
                disabled={isScanning}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Escaneando...' : 'Actualizar'}
              </button>
            </div>
          </div>

          {/* Listado de Carpetas / Animes */}
          {animeFolders.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
              border: '1px dashed var(--border-subtle)',
            }}>
              <Folder size={48} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>No hay animes descargados</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                Los episodios que descargues se organizarán automáticamente en subcarpetas aquí.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {animeFolders.map((anime) => {
                const isExpanded = Boolean(expandedFolders[anime.folderPath]);
                return (
                  <div
                    key={anime.folderPath}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden',
                      transition: 'border-color 0.2s ease',
                    }}
                  >
                    {/* Encabezado del Anime */}
                    <div
                      onClick={() => toggleFolder(anime.folderPath)}
                      style={{
                        padding: '14px 20px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer', gap: 16,
                        background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                        borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 48, height: 68, borderRadius: 'var(--radius-sm)',
                          overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)',
                        }}>
                          {anime.coverImage ? (
                            <CachedImage
                              src={anime.coverImage}
                              alt={anime.animeTitle}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{
                              width: '100%', height: '100%', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)',
                            }}>
                              <Film size={24} />
                            </div>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {anime.animeTitle}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                            <span style={{
                              background: 'var(--accent-primary)', color: 'white',
                              fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                            }}>
                              {anime.totalEpisodes} episodio{anime.totalEpisodes === 1 ? '' : 's'}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              Espacio total: <strong style={{ color: 'var(--text-secondary)' }}>{anime.totalSizeFormatted}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleSearchOnline(anime)}
                          title="Buscar serie online para más info/episodios"
                          style={{
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                            borderRadius: 'var(--radius-md)', padding: '6px 12px',
                            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                          }}
                        >
                          <Search size={13} /> Online
                        </button>
                        <button
                          onClick={() => handleDeleteAnimeFolder(anime.folderPath)}
                          title="Eliminar toda la serie descargada"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: 'var(--radius-md)', padding: '6px 10px',
                            color: '#f87171', fontSize: 12, cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={() => toggleFolder(anime.folderPath)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center',
                          }}
                        >
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      </div>
                    </div>

                    {/* Lista desplegable de Episodios del Anime */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{ background: 'rgba(10, 11, 15, 0.4)' }}
                        >
                          {anime.episodes.map((ep) => {
                            const isCompleted = ep.watchStatus === 'completed';
                            const isInProgress = ep.watchStatus === 'in_progress';
                            return (
                              <div
                                key={ep.filePath}
                                style={{
                                  padding: '12px 24px',
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  borderBottom: '1px solid var(--border-subtle)',
                                  gap: 16,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                                  <div style={{
                                    width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                                    background: isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-elevated)',
                                    color: isCompleted ? '#10b981' : 'var(--text-muted)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                  }}>
                                    {isCompleted ? <Check size={16} /> : <FileVideo size={16} />}
                                  </div>

                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        Episodio {ep.episodeNumber}
                                      </span>
                                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        ({ep.fileSizeFormatted})
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                        {ep.modifiedAt}
                                      </span>
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
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <button
                                    onClick={() => handlePlayEpisode(ep, anime)}
                                    style={{
                                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                      border: 'none', borderRadius: 'var(--radius-md)',
                                      padding: '7px 16px', color: 'white',
                                      fontSize: 12, fontWeight: 700, cursor: 'pointer',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                    }}
                                  >
                                    <Play size={13} fill="white" /> Reproducir
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEpisode(ep.filePath, anime.animeTitle)}
                                    title="Eliminar este episodio"
                                    style={{
                                      background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                                      borderRadius: 'var(--radius-md)', padding: '7px 10px',
                                      color: 'var(--text-muted)', cursor: 'pointer',
                                    }}
                                  >
                                    <Trash2 size={14} />
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
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Cola de Descarga Activa (Sin Emojis) */}
      {activeTab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {taskList.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
              border: '1px dashed var(--border-subtle)',
            }}>
              <ArrowDownCircle size={48} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>No hay descargas en cola</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                Las descargas iniciadas aparecerán aquí con su estado y progreso en tiempo real.
              </p>
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
                    borderRadius: 'var(--radius-lg)',
                    padding: 20,
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                        {task.animeTitle} {task.episodeNumber > 0 && `· Ep. ${task.episodeNumber}`}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 800, textTransform: 'uppercase',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          color: isCompleted
                            ? 'var(--accent-success)'
                            : isDownloading
                              ? 'var(--accent-secondary)'
                              : isPaused
                                ? '#f97316'
                                : isQueued
                                  ? '#f59e0b'
                                  : isCanceled
                                    ? 'var(--text-muted)'
                                    : 'var(--accent-error)',
                        }}>
                          {isCompleted && <><Check size={13} /> Completado</>}
                          {isDownloading && <><Loader2 size={13} className="animate-spin" /> Descargando</>}
                          {isPaused && <><Pause size={13} /> Pausado</>}
                          {isQueued && <><Clock size={13} /> En Cola</>}
                          {isCanceled && <>Cancelado</>}
                          {isError && <><AlertCircle size={13} /> Error</>}
                        </span>
                        {isDownloading && (task.speedKbps ?? 0) > 0 && (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                            • {formatSpeed(task.speedKbps ?? 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botones de acción Desktop */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isDownloading && (
                        <>
                          <button
                            onClick={() => pauseTask(task.id)}
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                              borderRadius: 'var(--radius-md)', padding: '8px 16px',
                              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            title="Pausar descarga"
                          >
                            <Pause size={14} /> Pausar
                          </button>
                          <button
                            onClick={() => cancelTask(task.id)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                              borderRadius: 'var(--radius-md)', padding: '8px 16px',
                              color: 'var(--accent-error)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            title="Cancelar descarga"
                          >
                            <Trash2 size={14} /> Cancelar
                          </button>
                        </>
                      )}

                      {isQueued && (
                        <button
                          onClick={() => cancelTask(task.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-md)', padding: '8px 16px',
                            color: 'var(--accent-error)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          }}
                          title="Cancelar"
                        >
                          <Trash2 size={14} /> Cancelar
                        </button>
                      )}

                      {isPaused && (
                        <>
                          <button
                            onClick={() => resumeTask(task.id)}
                            style={{
                              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                              border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 18px',
                              color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            title="Reanudar descarga"
                          >
                            <Play size={14} fill="white" /> Reanudar
                          </button>
                          <button
                            onClick={() => removeTask(task.id, false)}
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                              borderRadius: 'var(--radius-md)', padding: '8px 12px',
                              color: 'var(--text-muted)', cursor: 'pointer',
                            }}
                            title="Eliminar de la lista"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}

                      {isError && (
                        <>
                          <button
                            onClick={() => retryTask(task.id)}
                            style={{
                              background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                              borderRadius: 'var(--radius-md)', padding: '8px 16px',
                              color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}
                            title="Reintentar descarga"
                          >
                            <RotateCcw size={14} /> Reintentar
                          </button>
                          <button
                            onClick={() => removeTask(task.id, false)}
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                              borderRadius: 'var(--radius-md)', padding: '8px 12px',
                              color: 'var(--text-muted)', cursor: 'pointer',
                            }}
                            title="Eliminar de la lista"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}

                      {(isCompleted || isCanceled) && (
                        <button
                          onClick={() => removeTask(task.id, false)}
                          style={{
                            background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                            borderRadius: 'var(--radius-md)', padding: '8px 12px',
                            color: 'var(--text-muted)', cursor: 'pointer',
                          }}
                          title="Eliminar de la lista"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isQueued && (
                    <div style={{
                      fontSize: 12, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)',
                      padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <Clock size={14} /> En cola de espera (máx. 2 descargas simultáneas). Iniciará automáticamente...
                    </div>
                  )}

                  {isPaused && (
                    <div style={{
                      fontSize: 12, color: '#f97316', background: 'rgba(249, 115, 22, 0.1)',
                      padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <Pause size={14} /> Descarga pausada. Presiona Reanudar para continuar con la descarga.
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                              <span>
                                {totalMB
                                  ? <>{dlMB} <span style={{ color: 'var(--text-secondary)' }}>MB</span> / {totalMB} <span style={{ color: 'var(--text-secondary)' }}>MB</span>{isDownloading && (task.speedKbps ?? 0) > 0 && ` · ${formatSpeed(task.speedKbps ?? 0)}`}</>
                                  : <>{dlMB} <span style={{ color: 'var(--text-secondary)' }}>MB descargados</span>{isDownloading && (task.speedKbps ?? 0) > 0 && ` · ${formatSpeed(task.speedKbps ?? 0)}`}</>
                                }
                              </span>
                              <span style={{ color: isPaused ? '#f97316' : 'var(--accent-secondary)', fontWeight: 700 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct}%`, height: '100%',
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

                  {isError && task.error && (
                    <div style={{
                      fontSize: 12, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)',
                      padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <AlertCircle size={14} /> {task.error}
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
