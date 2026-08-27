import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Trophy, RefreshCw, Star } from 'lucide-react';
import { getTopAnimes } from '@/services/animeService';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult } from '@/types';

export function DesktopTopAnimePage() {
  const navigate = useNavigate();
  const { activeSource, getTopList, setTopList } = useAnimeStore();

  const cachedTop = getTopList(activeSource);
  const [topList, setLocalTopList] = useState<AnimeResult[]>(() => cachedTop ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedTop || cachedTop.length === 0);

  useEffect(() => {
    const fresh = getTopList(activeSource);
    if (fresh && fresh.length > 0) {
      setLocalTopList(fresh);
      setIsLoading(false);
    } else {
      setLocalTopList([]);
      setIsLoading(true);
    }
  }, [activeSource, getTopList]);

  const loadTop = useCallback(async () => {
    try {
      const cached = getTopList(activeSource);
      if (!cached || cached.length === 0) {
        setIsLoading(true);
      }
      const res = await getTopAnimes(activeSource);
      setTopList(res, activeSource);
      setLocalTopList(res);
    } catch (e) {
      console.error('Failed to load top animes in Desktop', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeSource, getTopList, setTopList]);

  useEffect(() => {
    const cached = getTopList(activeSource);
    if (!cached || cached.length === 0) {
      setIsLoading(true);
      loadTop();
    }
  }, [activeSource, getTopList, loadTop]);

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Desktop */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 32, flexWrap: 'wrap', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
          }}>
            <Trophy size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              Top Animes & Ranking
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              Los animes más valorados y aclamados por la comunidad · {activeSource === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
            </p>
          </div>
        </div>

        <button
          onClick={loadTop}
          disabled={isLoading}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)', padding: '10px 18px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar ranking
        </button>
      </div>

      {/* Grid Desktop */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div style={{ paddingBottom: '140%', background: 'var(--bg-elevated)', animation: 'pulse-slow 1.5s infinite ease-in-out' }} />
              <div style={{ padding: 14 }}>
                <div style={{ height: 16, background: 'var(--bg-elevated)', borderRadius: 4, width: '80%', marginBottom: 8 }} />
                <div style={{ height: 12, background: 'var(--bg-elevated)', borderRadius: 4, width: '50%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : topList.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Flame size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>No se pudo cargar el Top</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Verifica tu conexión y presiona Actualizar.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 20,
        }}>
          {topList.map((anime, index) => {
            const rank = index + 1;
            const isGold = rank === 1;
            const isSilver = rank === 2;
            const isBronze = rank === 3;

            return (
              <motion.div
                key={anime.url}
                whileHover={{ y: -6, scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, { state: { anime } })}
                style={{
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
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
                  boxShadow: isGold
                    ? '0 8px 24px rgba(245,158,11,0.2)'
                    : 'var(--shadow-card)',
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
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(to top, rgba(10,11,15,0.95) 0%, transparent 60%)',
                  }} />

                  <div style={{
                    position: 'absolute', top: 10, left: 10,
                    background: isGold
                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                      : isSilver
                      ? 'linear-gradient(135deg, #9ca3af, #4b5563)'
                      : isBronze
                      ? 'linear-gradient(135deg, #b45309, #78350f)'
                      : 'rgba(10,11,15,0.85)',
                    color: 'white',
                    padding: '4px 10px', borderRadius: 'var(--radius-full)',
                    fontSize: 12, fontWeight: 900,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    {isGold ? '👑 #1' : isSilver ? '🥈 #2' : isBronze ? '🥉 #3' : `#${rank}`}
                  </div>

                  {anime.animeType && (
                    <div style={{
                      position: 'absolute', bottom: 10, right: 10,
                      background: 'rgba(10,11,15,0.85)',
                      color: '#fbbf24', fontSize: 11, fontWeight: 800,
                      padding: '3px 8px', borderRadius: 'var(--radius-full)',
                      backdropFilter: 'blur(6px)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Star size={11} fill="#fbbf24" /> {anime.animeType.replace('#', '')}
                    </div>
                  )}
                </div>

                <div style={{ padding: '14px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <h4 style={{
                    fontSize: 14, fontWeight: 700, lineHeight: 1.35,
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
