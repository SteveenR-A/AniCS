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
        <Heart size={20} color="var(--accent-primary)" fill="var(--accent-primary)" />
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
          <HeartOff size={40} color="var(--text-muted)" style={{ margin: '0 auto 8px', opacity: 0.5 }} />
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
                cursor: 'pointer', border: '1px solid var(--border-subtle)',
                position: 'relative', display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', overflow: 'hidden' }}>
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
                    dropDirection="up"
                  />
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
