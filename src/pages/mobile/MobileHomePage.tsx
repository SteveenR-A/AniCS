import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Zap, TrendingUp } from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { getLatest, getSchedule } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult } from '@/types';

function MobileAnimeCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={32}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(to top, rgba(10,11,15,0.95), transparent)',
        }} />

        {anime.episode && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 'var(--radius-full)',
          }}>
            Ep {anime.episode}
          </div>
        )}

        {anime.animeType && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: anime.animeType === 'Donghua' ? 'var(--accent-secondary)' : 'rgba(10,11,15,0.75)',
            color: 'white', fontSize: 9, fontWeight: 600,
            padding: '2px 6px', borderRadius: 'var(--radius-full)',
            backdropFilter: 'blur(6px)',
          }}>
            {anime.animeType}
          </div>
        )}
      </div>

      <div style={{ padding: '8px 10px 10px' }}>
        <p style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.25, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          margin: 0,
        }}>
          {anime.title}
        </p>
      </div>
    </motion.div>
  );
}

function MobileSkeletonCard() {
  return (
    <div style={{
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      <div className="skeleton" style={{ paddingBottom: '140%' }} />
      <div style={{ padding: '8px 10px' }}>
        <div className="skeleton" style={{ height: 12, marginBottom: 6, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 10, width: '60%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function MobileHomePage() {
  const navigate = useNavigate();
  const {
    activeSource,
    getLatestEpisodes, setLatestEpisodes,
    getSchedule: getScheduleStore, setSchedule,
  } = useAnimeStore();

  const cachedLatest = getLatestEpisodes(activeSource);
  const cachedSchedule = getScheduleStore(activeSource);

  const [latestList, setLatestList] = useState<AnimeResult[]>(() => cachedLatest ?? []);
  const [scheduleList, setScheduleList] = useState<AnimeResult[]>(() => cachedSchedule ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedLatest || cachedLatest.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [latest, sched] = await Promise.allSettled([
        getLatest(activeSource, 1),
        getSchedule(activeSource),
      ]);

      if (latest.status === 'fulfilled') {
        setLatestEpisodes(latest.value, activeSource);
        setLatestList(latest.value);
      }
      if (sched.status === 'fulfilled') {
        const seen = new Set<string>();
        const uniqueSched = sched.value.filter((a) => {
          const key = (a.url || a.title).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSchedule(uniqueSched, activeSource);
        setScheduleList(uniqueSched);
      }
    } catch (e) {
      console.error('Error cargando datos de inicio en Móvil', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeSource, setLatestEpisodes, setSchedule]);

  useEffect(() => {
    const freshLatest = getLatestEpisodes(activeSource);
    const freshSchedule = getScheduleStore(activeSource);
    if (freshLatest && freshLatest.length > 0) {
      setLatestList(freshLatest);
      setIsLoading(false);
    } else {
      setLatestList([]);
      setIsLoading(true);
    }
    if (freshSchedule && freshSchedule.length > 0) {
      setScheduleList(freshSchedule);
    } else {
      setScheduleList([]);
    }

    if (!freshLatest || freshLatest.length === 0 || !freshSchedule || freshSchedule.length === 0) {
      load();
    }
  }, [activeSource, getLatestEpisodes, getScheduleStore, load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    load();
  };

  const handleAnimeClick = (anime: AnimeResult) => {
    navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, {
      state: { anime },
    });
  };

  const isDonghua = activeSource === 'mundodonghua';

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Header Móvil */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            AniCS · {isDonghua ? 'MundoDonghua' : 'JKAnime'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '2px 0 0' }}>
            {isDonghua ? 'Donghuas y animación china' : 'Episodios estrenados al instante'}
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '6px 12px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
          }}
        >
          <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      {/* Sección 1: En Emisión (Scroll Horizontal Móvil) */}
      {scheduleList.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <TrendingUp size={14} color="var(--accent-primary)" />
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {isDonghua ? 'Donghuas en Emisión' : 'En Emisión Hoy'}
            </span>
          </div>
          <div style={{
            display: 'flex', gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
            scrollbarWidth: 'none',
          }}>
            {scheduleList.slice(0, 16).map((anime, i) => (
              <button
                key={i}
                onClick={() => handleAnimeClick(anime)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '5px 12px',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {anime.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Grid 2 Columnas para Teléfono */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Zap size={14} color="var(--accent-primary)" />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Recientes
          </span>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
        }}>
          {isLoading
            ? Array.from({ length: 10 }).map((_, i) => <MobileSkeletonCard key={i} />)
            : latestList.map((anime) => (
                <div key={anime.url}>
                  <MobileAnimeCard anime={anime} onClick={() => handleAnimeClick(anime)} />
                </div>
              ))
          }
        </div>
      </section>
    </div>
  );
}
