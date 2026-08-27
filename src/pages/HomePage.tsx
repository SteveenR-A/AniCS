import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RefreshCw, Zap, TrendingUp, Film, Tv } from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { getLatest, getSchedule } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult } from '@/types';

function AnimeCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        transition: 'border-color var(--transition-fast)',
        position: 'relative',
      }}
    >
      {/* Thumbnail con Caché Local */}
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={36}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Overlay gradient */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%',
          background: 'linear-gradient(to top, rgba(10,11,15,0.9), transparent)',
        }} />

        {/* Episode badge */}
        {anime.episode && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 11, fontWeight: 700,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
          }}>
            Ep {anime.episode}
          </div>
        )}

        {/* Type badge */}
        {anime.animeType && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: anime.animeType === 'Donghua' ? 'var(--accent-secondary)' : 'var(--bg-overlay)',
            color: 'white', fontSize: 10, fontWeight: 600,
            padding: '2px 7px', borderRadius: 'var(--radius-full)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {anime.animeType}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.3, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
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
      border: '1px solid var(--border-subtle)',
    }}>
      <div className="skeleton" style={{ paddingBottom: '140%' }} />
      <div style={{ padding: '10px 12px 12px' }}>
        <div className="skeleton" style={{ height: 14, marginBottom: 6, borderRadius: 4 }} />
        <div className="skeleton" style={{ height: 11, width: '60%', borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { activeSource, latestEpisodes, setLatestEpisodes, schedule, setSchedule } = useAnimeStore();
  const [isLoading, setIsLoading] = useState(latestEpisodes.length === 0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [latest, sched] = await Promise.allSettled([
        getLatest(activeSource, 1),
        getSchedule(activeSource),
      ]);

      if (latest.status === 'fulfilled') setLatestEpisodes(latest.value);
      if (sched.status === 'fulfilled') setSchedule(sched.value);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeSource, setLatestEpisodes, setSchedule]);

  useEffect(() => {
    if (latestEpisodes.length === 0) {
      setIsLoading(true);
      load();
    }
  }, [activeSource, latestEpisodes.length, load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    load();
  };

  const handleAnimeClick = (anime: AnimeResult) => {
    navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, {
      state: { anime },
    });
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Tv size={20} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
              <span style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                AniCS
              </span>
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Últimos episodios · {activeSource === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRefresh}
          disabled={isRefreshing}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)', padding: '8px 16px',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500,
          }}
        >
          <RefreshCw size={15} style={{ animation: isRefreshing ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar
        </motion.button>
      </div>

      {/* Horario semanal (chips) */}
      {schedule.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={16} color="var(--accent-secondary)" />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Hoy en emisión
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {schedule.slice(0, 12).map((anime, i) => (
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

      {/* Últimos episodios */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Zap size={16} color="var(--accent-primary)" />
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Recientes
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 16,
        }}>
          {isLoading
            ? Array.from({ length: 18 }).map((_, i) => <SkeletonCard key={i} />)
            : latestEpisodes.map((anime, i) => (
                <motion.div
                  key={`${anime.url}-${i}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                >
                  <AnimeCard anime={anime} onClick={() => handleAnimeClick(anime)} />
                </motion.div>
              ))
          }
        </div>
      </section>
    </div>
  );
}
