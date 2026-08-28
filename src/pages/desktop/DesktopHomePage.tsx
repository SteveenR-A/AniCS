import { useEffect, useState, useCallback, useMemo } from 'react';
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

        {anime.episode && anime.episode.toLowerCase().trim() !== 'donghua' && (
          <div style={{
            position: 'absolute', top: 10, right: 10,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 11, fontWeight: 700,
            padding: '3px 9px', borderRadius: 'var(--radius-full)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            {anime.episode.toLowerCase().startsWith('ep') ? anime.episode : `Ep ${anime.episode}`}
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
  const activeSource = useAnimeStore((s) => s.activeSource);

  const [latestList, setLatestList] = useState<AnimeResult[]>([]);
  const [scheduleList, setScheduleList] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (targetSource: string) => {
    setIsLoading(true);
    setLatestList([]);
    setScheduleList([]);
    try {
      const [latest, sched] = await Promise.allSettled([
        getLatest(targetSource, 1),
        getSchedule(targetSource),
      ]);

      // Si el usuario cambió de fuente mientras cargaba, descartamos la respuesta antigua
      if (useAnimeStore.getState().activeSource !== targetSource) {
        return;
      }

      if (latest.status === 'fulfilled') {
        const seen = new Set<string>();
        const sanitizedLatest = latest.value
          .map((a) => ({ ...a, source: targetSource }))
          .filter((a) => {
            const key = (a.url || a.title).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        setLatestList(sanitizedLatest);
      }
      if (sched.status === 'fulfilled') {
        const seen = new Set<string>();
        const uniqueSched = sched.value
          .map((a) => ({ ...a, source: targetSource }))
          .filter((a) => {
            const key = (a.url || a.title).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        setScheduleList(uniqueSched);
      }
    } catch (e) {
      console.error('Error cargando datos de inicio en Desktop', e);
    } finally {
      if (useAnimeStore.getState().activeSource === targetSource) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    load(activeSource);
  }, [activeSource, load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    load(activeSource);
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
            : latestList.map((anime, idx) => (
                <div key={`${anime.source}-${anime.url}-${idx}`}>
                  <AnimeCard anime={anime} onClick={() => handleAnimeClick(anime)} />
                </div>
              ))
          }
        </div>
      </section>
    </div>
  );
}
