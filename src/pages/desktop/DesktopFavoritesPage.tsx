import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trash2, HeartOff, Heart } from 'lucide-react';
import { getFavorites, removeFavorite, updateFavoriteStatus } from '@/services/storageService';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { CachedImage } from '@/components/CachedImage';
import { FavoriteStatusDropdown, FAVORITE_STATUSES } from '@/components/FavoriteStatusDropdown';
import type { AnimeResult, FavoriteStatus } from '@/types';

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
            <Heart size={22} fill="currentColor" />
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
          <HeartOff size={48} color="var(--text-muted)" style={{ margin: '0 auto 12px', opacity: 0.5 }} />
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
                cursor: 'pointer', border: '1px solid var(--border-subtle)',
                position: 'relative', boxShadow: 'var(--shadow-card)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', overflow: 'hidden' }}>
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
                    dropDirection="up"
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                    {anime.source === 'mundodonghua' ? 'Donghua' : 'Anime'}
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
