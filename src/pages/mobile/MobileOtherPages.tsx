import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock, Trash2, Film, Bookmark, BookmarkX, Inbox, History,
  ArrowDownCircle, Play, Folder, Search, X, CheckSquare, Square, RefreshCw,
  ChevronDown, ChevronUp, Check, Eye, EyeOff, Pause, RotateCcw, Loader2, AlertCircle, Heart, AlertTriangle,
  CheckCircle2, Cloud, CloudOff
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  getHistory, clearHistory, removeHistory, removeHistoryBatch,
  removeHistoryByAnime, getFavorites, removeFavorite, updateFavoriteStatus,
  normalizeAnimeTitleKey
} from '@/services/storageService';
import {
  scanLocalDownloads, deleteLocalDownload, deleteLocalAnimeFolder,
  getDefaultDownloadDir, getLocalMediaUrl
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
// Página de Historial Móvil
// ──────────────────────────────────────────
export function MobileHistoryPage() {
  const navigate = useNavigate();
  const { activeProfile } = useProfileStore();
  const { isSyncing, isSyncPausedByLocalClear, resumeSync, syncNow, triggerDebouncedSync } = useSyncStore();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedAnimeKeys, setExpandedAnimeKeys] = useState<Set<string>>(new Set());
  const [showClearModal, setShowClearModal] = useState(false);

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
        // Priorizar títulos limpios sin caracteres corruptos (\uFFFD o )
        if (existing.animeTitle.includes('\uFFFD') && !entry.animeTitle.includes('\uFFFD')) {
          existing.animeTitle = entry.animeTitle;
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

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      if (useSyncStore.getState().config.githubToken && !useSyncStore.getState().isSyncPausedByLocalClear) {
        await syncNow();
      }
      await loadHistory();
    } catch (err) {
      console.error('Error al actualizar historial en móvil:', err);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const handleOpenClearModal = () => {
    setShowClearModal(true);
  };

  const handleConfirmClear = async (clearCloudToo: boolean) => {
    setShowClearModal(false);
    await clearHistory(activeProfile?.id);
    setEntries([]);
    setSelectedIds(new Set());
    setIsSelecting(false);

    if (clearCloudToo) {
      triggerDebouncedSync();
    } else {
      await useSyncStore.getState().pauseSyncByLocalClear();
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
    <div style={{ padding: '12px 14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1 }}>
          <Clock size={18} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Historial ({groupedAnimes.length})
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <button
            onClick={handleRefresh}
            disabled={isManualRefreshing || isSyncing}
            title="Actualizar y sincronizar historial"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 11, fontWeight: 700,
              borderRadius: 'var(--radius-full)', padding: '5px 8px',
              cursor: (isManualRefreshing || isSyncing) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <RefreshCw
              size={12}
              style={{
                animation: (isManualRefreshing || isSyncing) ? 'spin 1s linear infinite' : 'none',
              }}
            />
          </button>

          {entries.length > 0 && (
            <>
              <button
                onClick={() => {
                  setIsSelecting(!isSelecting);
                  if (isSelecting) setSelectedIds(new Set());
                }}
                style={{
                  background: isSelecting ? 'var(--accent-primary)' : 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: isSelecting ? 'white' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700,
                  borderRadius: 'var(--radius-full)', padding: '5px 9px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {isSelecting ? 'Listo' : 'Seleccionar'}
              </button>

              {!isSelecting && (
                <button
                  onClick={handleOpenClearModal}
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    fontSize: 11, fontWeight: 700,
                    borderRadius: 'var(--radius-full)', padding: '5px 9px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Trash2 size={11} />
                  <span>Borrar Todo</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Banner de Sincronización Pausada en Móvil */}
      {isSyncPausedByLocalClear && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            marginBottom: 12,
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fbbf24', fontSize: 11 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>Sincronización pausada por borrado local.</span>
          </div>
          <button
            onClick={resumeSync}
            style={{
              background: '#f59e0b',
              border: 'none',
              borderRadius: '4px',
              color: 'black',
              fontWeight: 700,
              fontSize: 11,
              padding: '4px 10px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Reanudar
          </button>
        </div>
      )}

      {entries.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)', padding: '8px 12px', marginBottom: 12,
        }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Buscar por anime o capítulo..."
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
      )}

      <AnimatePresence>
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--accent-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <button
              onClick={handleSelectAll}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)', padding: '4px 10px',
                color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {selectedIds.size === filteredEntries.length ? 'Deseleccionar Todos' : 'Todos'}
            </button>

            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              style={{
                background: selectedIds.size > 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
                border: 'none', color: 'white', fontSize: 11, fontWeight: 700,
                borderRadius: 'var(--radius-full)', padding: '5px 12px',
                cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Trash2 size={12} /> Eliminar ({selectedIds.size})
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <Loader2 className="animate-spin" size={28} color="var(--accent-primary)" />
        </div>
      ) : groupedAnimes.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 16px', background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)',
        }}>
          <History size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: '0 0 4px' }}>
            {searchQuery ? 'Sin resultados' : 'Sin historial aún'}
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px' }}>
            {searchQuery ? `No hay series que coincidan con "${searchQuery}"` : 'Los animes que reproduzcas aparecerán aquí agrupados'}
          </p>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                padding: '6px 14px', borderRadius: 'var(--radius-full)',
                background: 'var(--bg-elevated)', color: 'white', border: '1px solid var(--border-subtle)',
                fontWeight: 700, fontSize: 11, cursor: 'pointer',
              }}
            >
              Limpiar Búsqueda
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-full)',
                background: 'var(--accent-primary)', color: 'white', border: 'none',
                fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              Explorar Animes
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groupedAnimes.map((group) => {
            const entry = group.latestEpisode;
            const pct = Math.min(100, Math.max(0, Math.round((entry.watchProgress || 0) * 100)));
            const isExpanded = expandedAnimeKeys.has(group.key);
            const anySelected = group.episodes.some(ep => selectedIds.has(ep.id));

            return (
              <div
                key={group.key}
                style={{
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: anySelected ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: 10,
                  }}
                >
                  {isSelecting && (
                    <div
                      onClick={(e) => toggleSelectId(entry.id, e)}
                      style={{
                        color: selectedIds.has(entry.id) ? 'var(--accent-primary)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {selectedIds.has(entry.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>
                  )}

                  <div
                    onClick={() => {
                      if (isSelecting) toggleSelectId(entry.id);
                      else navigate(`/player?url=${encodeURIComponent(entry.episodeUrl)}&title=${encodeURIComponent(entry.animeTitle)}&ep=${entry.episodeNumber}&source=${entry.source}&animeUrl=${encodeURIComponent(entry.animeUrl)}`);
                    }}
                    style={{ position: 'relative', width: 56, height: 56, borderRadius: 6, overflow: 'hidden', flexShrink: 0, cursor: 'pointer' }}
                  >
                    <CachedImage src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
                      background: 'rgba(255,255,255,0.2)',
                    }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent-primary)' }} />
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      if (isSelecting) toggleSelectId(entry.id);
                      else navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`);
                    }}
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.animeTitle}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600, marginTop: 2 }}>
                      Episodio {entry.episodeNumber} · {pct}%
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {group.episodes.length} caps vistos · {new Date(group.latestWatchedAt).toLocaleDateString()}
                    </div>
                  </div>

                  {!isSelecting && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => navigate(`/player?url=${encodeURIComponent(entry.episodeUrl)}&title=${encodeURIComponent(entry.animeTitle)}&ep=${entry.episodeNumber}&source=${entry.source}&animeUrl=${encodeURIComponent(entry.animeUrl)}`)}
                        style={{
                          background: 'var(--accent-primary)',
                          border: 'none',
                          color: 'white',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        <Play size={10} fill="white" /> Reanudar
                      </button>

                      <button
                        onClick={(e) => handleDeleteEntireAnime(entry.animeUrl, entry.animeTitle, e)}
                        title="Eliminar serie"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          padding: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.15)' }}>
                  <button
                    onClick={(e) => toggleExpandAnime(group.key, e)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'transparent',
                      border: 'none',
                      padding: '5px 10px',
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>Ver {group.episodes.length} episodios vistos</span>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        style={{
                          padding: '4px 10px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        {group.episodes.map(ep => {
                          const epPct = Math.min(100, Math.max(0, Math.round((ep.watchProgress || 0) * 100)));
                          const isEpSel = selectedIds.has(ep.id);

                          return (
                            <div
                              key={ep.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '4px 6px',
                                background: isEpSel ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
                                borderRadius: 4,
                                fontSize: 11,
                              }}
                            >
                              <div
                                onClick={() => {
                                  if (isSelecting) toggleSelectId(ep.id);
                                  else navigate(`/player?url=${encodeURIComponent(ep.episodeUrl)}&title=${encodeURIComponent(ep.animeTitle)}&ep=${ep.episodeNumber}&source=${ep.source}&animeUrl=${encodeURIComponent(ep.animeUrl)}`);
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer' }}
                              >
                                {isSelecting && (
                                  <div onClick={(e) => toggleSelectId(ep.id, e)} style={{ color: isEpSel ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                                    {isEpSel ? <CheckSquare size={13} /> : <Square size={13} />}
                                  </div>
                                )}
                                <Play size={9} color="var(--accent-primary)" />
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  Episodio {ep.episodeNumber}
                                </span>
                                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                                  ({epPct}%)
                                </span>
                              </div>

                              {!isSelecting && (
                                <button
                                  onClick={(e) => handleDeleteEntry(ep.id, e)}
                                  title="Eliminar este capítulo"
                                  style={{
                                    background: 'none', border: 'none',
                                    color: 'var(--text-muted)', cursor: 'pointer', padding: 2,
                                  }}
                                >
                                  <Trash2 size={11} />
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
            );
          })}
        </div>
      )}

      {/* Modal de confirmación de seguridad para vaciar historial */}
      <AnimatePresence>
        {showClearModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setShowClearModal(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 400,
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid var(--border-moderate)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '16px 18px',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(239, 68, 68, 0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(239, 68, 68, 0.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-error)',
                    }}
                  >
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      Vaciar Historial
                    </h3>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Confirmación de seguridad</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowClearModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    padding: 4,
                    cursor: 'pointer',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  Elige cómo deseas vaciar los episodios reproducidos:
                </p>

                {/* Opción 1: Solo en este móvil */}
                <button
                  onClick={() => handleConfirmClear(false)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(59, 130, 246, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-primary)',
                      flexShrink: 0,
                    }}
                  >
                    <CloudOff size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                      Borrar solo en este móvil
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Pausa la sincronización y protege tu historial en la nube y en la PC.
                    </div>
                  </div>
                </button>

                {/* Opción 2: En todos lados y la nube */}
                <button
                  onClick={() => handleConfirmClear(true)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.06)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '12px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(239, 68, 68, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-error)',
                      flexShrink: 0,
                    }}
                  >
                    <Cloud size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-error)', marginBottom: 2 }}>
                      Borrar en todos los dispositivos y nube
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Elimina el historial aquí y propaga la eliminación a GitHub Gist y PC.
                    </div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '12px 18px 16px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => setShowClearModal(false)}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────
// Página de Favoritos Móvil (2 Columnas con Estados)
// ──────────────────────────────────────────
export function MobileFavoritesPage() {
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
    <div style={{ padding: '12px 14px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Bookmark size={20} color="var(--accent-primary)" />
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Favoritos ({favorites.length})</h2>
      </div>

      <div style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        marginBottom: 12,
        paddingBottom: 2,
      }}>
        <button
          onClick={() => setStatusFilter('all')}
          style={{
            background: statusFilter === 'all' ? 'var(--accent-primary)' : 'var(--bg-surface)',
            color: statusFilter === 'all' ? 'white' : 'var(--text-secondary)',
            border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)',
            padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
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
                background: isSel ? item.color : 'var(--bg-surface)',
                color: isSel ? 'white' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-full)',
                padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {item.label} ({counts[item.key] || 0})
            </button>
          );
        })}
      </div>

      {!isLoading && displayedFavorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
          <BookmarkX size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, margin: 0 }}>
            {statusFilter === 'all' ? 'No tienes favoritos' : `Sin animes en "${FAVORITE_STATUSES.find(s => s.key === statusFilter)?.label || statusFilter}"`}
          </p>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 10,
      }}>
        {displayedFavorites.map((anime) => {
          const currentStatus = (anime.status as FavoriteStatus) || 'favorite';

          return (
            <motion.div
              key={anime.url}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
              style={{
                background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
                position: 'relative', display: 'flex', flexDirection: 'column',
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
              <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1, justifyContent: 'space-between' }}>
                <p style={{
                  fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  margin: 0,
                }}>
                  {anime.title}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FavoriteStatusDropdown
                    currentStatus={currentStatus}
                    onSelectStatus={(newSt) => handleStatusChange(anime.url, newSt)}
                    size="sm"
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
// Página de Descargas Móvil
// ──────────────────────────────────────────
export function MobileDownloadsPage() {
  const navigate = useNavigate();
  const {
    tasks, pauseTask, resumeTask, retryTask, cancelTask, removeTask, clearCompletedTasks,
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
  const completedOrCanceledTasks = taskList.filter(t => t.status === 'completed' || t.status === 'canceled');

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Barra de Almacenamiento */}
      <div style={{ marginBottom: 12 }}>
        <StorageSpaceBar />
      </div>

      {/* Header Móvil Tabs & Refresh */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
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
        <button
          onClick={() => loadLocalFolders()}
          disabled={isScanning}
          title="Escanear y actualizar descargas"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)',
            padding: '7px 11px',
            fontSize: 12,
            fontWeight: 600,
            cursor: isScanning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isScanning ? 0.7 : 1,
          }}
        >
          <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* TAB 1: Carpetas en Móvil */}
      {activeTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isScanning && animeFolders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 16px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
              <Loader2 size={36} color="var(--accent-primary)" style={{ margin: '0 auto 8px', animation: 'spin-slow 1s linear infinite' }} />
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Escaneando descargas locales...</p>
            </div>
          ) : animeFolders.length === 0 ? (
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
          {completedOrCanceledTasks.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
              <button
                onClick={() => clearCompletedTasks()}
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-full)',
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <CheckCircle2 size={13} />
                <span>Limpiar completadas ({completedOrCanceledTasks.length})</span>
              </button>
            </div>
          )}
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
