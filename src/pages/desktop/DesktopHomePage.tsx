import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Zap, TrendingUp, Tv } from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { getLatest, getSchedule } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult } from '@/types';

function AnimeCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        transition: 'all var(--transition-fast)',
        position: 'relative',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={40}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(to top, rgba(10,11,15,0.95), transparent)',
        }} />

        {anime.episode && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 11, fontWeight: 700,
            padding: '3px 9px', borderRadius: 'var(--radius-full)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            Ep {anime.episode}
          </div>
        )}

        {anime.animeType && (
          <div style={{
            position: 'absolute', top: 10, left: 10,
            background: anime.animeType === 'Donghua' ? 'var(--accent-secondary)' : 'rgba(10,11,15,0.75)',
            color: 'white', fontSize: 10, fontWeight: 600,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {anime.animeType}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <p style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
          lineHeight: 1.35, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          margin: 0,
        }}>
          {anime.title}
        </p>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      <div className="skeleton" style={{ paddingBottom: '140%' }} />
      <div style={{ padding: '12px 14px' }}>
        <div className="skeleton" style={{ height: 16, marginBottom: 8, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function DesktopHomePage() {
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
      console.error('Error cargando datos de inicio en Desktop', e);
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
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Desktop */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
          }}>
            <Tv size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                AniCS
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)', marginLeft: 10 }}>
                · {isDonghua ? 'MundoDonghua' : 'JKAnime'}
              </span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              {isDonghua
                ? 'Catálogo de Donghuas y animación en emisión · Actualizado al instante'
                : 'Catálogo de Anime japonés en emisión · Actualizado al instante'}
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)', padding: '10px 20px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar catálogo
        </motion.button>
      </div>

      {/* Sección 1: En Emisión */}
      {scheduleList.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <TrendingUp size={18} color="var(--accent-primary)" />
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: 0 }}>
              {isDonghua ? 'Donghuas en Emisión Oficial' : 'En Emisión Hoy'}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {scheduleList.slice(0, 16).map((anime, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleAnimeClick(anime)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '6px 14px',
                  color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  transition: 'all var(--transition-fast)',
                }}
              >
                {anime.title}
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {/* Grid de Últimos Episodios Desktop */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <Zap size={16} color="var(--accent-primary)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Últimos Episodios Estrenados
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
          gap: 18,
        }}>
          {isLoading
            ? Array.from({ length: 18 }).map((_, i) => <SkeletonCard key={i} />)
            : latestList.map((anime) => (
                <div key={anime.url}>
                  <AnimeCard anime={anime} onClick={() => handleAnimeClick(anime)} />
                </div>
              ))
          }
        </div>
      </section>
    </div>
  );
}
