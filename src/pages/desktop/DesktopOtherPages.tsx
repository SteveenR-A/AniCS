import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History,
  ArrowDownCircle, HardDrive, Play, FolderOpen, RefreshCw, Search, Folder, FileVideo,
  ChevronDown, ChevronUp, Check, Eye, EyeOff, Pause, RotateCcw, Loader2, AlertCircle,
  CheckSquare, Square, X, Layers, PlayCircle, Heart
} from 'lucide-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  getHistory, clearHistory, removeHistory, removeHistoryBatch,
  removeHistoryByAnime, getFavorites, removeFavorite, updateFavoriteStatus,
  normalizeAnimeTitleKey
} from '@/services/storageService';
import {
  scanLocalDownloads, deleteLocalDownload, deleteLocalAnimeFolder,
  getDefaultDownloadDir, setDownloadDir, saveLocalAnimeCover, getLocalMediaUrl
} from '@/services/downloadService';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { CachedImage } from '@/components/CachedImage';
import { FavoriteStatusDropdown, FAVORITE_STATUSES } from '@/components/FavoriteStatusDropdown';
import { StorageSpaceBar } from '@/components/StorageSpaceBar';
import type { HistoryEntry, AnimeResult, LocalAnimeFolder, LocalEpisodeItem, FavoriteStatus } from '@/types';

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
  const { activeProfile } = useProfileStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedAnimeKeys, setExpandedAnimeKeys] = useState<Set<string>>(new Set());

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getHistory(300, 0, activeProfile?.id);
      
      // Unificación inteligente de episodios (evita duplicados local vs jkanime)
      const episodeMap = new Map<string, HistoryEntry>();
      for (const item of data) {
        const normTitle = normalizeAnimeTitleKey(item.animeTitle);
        const epKey = `${normTitle || item.animeUrl}-ep-${item.episodeNumber}`;
        const existing = episodeMap.get(epKey);

        if (!existing) {
          episodeMap.set(epKey, { ...item });
        } else {
          // Fusionar registro local y online en una única entrada consolidada
          const isMoreRecent = new Date(item.watchedAt).getTime() > new Date(existing.watchedAt).getTime();
          const higherProgress = Math.max(existing.watchProgress || 0, item.watchProgress || 0);
          const preferOnlineUrl = (item.animeUrl && item.animeUrl.startsWith('http')) ? item.animeUrl : existing.animeUrl;
          const preferOnlineEpUrl = (item.episodeUrl && item.episodeUrl.startsWith('http')) ? item.episodeUrl : (isMoreRecent ? item.episodeUrl : existing.episodeUrl);
          const preferThumbnail = (item.thumbnailUrl && item.thumbnailUrl.startsWith('http')) ? item.thumbnailUrl : (existing.thumbnailUrl || item.thumbnailUrl);
          const preferSource = (existing.source && existing.source !== 'local') ? existing.source : (item.source || 'jkanime');

          episodeMap.set(epKey, {
            ...existing,
            animeUrl: preferOnlineUrl,
            episodeUrl: preferOnlineEpUrl,
            thumbnailUrl: preferThumbnail,
            watchProgress: higherProgress,
            watchedAt: isMoreRecent ? item.watchedAt : existing.watchedAt,
            source: preferSource,
          });
        }
      }

      setEntries(Array.from(episodeMap.values()));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    loadHistory();
    const handleSync = () => loadHistory();
    window.addEventListener('anics:sync-completed', handleSync);
    return () => window.removeEventListener('anics:sync-completed', handleSync);
  }, [loadHistory]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) => e.animeTitle.toLowerCase().includes(q) || `episodio ${e.episodeNumber}`.includes(q)
    );
  }, [entries, searchQuery]);

  const toggleExpandAnime = (key: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedAnimeKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Agrupación unificada por Serie (1 tarjeta por Anime)
  const groupedAnimes = useMemo(() => {
    const map = new Map<string, {
      key: string;
      animeUrl: string;
      animeTitle: string;
      thumbnailUrl: string;
      source: string;
      latestWatchedAt: string;
      latestEpisode: HistoryEntry;
      episodes: HistoryEntry[];
    }>();

    for (const entry of filteredEntries) {
      const normTitle = normalizeAnimeTitleKey(entry.animeTitle);
      const groupKey = normTitle || entry.animeUrl;
      const existing = map.get(groupKey);

      if (!existing) {
        map.set(groupKey, {
          key: groupKey,
          animeUrl: entry.animeUrl,
          animeTitle: entry.animeTitle,
          thumbnailUrl: entry.thumbnailUrl,
          source: entry.source,
          latestWatchedAt: entry.watchedAt,
          latestEpisode: entry,
          episodes: [entry],
        });
      } else {
        existing.episodes.push(entry);
        if (new Date(entry.watchedAt).getTime() > new Date(existing.latestWatchedAt).getTime()) {
          existing.latestWatchedAt = entry.watchedAt;
          existing.latestEpisode = entry;
        }
        if (!existing.animeUrl.startsWith('http') && entry.animeUrl && entry.animeUrl.startsWith('http')) {
          existing.animeUrl = entry.animeUrl;
        }
        if ((!existing.thumbnailUrl || !existing.thumbnailUrl.startsWith('http')) && entry.thumbnailUrl && entry.thumbnailUrl.startsWith('http')) {
          existing.thumbnailUrl = entry.thumbnailUrl;
        }
        if (existing.source === 'local' && entry.source && entry.source !== 'local') {
          existing.source = entry.source;
        }
      }
    }

    for (const group of map.values()) {
      group.episodes.sort((a, b) => b.episodeNumber - a.episodeNumber);
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.latestWatchedAt).getTime() - new Date(a.latestWatchedAt).getTime()
    );
  }, [filteredEntries]);

  const handleClear = async () => {
    if (confirm('¿Estás seguro de que deseas borrar todo el historial?')) {
      await clearHistory(activeProfile?.id);
      setEntries([]);
      setSelectedIds(new Set());
      setIsSelecting(false);
      useSyncStore.getState().triggerDebouncedSync();
    }
  };

  const handleDeleteEntry = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await removeHistory(id);
      setEntries((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      useSyncStore.getState().triggerDebouncedSync();
    } catch (err) {
      console.error('Error removing history item:', err);
    }
  };

  const handleDeleteEntireAnime = async (animeUrl: string, animeTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar todos los episodios de "${animeTitle}" del historial?`)) {
      try {
        const normTarget = normalizeAnimeTitleKey(animeTitle);
        const matchingEntries = entries.filter(it => 
          (normTarget && normalizeAnimeTitleKey(it.animeTitle) === normTarget) || 
          it.animeUrl === animeUrl || 
          it.animeTitle === animeTitle
        );
        const idsToDelete = matchingEntries.map(it => it.id);
        
        if (idsToDelete.length > 0) {
          await removeHistoryBatch(idsToDelete);
        }
        await removeHistoryByAnime(animeUrl, activeProfile?.id);
        await removeHistoryByAnime(animeTitle, activeProfile?.id);

        setEntries((prev) => prev.filter((item) => {
          const itemNorm = normalizeAnimeTitleKey(item.animeTitle);
          if (normTarget && itemNorm === normTarget) return false;
          return item.animeUrl !== animeUrl && item.animeTitle !== animeTitle;
        }));

        setSelectedIds((prev) => {
          const next = new Set(prev);
          idsToDelete.forEach(id => next.delete(id));
          return next;
        });
        useSyncStore.getState().triggerDebouncedSync();
      } catch (err) {
        console.error('Error removing anime from history:', err);
      }
    }
  };

  const toggleSelectId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`¿Eliminar los ${selectedIds.size} episodios seleccionados del historial?`)) {
      try {
        const idsToDelete = Array.from(selectedIds);
        await removeHistoryBatch(idsToDelete);
        setEntries((prev) => prev.filter((item) => !selectedIds.has(item.id)));
        setSelectedIds(new Set());
        setIsSelecting(false);
        useSyncStore.getState().triggerDebouncedSync();
      } catch (err) {
        console.error('Error deleting selected items:', err);
      }
    }
  };

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Principal */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary-glow)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock size={24} color="var(--accent-primary)" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Historial de Reproducción</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '2px 0 0' }}>
              {activeProfile ? `Perfil: ${activeProfile.name} · ` : ''}{groupedAnimes.length} series · {entries.length} episodios
            </p>
          </div>
        </div>

        {/* Barra de Acciones y Búsqueda */}
        {entries.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Buscador Rápido */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', padding: '6px 12px', width: 220,
            }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                type="text"
                placeholder="Buscar en historial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent', border: 'none', color: 'white',
                  fontSize: 12, outline: 'none', width: '100%',
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Modo Selección */}
            <button
              onClick={() => {
                setIsSelecting(!isSelecting);
                if (isSelecting) setSelectedIds(new Set());
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                background: isSelecting ? 'var(--accent-primary)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: isSelecting ? 'white' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              <CheckSquare size={16} />
              {isSelecting ? 'Modo Gestión Activo' : 'Seleccionar'}
            </button>

            {/* Botón Borrar Todo */}
            {!isSelecting && (
              <button
                onClick={handleClear}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 'var(--radius-md)',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <Trash2 size={16} />
                Borrar Todo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Barra Flotante de Selección Múltiple */}
      <AnimatePresence>
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedIds.size} de {filteredEntries.length} episodios seleccionados
              </span>
              <button
                onClick={handleSelectAll}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 10px',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {selectedIds.size === filteredEntries.length ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 'var(--radius-md)',
                  background: selectedIds.size > 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
                  border: 'none', color: 'white', fontSize: 13, fontWeight: 700,
                  cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  opacity: selectedIds.size > 0 ? 1 : 0.5,
                  transition: 'all 0.15s ease',
                }}
              >
                <Trash2 size={15} />
                Eliminar Seleccionados ({selectedIds.size})
              </button>

              <button
                onClick={() => {
                  setIsSelecting(false);
                  setSelectedIds(new Set());
                }}
                style={{
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '7px 12px',
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 className="animate-spin" size={32} color="var(--accent-primary)" />
        </div>
      ) : groupedAnimes.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 20px', background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
        }}>
          <History size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
            {searchQuery ? 'No se encontraron resultados' : 'Sin historial aún'}
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>
            {searchQuery
              ? `No hay series que coincidan con "${searchQuery}"`
              : 'Los animes que reproduzcas aparecerán aquí automáticamente agrupados por serie con tu progreso.'}
          </p>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)', color: 'white', border: '1px solid var(--border-subtle)',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              Limpiar Búsqueda
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '10px 20px', borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)', color: 'white', border: 'none',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
              }}
            >
              Explorar Catálogo
            </button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 18,
        }}>
          {groupedAnimes.map((group) => {
            const entry = group.latestEpisode;
            const pct = Math.min(100, Math.max(0, Math.round((entry.watchProgress || 0) * 100)));
            const isCompleted = entry.watchProgress >= 0.85;
            const isExpanded = expandedAnimeKeys.has(group.key);
            const anySelectedInGroup = group.episodes.some(ep => selectedIds.has(ep.id));

            return (
              <motion.div
                key={group.key}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.2 }}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: anySelectedInGroup ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                {/* Cabecera / Miniatura de la Serie */}
                <div
                  onClick={() => {
                    if (isSelecting) {
                      toggleSelectId(entry.id);
                    } else {
                      navigate(`/player?url=${encodeURIComponent(entry.episodeUrl)}&title=${encodeURIComponent(entry.animeTitle)}&ep=${entry.episodeNumber}&source=${entry.source}&animeUrl=${encodeURIComponent(entry.animeUrl)}`);
                    }
                  }}
                  style={{ position: 'relative', height: 160, background: 'var(--bg-elevated)', cursor: 'pointer' }}
                >
                  <CachedImage
                    src={entry.thumbnailUrl}
                    alt={entry.animeTitle}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.5) 100%)',
                  }} />

                  {/* Top-Left: Badge de Fuente o Checkbox */}
                  {isSelecting ? (
                    <div
                      onClick={(e) => toggleSelectId(entry.id, e)}
                      style={{
                        position: 'absolute', top: 8, left: 8,
                        background: selectedIds.has(entry.id) ? 'var(--accent-primary)' : 'rgba(0,0,0,0.7)',
                        borderRadius: 6, padding: '4px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', cursor: 'pointer', zIndex: 5,
                      }}
                    >
                      {selectedIds.has(entry.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                    </div>
                  ) : (
                    <div style={{
                      position: 'absolute', top: 8, left: 8,
                      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
                      padding: '3px 8px', borderRadius: 6,
                      fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {entry.source}
                    </div>
                  )}

                  {/* Top-Right: Acciones Rápidas */}
                  {!isSelecting && (
                    <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 6, zIndex: 5 }}>
                      <button
                        onClick={(e) => handleDeleteEntireAnime(entry.animeUrl, entry.animeTitle, e)}
                        title={`Eliminar toda la serie "${entry.animeTitle}" del historial`}
                        style={{
                          background: 'rgba(0,0,0,0.65)', border: 'none',
                          color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                          width: 28, height: 28, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          backdropFilter: 'blur(6px)', transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444';
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                          e.currentTarget.style.background = 'rgba(0,0,0,0.65)';
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}

                  {/* Bottom: Último Episodio Visto */}
                  <div style={{
                    position: 'absolute', bottom: 8, left: 10, right: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{
                      background: 'var(--accent-primary)', color: 'white',
                      padding: '3px 8px', borderRadius: '4px', fontSize: 11, fontWeight: 700,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Play size={10} fill="white" /> Reanudar Ep. {entry.episodeNumber}
                    </span>
                    <span style={{
                      color: isCompleted ? '#34d399' : 'rgba(255,255,255,0.9)',
                      fontSize: 11, fontWeight: 700,
                      background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 4,
                    }}>
                      {pct}%
                    </span>
                  </div>

                  {/* Barra de Progreso Inferior */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
                    background: 'rgba(255,255,255,0.2)',
                  }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: isCompleted ? '#34d399' : 'var(--accent-primary)' }} />
                  </div>
                </div>

                {/* Contenido Informativo del Card */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    title={entry.animeTitle}
                    onClick={() => navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`)}
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'pointer',
                    }}
                  >
                    {entry.animeTitle}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Último visto: <strong style={{ color: 'var(--accent-primary)' }}>Ep. {entry.episodeNumber}</strong>
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {new Date(group.latestWatchedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Botón Acordeón de Episodios Vistos */}
                  <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={(e) => toggleExpandAnime(group.key, e)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: isExpanded ? 'var(--bg-elevated)' : 'transparent',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px',
                        color: 'var(--text-secondary)',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>Capítulos vistos ({group.episodes.length})</span>
                      {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>

                    {/* Desplegable de Capítulos */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          style={{
                            marginTop: 6,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            maxHeight: 180,
                            overflowY: 'auto',
                            paddingRight: 2,
                          }}
                        >
                          {group.episodes.map(ep => {
                            const epPct = Math.min(100, Math.max(0, Math.round((ep.watchProgress || 0) * 100)));
                            const epCompleted = ep.watchProgress >= 0.85;
                            const isEpSel = selectedIds.has(ep.id);

                            return (
                              <div
                                key={ep.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '6px 8px',
                                  background: isEpSel ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-elevated)',
                                  borderRadius: 4,
                                  fontSize: 11,
                                }}
                              >
                                <div
                                  onClick={() => {
                                    if (isSelecting) toggleSelectId(ep.id);
                                    else navigate(`/player?url=${encodeURIComponent(ep.episodeUrl)}&title=${encodeURIComponent(ep.animeTitle)}&ep=${ep.episodeNumber}&source=${ep.source}&animeUrl=${encodeURIComponent(ep.animeUrl)}`);
                                  }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1, minWidth: 0 }}
                                >
                                  {isSelecting && (
                                    <div onClick={(e) => toggleSelectId(ep.id, e)} style={{ color: isEpSel ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                                      {isEpSel ? <CheckSquare size={13} /> : <Square size={13} />}
                                    </div>
                                  )}
                                  <Play size={10} color="var(--accent-primary)" />
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                    Episodio {ep.episodeNumber}
                                  </span>
                                  <span style={{ color: epCompleted ? '#34d399' : 'var(--text-muted)', fontSize: 10 }}>
                                    ({epPct}%)
                                  </span>
                                </div>

                                {!isSelecting && (
                                  <button
                                    onClick={(e) => handleDeleteEntry(ep.id, e)}
                                    title="Eliminar este episodio"
                                    style={{
                                      background: 'none', border: 'none',
                                      color: 'var(--text-muted)', cursor: 'pointer',
                                      padding: 2, display: 'flex', alignItems: 'center',
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Página de Favoritos Desktop
// ──────────────────────────────────────────
export function DesktopFavoritesPage() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const [favorites, setFavorites] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadFavs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getFavorites(activeProfile?.id);
      setFavorites(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    loadFavs();
    const handleSync = () => loadFavs();
    window.addEventListener('anics:sync-completed', handleSync);
    return () => window.removeEventListener('anics:sync-completed', handleSync);
  }, [loadFavs]);

  const handleRemove = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    try {
      await removeFavorite(url, activeProfile?.id);
      setFavorites(favorites.filter(f => f.url !== url));
      useSyncStore.getState().triggerDebouncedSync();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (url: string, newStatus: FavoriteStatus) => {
    try {
      await updateFavoriteStatus(url, newStatus, activeProfile?.id);
      setFavorites(prev => prev.map(f => f.url === url ? { ...f, status: newStatus } : f));
      useSyncStore.getState().triggerDebouncedSync();
    } catch (err) {
      console.error(err);
    }
  };

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: favorites.length, watching: 0, plan_to_watch: 0, completed: 0, favorite: 0 };
    for (const f of favorites) {
      const st = f.status || 'favorite';
      map[st] = (map[st] || 0) + 1;
    }
    return map;
  }, [favorites]);

  const displayedFavorites = useMemo(() => {
    if (statusFilter === 'all') return favorites;
    return favorites.filter(f => (f.status || 'favorite') === statusFilter);
  }, [favorites, statusFilter]);

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              {favorites.length} animes organizados por estado de seguimiento
            </p>
          </div>
        </div>

        {/* Pestañas de Filtro por Estado */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-surface)', padding: 4, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setStatusFilter('all')}
            style={{
              background: statusFilter === 'all' ? 'var(--accent-primary)' : 'transparent',
              color: statusFilter === 'all' ? 'white' : 'var(--text-secondary)',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '7px 14px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease',
            }}
          >
            Todos ({counts.all})
          </button>
          {FAVORITE_STATUSES.map(item => {
            const isSel = statusFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setStatusFilter(item.key)}
                style={{
                  background: isSel ? item.color : 'transparent',
                  color: isSel ? 'white' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 'var(--radius-md)', padding: '7px 14px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                {item.label} ({counts[item.key] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {!isLoading && displayedFavorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <BookmarkX size={48} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 700, margin: 0 }}>
            {statusFilter === 'all' ? 'No tienes animes favoritos' : `No tienes animes en estado "${FAVORITE_STATUSES.find(s => s.key === statusFilter)?.label || statusFilter}"`}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
            {statusFilter === 'all'
              ? 'Guarda tus animes preferidos haciendo clic en "Añadir a Favoritos" desde la vista de detalles.'
              : 'Puedes cambiar el estado de tus animes desde la tarjeta o en su vista de detalles.'}
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 18,
      }}>
        {displayedFavorites.map((anime) => {
          const currentStatus = (anime.status as FavoriteStatus) || 'favorite';

          return (
            <motion.div
              key={anime.url}
              whileHover={{ y: -4, scale: 1.01 }}
              onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
              style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
                position: 'relative', boxShadow: 'var(--shadow-card)',
                display: 'flex', flexDirection: 'column',
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
                    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#f87171', cursor: 'pointer', backdropFilter: 'blur(6px)',
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1, justifyContent: 'space-between' }}>
                <p style={{
                  fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  margin: 0, color: 'var(--text-primary)',
                }}>
                  {anime.title}
                </p>

                {/* Dropdown de Estado */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FavoriteStatusDropdown
                    currentStatus={currentStatus}
                    onSelectStatus={(newSt) => handleStatusChange(anime.url, newSt)}
                    size="sm"
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {anime.source}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
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
      saveLocalAnimeCover(anime.folderPath, anime.coverImage).catch(() => { });
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
          {/* Barra de Almacenamiento */}
          <div style={{ marginBottom: 16 }}>
            <StorageSpaceBar />
          </div>

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
