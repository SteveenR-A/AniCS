import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  XCircle, CheckCircle2, AlertCircle, ArrowDownCircle, HardDrive, Play,
  FolderOpen, Pause, RefreshCw, Sparkles, Search, Folder, FileVideo, ExternalLink
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getHistory, clearHistory, getFavorites, removeFavorite } from '@/services/storageService';
import {
  scanLocalDownloads, deleteLocalDownload, getDefaultDownloadDir
} from '@/services/downloadService';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { CachedImage } from '@/components/CachedImage';
import type { HistoryEntry, AnimeResult, LocalVideoFile } from '@/types';

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

// ──────────────────────────────────────────
// Página de Historial
// ──────────────────────────────────────────
export function HistoryPage() {
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
            <div style={{ width: 48, height: 68, borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              <CachedImage src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.animeTitle}
              </p>
              <p style={{ fontSize: 12, color: 'var(--accent-primary)', fontWeight: 600, marginTop: 2 }}>
                Episodio {entry.episodeNumber}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <div style={{ flex: 1, maxWidth: 140, height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(entry.watchProgress * 100)}%`, height: '100%', background: 'var(--accent-primary)' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
// Página de Favoritos
// ──────────────────────────────────────────
export function FavoritesPage() {
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
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Bookmark size={22} color="var(--accent-primary)" />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Mis Favoritos</h1>
      </div>

      {!isLoading && favorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <BookmarkX size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>No tienes animes favoritos</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>
            Guarda tus animes preferidos haciendo clic en "Añadir a Favoritos"
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 16,
      }}>
        {favorites.map((anime) => (
          <motion.div
            key={anime.url}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
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
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <button
                onClick={(e) => handleRemove(e, anime.url)}
                title="Eliminar de favoritos"
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f87171', cursor: 'pointer', backdropFilter: 'blur(6px)',
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <p style={{
                fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
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
// Página de Descargas y Gestor de Archivos Locales
// ──────────────────────────────────────────
export function DownloadsPage() {
  const navigate = useNavigate();
  const { tasks, cancelTask, removeTask } = useDownloadStore();
  const { setCurrentAnime, setCurrentEpisode, setResolvedMedia, openPlayer } = usePlayerStore();

  const [activeTab, setActiveTab] = useState<'local' | 'active'>('local');
  const [downloadFolder, setDownloadFolder] = useState<string>('');
  const [localFiles, setLocalFiles] = useState<LocalVideoFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Cargar carpeta por defecto y escanear
  const loadLocalFiles = useCallback(async (customPath?: string) => {
    setIsScanning(true);
    try {
      const folder = customPath || downloadFolder || await getDefaultDownloadDir();
      setDownloadFolder(folder);
      const files = await scanLocalDownloads(folder);
      setLocalFiles(files);
    } catch (e) {
      console.error('Error scanning downloads folder:', e);
    } finally {
      setIsScanning(false);
    }
  }, [downloadFolder]);

  useEffect(() => {
    loadLocalFiles();
  }, []);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        defaultPath: downloadFolder,
      });
      if (selected && typeof selected === 'string') {
        setDownloadFolder(selected);
        loadLocalFiles(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteLocal = async (filePath: string) => {
    try {
      await deleteLocalDownload(filePath);
      setLocalFiles(localFiles.filter(f => f.filePath !== filePath));
    } catch (e) {
      console.error(e);
    }
  };

  // Reproducir archivo descargado directamente en el reproductor interno
  const handlePlayLocalFile = (file: LocalVideoFile) => {
    const assetUrl = convertFileSrc(file.filePath);
    setCurrentAnime({
      title: file.animeTitle,
      url: file.filePath,
      thumbnailUrl: '',
      synopsis: `Archivo local: ${file.fileName}`,
      genres: ['Descarga local'],
      episodes: [{
        number: file.episodeNumber || 1,
        title: file.fileName,
        url: file.filePath,
        watched: false,
      }],
      source: 'local',
    });
    setCurrentEpisode({
      number: file.episodeNumber || 1,
      title: file.fileName,
      url: file.filePath,
      watched: false,
    });
    setResolvedMedia({
      directUrl: assetUrl,
      mediaType: 'mp4',
      qualities: [],
    });
    openPlayer();
    navigate('/player');
  };

  // Buscar en línea el anime detectado
  const handleSearchOnline = (animeTitle: string) => {
    navigate(`/search?q=${encodeURIComponent(animeTitle)}`);
  };

  const taskList = Array.from(tasks.values());
  const activeTasks = taskList.filter(t => t.status === 'downloading' || t.status === 'queued');

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header Principal */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Download size={24} color="var(--accent-primary)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Descargas & Videos Locales</h1>
        </div>

        {/* Selector de Pestañas */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface)', padding: 4, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setActiveTab('local')}
            style={{
              background: activeTab === 'local' ? 'var(--accent-primary)' : 'transparent',
              color: activeTab === 'local' ? 'white' : 'var(--text-secondary)',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '7px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Folder size={14} /> Archivos en Disco ({localFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('active')}
            style={{
              background: activeTab === 'active' ? 'var(--accent-secondary)' : 'transparent',
              color: activeTab === 'active' ? 'white' : 'var(--text-secondary)',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '7px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <ArrowDownCircle size={14} /> Cola Activa ({activeTasks.length})
          </button>
        </div>
      </div>

      {/* ─── TAB 1: Archivos Locales en Carpeta ─── */}
      {activeTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Barra de Ubicación y Botones de Exploración */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <FolderOpen size={20} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Carpeta de descargas
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {downloadFolder || 'Cargando ubicación...'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={isScanning}
                onClick={() => loadLocalFiles()}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 14px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
                {isScanning ? 'Escaneando...' : 'Recargar Carpeta'}
              </button>

              <button
                onClick={handleSelectFolder}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 16px',
                  color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <FolderOpen size={13} /> Cambiar Carpeta
              </button>
            </div>
          </div>

          {/* Lista de Videos Locales */}
          {localFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
              <FileVideo size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                No se encontraron videos en esta carpeta
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 450, margin: '0 auto 16px' }}>
                Coloca archivos (.mp4, .mkv, .ts) en la carpeta o descarga episodios para reproducirlos sin internet.
              </p>
              <button
                onClick={() => loadLocalFiles()}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 16px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                <RefreshCw size={14} style={{ display: 'inline', marginRight: 6 }} /> Volver a escanear
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {localFiles.map((file) => (
                <motion.div
                  key={file.filePath}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)', padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <FileVideo size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{
                        fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {file.animeTitle}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        {file.episodeNumber && (
                          <span style={{
                            background: 'var(--accent-primary)', color: 'white',
                            fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                          }}>
                            Ep. {file.episodeNumber}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                          {file.fileSizeFormatted}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {file.modifiedAt}</span>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de Reproducción, Búsqueda en Línea y Eliminación */}
                  <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border-subtle)', paddingTop: 10, marginTop: 'auto' }}>
                    <button
                      onClick={() => handlePlayLocalFile(file)}
                      style={{
                        flex: 1, padding: '7px 10px',
                        background: 'rgba(59, 130, 246, 0.15)', border: '1px solid var(--accent-primary)',
                        borderRadius: 'var(--radius-md)', color: 'var(--accent-primary)',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}
                    >
                      <Play size={13} fill="currentColor" /> Reproducir
                    </button>

                    <button
                      onClick={() => handleSearchOnline(file.animeTitle)}
                      title={`Buscar "${file.animeTitle}" en línea para ver sinopsis y catálogo`}
                      style={{
                        padding: '7px 10px',
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Search size={13} /> Buscar
                    </button>

                    <button
                      onClick={() => handleDeleteLocal(file.filePath)}
                      title="Eliminar archivo del disco"
                      style={{
                        padding: '7px 10px',
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: 'var(--radius-md)', color: '#f87171',
                        fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center',
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: Cola de Descargas Activas ─── */}
      {activeTab === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {taskList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
              <ArrowDownCircle size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                No hay descargas activas
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Las descargas iniciadas aparecerán aquí con su monitor de velocidad y progreso.
              </p>
            </div>
          ) : (
            taskList.map((task) => {
              const isDownloading = task.status === 'downloading';
              const isCompleted = task.status === 'completed';
              const isCanceled = task.status === 'canceled';
              const isError = task.status === 'failed';

              return (
                <div
                  key={task.id}
                  style={{
                    background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                    padding: '16px 20px', border: '1px solid var(--border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h4 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>
                        {task.animeTitle} {task.episodeNumber > 0 && `· Ep. ${task.episodeNumber}`}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                          color: isCompleted ? 'var(--accent-success)' : isDownloading ? 'var(--accent-secondary)' : 'var(--text-muted)',
                        }}>
                          {isCompleted ? 'Completado' : isDownloading ? 'Descargando' : isCanceled ? 'Cancelado' : 'Error'}
                        </span>
                        {isDownloading && (
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                            • {formatSpeed(task.speedKbps)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isDownloading ? (
                        <button
                          onClick={() => cancelTask(task.id)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: 'var(--radius-md)', padding: '6px 12px',
                            color: 'var(--accent-error)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          }}
                        >
                          Cancelar
                        </button>
                      ) : (
                        <button
                          onClick={() => removeTask(task.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isDownloading && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <span>Progreso</span>
                        <span style={{ color: 'var(--accent-secondary)' }}>{Math.round(task.progress * 100)}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${task.progress * 100}%`, height: '100%',
                          background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                        }} />
                      </div>
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
