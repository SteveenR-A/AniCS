import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Download, BookMarked, BookmarkCheck, Star, ChevronDown, ChevronUp, Film } from 'lucide-react';
import { getDetails, getServers, resolveStream } from '@/services/animeService';
import { addFavorite, removeFavorite, isFavorite as checkFavorite } from '@/services/storageService';
import { startDownload } from '@/services/downloadService';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { AnimeDetails, Episode, VideoServer } from '@/types';

export function DetailsPage() {
  const { url } = useParams<{ url: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const source = searchParams.get('source') ?? 'jkanime';
  const decodedUrl = decodeURIComponent(url ?? '');

  const [details, setDetails] = useState<AnimeDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAllEps, setShowAllEps] = useState(false);
  const [loadingEpisode, setLoadingEpisode] = useState<number | null>(null);

  const { openPlayer, setCurrentAnime, setCurrentEpisode, setServers, setIsLoadingServers } = usePlayerStore();

  useEffect(() => {
    const load = async () => {
      try {
        const [det, fav] = await Promise.all([
          getDetails(decodedUrl, source),
          checkFavorite(decodedUrl),
        ]);
        setDetails(det);
        setIsFavorite(fav);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [decodedUrl, source]);

  const handlePlayEpisode = async (ep: Episode) => {
    if (!details) return;
    setLoadingEpisode(ep.number);
    try {
      const servers = await getServers(ep.url, source);
      setCurrentAnime(details);
      setCurrentEpisode(ep);
      setServers(servers);
      openPlayer();
      navigate('/player');
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingEpisode(null);
    }
  };

  const handleDownload = async (ep: Episode) => {
    if (!details) return;
    try {
      const servers = await getServers(ep.url, source);
      const bestServer = servers.find(s => s.isDirect) ?? servers[0];
      if (!bestServer) return;
      const media = await resolveStream(bestServer, source);
      await startDownload({
        animeTitle: details.title,
        episodeNumber: ep.number,
        streamUrl: media.directUrl,
        referer: media.referer,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleFavorite = async () => {
    if (!details) return;
    try {
      if (isFavorite) {
        await removeFavorite(decodedUrl);
        setIsFavorite(false);
      } else {
        await addFavorite({
          title: details.title,
          url: decodedUrl,
          thumbnailUrl: details.thumbnailUrl,
          source: details.source,
        });
        setIsFavorite(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const visibleEps = showAllEps
    ? details?.episodes ?? []
    : (details?.episodes ?? []).slice(-24).reverse();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid var(--border-moderate)',
          borderTopColor: 'var(--accent-primary)',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (!details) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--text-muted)' }}>No se pudo cargar el anime.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Hero Banner */}
      <div style={{ position: 'relative', height: 320, overflow: 'hidden' }}>
        {details.thumbnailUrl && (
          <img
            src={details.thumbnailUrl}
            alt={details.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(20px) brightness(0.4)', transform: 'scale(1.1)' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 30%, var(--bg-base) 100%)',
        }} />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(10,11,15,0.7)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '8px 16px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500,
            backdropFilter: 'blur(12px)',
          }}
        >
          <ArrowLeft size={16} /> Volver
        </button>

        {/* Poster + Info superpuesto */}
        <div style={{
          position: 'absolute', bottom: -40, left: 24, right: 24,
          display: 'flex', gap: 20, alignItems: 'flex-end',
        }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: 120, height: 170, borderRadius: 'var(--radius-md)',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid var(--border-moderate)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {details.thumbnailUrl
              ? <img src={details.thumbnailUrl} alt={details.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Film size={36} /></div>
            }
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'white', lineHeight: 1.2, marginBottom: 8 }}>
              {details.title}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {details.rating && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-warning)', fontWeight: 600 }}>
                  <Star size={12} fill="currentColor" /> {details.rating.toFixed(1)}
                </span>
              )}
              {details.status && (
                <span style={{
                  background: details.status === 'En emisión' ? 'var(--accent-success)' : 'var(--bg-elevated)',
                  color: 'white', fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                }}>{details.status}</span>
              )}
              {details.year && (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{details.year}</span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '56px 24px 24px' }}>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => details.episodes.length > 0 && handlePlayEpisode(details.episodes[details.episodes.length - 1])}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              border: 'none', borderRadius: 'var(--radius-md)', padding: '12px',
              color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Play size={18} fill="white" /> Reproducir
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleToggleFavorite}
            style={{
              background: isFavorite ? 'var(--accent-primary-glow)' : 'var(--bg-surface)',
              border: `1px solid ${isFavorite ? 'var(--accent-primary)' : 'var(--border-moderate)'}`,
              borderRadius: 'var(--radius-md)', padding: '12px 16px',
              color: isFavorite ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {isFavorite ? <BookmarkCheck size={20} /> : <BookMarked size={20} />}
          </motion.button>
        </div>

        {/* Géneros */}
        {details.genres.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {details.genres.map((g) => (
              <span key={g} style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)', padding: '4px 12px',
                fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500,
              }}>{g}</span>
            ))}
          </div>
        )}

        {/* Sinopsis */}
        {details.synopsis && (
          <p style={{
            fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7,
            marginBottom: 28,
          }}>
            {details.synopsis}
          </p>
        )}

        {/* Episodios */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>
              Episodios <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({details.episodes.length})</span>
            </h2>
            {details.episodes.length > 24 && (
              <button
                onClick={() => setShowAllEps(v => !v)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--accent-primary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 13,
                }}
              >
                {showAllEps ? <><ChevronUp size={14} /> Menos</> : <><ChevronDown size={14} /> Ver todos</>}
              </button>
            )}
          </div>

          <div style={{
            display: 'grid', gap: 6,
            gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
          }}>
            <AnimatePresence>
              {visibleEps.map((ep) => (
                <motion.div
                  key={ep.number}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{
                    background: ep.watched ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                    border: `1px solid ${ep.watched ? 'var(--accent-primary-glow)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)', padding: '8px 10px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: ep.watched ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    Ep. {ep.number}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => handlePlayEpisode(ep)}
                      disabled={loadingEpisode === ep.number}
                      style={{
                        background: 'var(--accent-primary)', border: 'none',
                        borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: loadingEpisode === ep.number ? 0.6 : 1,
                      }}
                    >
                      <Play size={11} fill="white" color="white" />
                    </button>
                    <button
                      onClick={() => handleDownload(ep)}
                      style={{
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                        borderRadius: 6, padding: '4px 6px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Download size={11} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
