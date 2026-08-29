import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, RefreshCw, Star, Flame } from 'lucide-react';
import { getTopAnimes } from '@/services/animeService';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult } from '@/types';

export function MobileTopAnimePage() {
  const navigate = useNavigate();
  const activeSource = useAnimeStore((s) => s.activeSource);

  const [topList, setTopList] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadTop = useCallback(async (targetSource: string) => {
    setIsLoading(true);
    setTopList([]);
    try {
      const res = await getTopAnimes(targetSource);

      if (useAnimeStore.getState().activeSource !== targetSource) {
        return;
      }

      const seen = new Set<string>();
      const sanitized = res
        .map((a) => ({ ...a, source: targetSource }))
        .filter((a) => {
          const key = (a.url || a.title).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      setTopList(sanitized);
    } catch (e) {
      console.error('Failed to load top animes in Mobile', e);
    } finally {
      if (useAnimeStore.getState().activeSource === targetSource) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTop(activeSource);
  }, [activeSource, loadTop]);

  const isDonghua = activeSource === 'mundodonghua';

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Header Móvil */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Trophy size={15} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              {isDonghua ? 'Top Donghuas' : 'Top Ranking'}
            </h2>
          </div>
        </div>

        <button
          onClick={() => loadTop(activeSource)}
          disabled={isLoading}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-full)', padding: '5px 12px',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
          }}
        >
          <RefreshCw size={12} style={{ animation: isLoading ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      {/* Grid 2 Columnas Móvil */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div style={{ paddingBottom: '140%', background: 'var(--bg-elevated)', animation: 'pulse-slow 1.5s infinite ease-in-out' }} />
              <div style={{ padding: 10 }}>
                <div style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 4, width: '80%', marginBottom: 6 }} />
                <div style={{ height: 10, background: 'var(--bg-elevated)', borderRadius: 4, width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : topList.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 16px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Flame size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            No se pudo cargar el Top.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
        }}>
          {topList.map((anime, index) => {
            const rank = index + 1;
            const isGold = rank === 1;
            const isSilver = rank === 2;
            const isBronze = rank === 3;

            return (
              <motion.div
                key={`${anime.source}-${anime.url}-${index}`}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, { state: { anime } })}
                style={{
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden', cursor: 'pointer',
                  border: isGold
                    ? '1.5px solid rgba(245,158,11,0.6)'
                    : isSilver
                    ? '1.5px solid rgba(156,163,175,0.6)'
                    : isBronze
                    ? '1.5px solid rgba(217,119,6,0.6)'
                    : '1px solid var(--border-subtle)',
                  display: 'flex', flexDirection: 'column',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
                  <CachedImage
                    src={anime.thumbnailUrl}
                    alt={anime.title}
                    fallbackIconSize={30}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />

                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 60%)',
                  }} />

                  {/* Badge de Ranking Móvil */}
                  <div style={{
                    position: 'absolute', top: 6, left: 6,
                    background: isGold
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : isSilver
                      ? 'linear-gradient(135deg, #9ca3af, #4b5563)'
                      : isBronze
                      ? 'linear-gradient(135deg, #b45309, #78350f)'
                      : 'rgba(10,11,15,0.85)',
                    color: 'white',
                    padding: '2px 7px', borderRadius: 'var(--radius-full)',
                    fontSize: 10, fontWeight: 800,
                  }}>
                    {`#${rank}`}
                  </div>

                  {anime.animeType && (
                    <div style={{
                      position: 'absolute', bottom: 6, right: 6,
                      background: 'rgba(10,11,15,0.85)',
                      color: '#fbbf24', fontSize: 9, fontWeight: 800,
                      padding: '2px 6px', borderRadius: 'var(--radius-full)',
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      <Star size={9} fill="#fbbf24" /> {anime.animeType.replace('#', '')}
                    </div>
                  )}
                </div>

                <div style={{ padding: '8px 10px 10px' }}>
                  <h4 style={{
                    fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    margin: 0, color: 'var(--text-primary)',
                  }}>
                    {anime.title}
                  </h4>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
