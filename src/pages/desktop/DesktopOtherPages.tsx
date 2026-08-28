import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  ArrowDownCircle, HardDrive, Play, FolderOpen, RefreshCw, Search, Folder, FileVideo,
  ChevronDown, ChevronUp, Check, Eye, EyeOff
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
      const data = await getHistory(100, 0);
      setEntries(data);
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
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ width: 54, height: 76, borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              <CachedImage src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {entry.animeTitle}
              </p>
              <p style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 700, marginTop: 4, marginBottom: 8 }}>
                Episodio {entry.episodeNumber}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 5, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(entry.watchProgress * 100)}%`, height: '100%', background: 'var(--accent-primary)' }} />
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
  const { tasks, cancelTask, removeTask, expandedFolders, toggleFolder } = useDownloadStore();
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
            <ArrowDownCircle size={15} /> Cola de Descargas ({activeTasks.length})
          </button>
        </div>
      </div>

      {activeTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              <FolderOpen size={22} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Directorio Local de Descargas
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {downloadFolder || 'Cargando ubicación...'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                disabled={isScanning}
                onClick={() => loadLocalFolders()}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '9px 16px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Escaneando...' : 'Recargar Carpetas'}
              </button>

              <button
                onClick={handleSelectFolder}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  border: 'none', borderRadius: 'var(--radius-md)', padding: '9px 18px',
                  color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <FolderOpen size={14} /> Cambiar Carpeta
              </button>
            </div>
          </div>

          {animeFolders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)' }}>
              <Folder size={54} style={{ color: 'var(--text-muted)', margin: '0 auto 14px', opacity: 0.5 }} />
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                No se encontraron carpetas de anime
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto 20px' }}>
                Cada anime descargado se organiza automáticamente en su propia subcarpeta con sus episodios (.mp4, .mkv, .ts).
              </p>
              <button
                onClick={() => loadLocalFolders()}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '10px 20px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                <RefreshCw size={14} style={{ display: 'inline', marginRight: 6 }} /> Volver a escanear
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {animeFolders.map((anime) => {
                const isExpanded = Boolean(expandedFolders[anime.folderPath]);
                return (
                  <div
                    key={anime.folderPath}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xl)', overflow: 'hidden',
                      boxShadow: 'var(--shadow-subtle)',
                    }}
                  >
                    <div
                      onClick={() => toggleFolder(anime.folderPath)}
                      style={{
                        padding: '16px 20px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
                        background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 52, height: 72, borderRadius: 'var(--radius-md)',
                          overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)',
                          border: '1px solid var(--border-subtle)', position: 'relative',
                        }}>
                          {anime.coverImage ? (
                            <CachedImage
                              src={anime.coverImage}
                              alt={anime.animeTitle}
                              fallbackIconSize={24}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                              <Film size={24} />
                            </div>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {anime.animeTitle}
                          </h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                            <span style={{
                              background: 'var(--accent-primary)', color: 'white',
                              fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                            }}>
                              {anime.totalEpisodes} {anime.totalEpisodes === 1 ? 'episodio' : 'episodios'}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                              {anime.totalSizeFormatted}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handleSearchOnline(anime)}
                          title="Buscar en catálogo online"
                          style={{
                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          <Search size={14} /> Buscar online
                        </button>

                        <button
                          onClick={() => handleDeleteAnimeFolder(anime.folderPath)}
                          title="Eliminar carpeta de anime"
                          style={{
                            padding: '8px 12px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                            color: '#f87171', fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={15} />
                        </button>

                        <button
                          onClick={() => toggleFolder(anime.folderPath)}
                          style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
                          }}
                        >
                          {isExpanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{
                            overflow: 'hidden', borderTop: '1px solid var(--border-subtle)',
                            background: 'rgba(10,11,15,0.4)',
                          }}
                        >
                          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {anime.episodes.map((ep) => {
                              const isCompleted = ep.watchStatus === 'completed';
                              const isInProgress = ep.watchStatus === 'in_progress';

                              return (
                                <div
                                  key={ep.filePath}
                                  style={{
                                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-lg)', padding: '12px 18px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                                      background: isCompleted ? 'rgba(16,185,129,0.15)' : isInProgress ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: isCompleted ? 'var(--accent-success)' : isInProgress ? 'var(--accent-primary)' : 'var(--text-muted)',
                                      flexShrink: 0,
                                    }}>
                                      <FileVideo size={18} />
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                          Episodio {ep.episodeNumber}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {ep.fileName}
                                        </span>
                                      </div>

                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                        {isCompleted ? (
                                          <span style={{
                                            fontSize: 11, fontWeight: 800, color: 'var(--accent-success)',
                                            background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 4,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                          }}>
                                            <Check size={12} /> Visto
                                          </span>
                                        ) : isInProgress ? (
                                          <span style={{
                                            fontSize: 11, fontWeight: 800, color: 'var(--accent-primary)',
                                            background: 'rgba(59,130,246,0.15)', padding: '2px 8px', borderRadius: 4,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                          }}>
                                            <Eye size={12} /> En progreso ({Math.round(ep.watchProgress * 100)}%)
                                          </span>
                                        ) : (
                                          <span style={{
                                            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                                            background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                          }}>
                                            <EyeOff size={12} /> No visto
                                          </span>
                                        )}

                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                                          {ep.fileSizeFormatted}
                                        </span>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>• {ep.modifiedAt}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button
                                      onClick={() => handlePlayEpisode(ep, anime)}
                                      style={{
                                        padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                        border: 'none', color: 'white',
                                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', gap: 6,
                                      }}
                                    >
                                      <Play size={14} fill="white" /> Reproducir
                                    </button>

                                    <button
                                      onClick={() => handleDeleteEpisode(ep.filePath, anime.animeTitle)}
                                      title="Eliminar episodio del disco"
                                      style={{
                                        padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                                        color: 'var(--text-muted)', cursor: 'pointer',
                                      }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
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

      {activeTab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {taskList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)' }}>
              <ArrowDownCircle size={54} style={{ color: 'var(--text-muted)', margin: '0 auto 14px', opacity: 0.5 }} />
              <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                No hay descargas activas
              </p>
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Las descargas iniciadas aparecerán aquí con su monitor de velocidad y progreso.
              </p>
            </div>
          ) : (
            taskList.map((task) => {
              const isDownloading = task.status === 'downloading';
              const isQueued = task.status === 'queued';
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
                          color: isCompleted
                            ? 'var(--accent-success)'
                            : isDownloading
                              ? 'var(--accent-secondary)'
                              : isQueued
                                ? '#f59e0b'
                                : isCanceled
                                  ? 'var(--text-muted)'
                                  : 'var(--accent-error)',
                        }}>
                          {isCompleted ? 'Completado' : isDownloading ? 'Descargando' : isQueued ? 'En Cola' : isCanceled ? 'Cancelado' : 'Error'}
                        </span>
                        {isDownloading && task.speedKbps > 0 && (
                          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>
                            • {formatSpeed(task.speedKbps)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isDownloading || isQueued ? (
                        <button
                          onClick={() => cancelTask(task.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-md)', padding: '8px 16px',
                            color: 'var(--accent-error)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Cancelar
                        </button>
                      ) : (
                        <button
                          onClick={() => removeTask(task.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isQueued && (
                    <div style={{ fontSize: 12, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                      ⏳ En cola de espera (máx. 2 descargas simultáneas). Iniciará automáticamente...
                    </div>
                  )}

                  {isDownloading && (
                    <div>
                      {(() => {
                        const totalBytes = task.totalBytes;
                        const downloadedBytes = task.downloadedBytes;
                        // Cálculo 100% exacto sincronizado con los bytes reales
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
                                  ? <>{dlMB} <span style={{ color: 'var(--text-secondary)' }}>MB</span> / {totalMB} <span style={{ color: 'var(--text-secondary)' }}>MB</span> · {formatSpeed(task.speedKbps)}</>
                                  : <>{dlMB} <span style={{ color: 'var(--text-secondary)' }}>MB descargados</span> · {formatSpeed(task.speedKbps)}</>
                                }
                              </span>
                              <span style={{ color: 'var(--accent-secondary)', fontWeight: 700 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct}%`, height: '100%',
                                background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                                transition: 'width 0.3s ease',
                              }} />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {isError && task.error && (
                    <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                      {task.error}
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
