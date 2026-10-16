import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Trash2, History, Play, RefreshCw, Search, ChevronDown, ChevronUp, Loader2, CheckSquare, Square, X, AlertTriangle } from 'lucide-react';
import { getHistory, clearHistory, removeHistory, removeHistoryBatch, removeHistoryByAnime, normalizeAnimeTitleKey } from '@/services/storageService';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { CachedImage } from '@/components/CachedImage';
import type { HistoryEntry } from '@/types';

export function DesktopHistoryPage() {
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
      if (useSyncStore.getState().config.userId && !useSyncStore.getState().isSyncPausedByLocalClear) {
        await syncNow();
      }
      await loadHistory();
    } catch (err) {
      console.error('Error al actualizar historial:', err);
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('¿Estás seguro de que deseas borrar todo el historial de este perfil?')) {
      return;
    }

    const clearCloudToo = confirm(
      '¿Deseas eliminar este historial también en tus otros dispositivos y en la nube?\n\n' +
      '• Aceptar: Borrar en todos los dispositivos sincronizados (nube y local).\n' +
      '• Cancelar: Borrar SOLO en este dispositivo (pausará la sincronización en este equipo para proteger la nube).'
    );

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Botón Actualizar */}
          <button
            onClick={handleRefresh}
            disabled={isManualRefreshing || isSyncing}
            title="Actualizar historial y sincronizar con la nube"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
              cursor: (isManualRefreshing || isSyncing) ? 'not-allowed' : 'pointer',
              transition: 'all var(--transition-fast)',
            }}
          >
            <RefreshCw
              size={15}
              style={{
                animation: (isManualRefreshing || isSyncing) ? 'spin 1s linear infinite' : 'none',
              }}
            />
            <span>Actualizar</span>
          </button>

          {entries.length > 0 && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Banner de Sincronización Pausada */}
      {isSyncPausedByLocalClear && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            marginBottom: 20,
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fbbf24', fontSize: 13 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Sincronización pausada en este equipo:</strong> El historial se borró localmente. La sincronización automática está detenida para no sobrescribir tus otros dispositivos.
            </span>
          </div>
          <button
            onClick={resumeSync}
            style={{
              background: '#f59e0b',
              border: 'none',
              borderRadius: '6px',
              color: 'black',
              fontWeight: 700,
              fontSize: 12,
              padding: '6px 14px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            Reanudar Sincronización
          </button>
        </div>
      )}

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
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
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
                  style={{ position: 'relative', width: '100%', aspectRatio: '2 / 3', background: 'var(--bg-elevated)', cursor: 'pointer' }}
                >
                  <CachedImage
                    src={entry.thumbnailUrl}
                    alt={entry.animeTitle}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
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
