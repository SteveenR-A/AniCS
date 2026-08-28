import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Download, Bookmark, BookmarkCheck,
  ChevronDown, ChevronUp, Check,
  Calendar, Layers, Tag, Tv, Globe, Sparkles, Clock
} from 'lucide-react';
import { getDetails, getServers, resolveStream } from '@/services/animeService';
import { addFavorite, removeFavorite, isFavorite as checkFavorite } from '@/services/storageService';
import { startDownload } from '@/services/downloadService';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeDetails, Episode, VideoServer } from '@/types';

export function MobileDetailsPage() {
  const { url } = useParams<{ url: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const source = searchParams.get('source') ?? 'jkanime';
  const decodedUrl = decodeURIComponent(url ?? '');

  const { getCachedDetails, cacheDetails } = useAnimeStore();
  const cached = getCachedDetails(decodedUrl);
  const passedAnime = location.state?.anime;

  const [details, setDetails] = useState<AnimeDetails | null>(() => {
    if (cached) return cached;
    if (passedAnime) {
      return {
        title: passedAnime.title,
        url: passedAnime.url,
        thumbnailUrl: passedAnime.thumbnailUrl,
        synopsis: passedAnime.synopsis || 'Cargando información del anime...',
        genres: passedAnime.genres || [],
        status: passedAnime.status,
        animeType: passedAnime.animeType,
        episodes: passedAnime.episodes || [],
        source: passedAnime.source || source,
      };
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(!cached && (!passedAnime || !passedAnime.episodes?.length));
  const [isFavorite, setIsFavorite] = useState(false);
  const [showAllEps, setShowAllEps] = useState(false);
  const [epSearch, setEpSearch] = useState('');
  const [loadingEpisode, setLoadingEpisode] = useState<number | null>(null);

  // Modal de selección de servidor para descarga en móvil
  const [downloadModalEp, setDownloadModalEp] = useState<Episode | null>(null);
  const [downloadServers, setDownloadServers] = useState<VideoServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [selectedDownloadServer, setSelectedDownloadServer] = useState<VideoServer | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  const { openPlayer, setCurrentAnime, setCurrentEpisode, setServers } = usePlayerStore();

  useEffect(() => {
    const load = async () => {
      if (cached && cached.episodes && cached.episodes.length > 0) {
        setDetails(cached);
        setIsLoading(false);
        checkFavorite(decodedUrl).then(setIsFavorite).catch(() => {});
        return;
      }

      if (!passedAnime || !passedAnime.episodes?.length) {
        setIsLoading(true);
      }
      try {
        const [det, fav] = await Promise.all([
          getDetails(decodedUrl, source),
          checkFavorite(decodedUrl),
        ]);
        setDetails(det);
        cacheDetails(det);
        setIsFavorite(fav);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [decodedUrl, source, cached, cacheDetails]);

  const handlePlayEpisode = async (ep: Episode) => {
    if (!details) return;
    setLoadingEpisode(ep.number);
    try {
      const servers = await getServers(ep.url, source);
      setCurrentAnime(details);
      setCurrentEpisode(ep);
      setServers(servers);
      openPlayer();
      navigate(`/player?url=${encodeURIComponent(details.url)}&ep=${ep.number}&source=${source}`);
    } catch (e) {
      console.error(e);
      navigate(`/player?url=${encodeURIComponent(details.url)}&ep=${ep.number}&source=${source}`);
    } finally {
      setLoadingEpisode(null);
    }
  };

  const handleOpenDownloadModal = async (ep: Episode) => {
    setDownloadModalEp(ep);
    setIsLoadingServers(true);
    setSelectedDownloadServer(null);
    try {
      const servers = await getServers(ep.url, source);
      setDownloadServers(servers);
      const direct = servers.find(s => s.isDirect) ?? servers[0];
      if (direct) setSelectedDownloadServer(direct);
    } catch (e) {
      console.error('Failed to load download servers', e);
    } finally {
      setIsLoadingServers(false);
    }
  };

  const handleConfirmDownload = async () => {
    if (!details || !downloadModalEp || !selectedDownloadServer) return;
    if (isStartingDownload) return; // guardia anti-doble-clic

    // Verificar que no hay ya una descarga activa para este mismo episodio
    const existingTasks = useDownloadStore.getState().tasks;
    const alreadyDownloading = Array.from(existingTasks.values()).some(
      t => t.animeTitle === details.title &&
           t.episodeNumber === downloadModalEp.number &&
           (t.status === 'downloading' || t.status === 'queued')
    );
    if (alreadyDownloading) {
      setDownloadModalEp(null);
      setDownloadSuccessToast(`Ep. ${downloadModalEp.number} ya se está descargando`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
      return;
    }

    setIsStartingDownload(true);
    try {
      const media = await resolveStream(selectedDownloadServer, source);
      const downloadId = await startDownload({
        animeTitle: details.title,
        episodeNumber: downloadModalEp.number,
        streamUrl: media.directUrl,
        referer: media.referer,
      });

      useDownloadStore.getState().addTask({
        id: downloadId,
        animeTitle: details.title,
        episodeNumber: downloadModalEp.number,
        streamUrl: media.directUrl,
        outputPath: '',
        progress: 0,
        speedKbps: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'downloading',
      });

      setDownloadModalEp(null);
      setDownloadSuccessToast(`Descarga iniciada: Ep. ${downloadModalEp.number}`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (e) {
      console.error('Error starting download', e);
    } finally {
      setIsStartingDownload(false);
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

  const handleGenreClick = (genreName: string) => {
    navigate(`/search?genre=${encodeURIComponent(genreName.toLowerCase())}&source=${source}`);
  };

  const allEps = details?.episodes ?? [];
  const filteredEps = epSearch.trim()
    ? allEps.filter(ep => ep.number.toString().includes(epSearch.trim()) || (ep.title && ep.title.toLowerCase().includes(epSearch.toLowerCase())))
    : allEps;

  const visibleEps = showAllEps
    ? filteredEps
    : filteredEps.slice(0, 36);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '70vh' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          border: '3px solid var(--border-subtle)',
          borderTopColor: 'var(--accent-primary)',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (!details) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No se pudo cargar la información de este anime.</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 14, padding: '8px 16px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13,
          }}
        >
          Volver atrás
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', minHeight: '100%' }}>
      {/* Toast de descarga */}
      <AnimatePresence>
        {downloadSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'fixed', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: 16, right: 16,
              background: 'rgba(16, 185, 129, 0.95)', backdropFilter: 'blur(16px)',
              color: 'white', padding: '10px 16px', borderRadius: 'var(--radius-full)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 100,
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)', fontSize: 12, fontWeight: 700,
            }}
          >
            <Check size={14} /> {downloadSuccessToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Banner Táctil con Blur */}
      <div style={{ position: 'relative', height: 260, overflow: 'hidden' }}>
        {details.thumbnailUrl && (
          <img
            src={details.thumbnailUrl}
            alt={details.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(0.35)', transform: 'scale(1.15)' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 20%, var(--bg-base) 100%)',
        }} />

        {/* Botón Volver Móvil */}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 12, left: 14,
            background: 'rgba(10,11,15,0.75)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '6px 12px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
            backdropFilter: 'blur(12px)', zIndex: 10,
          }}
        >
          <ArrowLeft size={14} /> Volver
        </button>

        {/* Poster + Título y Badges */}
        <div style={{
          position: 'absolute', bottom: 10, left: 14, right: 14,
          display: 'flex', gap: 12, alignItems: 'flex-end',
        }}>
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: 95, height: 138, borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid var(--border-moderate)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              background: 'var(--bg-elevated)',
            }}
          >
            <CachedImage
              src={details.thumbnailUrl}
              alt={details.title}
              fallbackIconSize={32}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </motion.div>

          <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5, alignItems: 'center' }}>
              {details.animeType && (
                <span style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  color: 'white', fontSize: 10, fontWeight: 700,
                  padding: '2px 7px', borderRadius: 'var(--radius-full)',
                }}>
                  {details.animeType}
                </span>
              )}
              {details.status && (
                <span style={{
                  background: details.status.toLowerCase().includes('concluido') || details.status.toLowerCase().includes('finaliz')
                    ? 'rgba(147, 51, 234, 0.25)'
                    : 'rgba(16, 185, 129, 0.25)',
                  color: details.status.toLowerCase().includes('concluido') || details.status.toLowerCase().includes('finaliz')
                    ? '#c084fc'
                    : '#34d399',
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-full)',
                }}>
                  ● {details.status}
                </span>
              )}
            </div>

            <h1 style={{
              fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em',
              color: 'white', lineHeight: 1.2, margin: '0 0 6px',
              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
              overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {details.title}
            </h1>

            {/* Chips de Géneros */}
            <div style={{
              display: 'flex', gap: 4,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
            }}>
              {details.genres.slice(0, 5).map(g => (
                <button
                  key={g}
                  onClick={() => handleGenreClick(g)}
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', padding: '2px 8px',
                    color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: 500,
                    cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Contenido Móvil */}
      <div style={{ padding: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Botones de Acción Táctiles */}
        <div style={{ display: 'grid', gridTemplateColumns: details.episodes.length > 0 ? '1fr 1fr' : '1fr', gap: 10 }}>
          {details.episodes.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePlayEpisode(details.episodes[0])}
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                color: 'white', border: 'none', borderRadius: 'var(--radius-md)',
                padding: '10px 14px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <Play size={16} fill="white" /> Ep. {details.episodes[0].number}
            </motion.button>
          )}

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleToggleFavorite}
            style={{
              background: isFavorite ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
              border: `1px solid ${isFavorite ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-moderate)'}`,
              color: isFavorite ? '#f87171' : 'var(--text-primary)',
              borderRadius: 'var(--radius-md)', padding: '10px 14px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {isFavorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
            {isFavorite ? 'Favorito' : 'Guardar'}
          </motion.button>
        </div>

        {/* Sinopsis Móvil */}
        {details.synopsis && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '14px 16px',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6,
            }}>
              Sinopsis
            </span>
            <p style={{
              fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)',
              margin: 0, whiteSpace: 'pre-line',
            }}>
              {details.synopsis}
            </p>
          </div>
        )}

        {/* Grid de Episodios Móvil (Botones compactos y táctiles) */}
        <div>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 12,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Episodios ({details.episodes.length})
            </h3>

            {details.episodes.length > 12 && (
              <input
                type="text"
                placeholder="Buscar cap..."
                value={epSearch}
                onChange={e => setEpSearch(e.target.value)}
                style={{
                  padding: '5px 10px', background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)', fontSize: 11, width: 100, outline: 'none',
                }}
              />
            )}
          </div>

          {visibleEps.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '24px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
            }}>
              <Calendar size={28} color="#fbbf24" style={{ margin: '0 auto 8px' }} />
              <h4 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)' }}>
                {details.season ? `Estreno · ${details.season}` : 'Próximamente'}
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: 0 }}>
                Episodios disponibles cuando comience la emisión oficial.
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}>
              {visibleEps.map((ep) => {
                const isLoadingThis = loadingEpisode === ep.number;
                return (
                  <motion.div
                    key={ep.number}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '10px 6px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 6, cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => handlePlayEpisode(ep)}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Ep. {ep.number}
                    </span>

                    <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handlePlayEpisode(ep)}
                        style={{
                          width: 24, height: 24, borderRadius: 5,
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: 'none', color: 'var(--accent-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isLoadingThis ? (
                          <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            border: '2px solid var(--accent-primary)',
                            borderTopColor: 'transparent',
                            animation: 'spin-slow 0.6s linear infinite',
                          }} />
                        ) : (
                          <Play size={11} fill="currentColor" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenDownloadModal(ep)}
                        style={{
                          width: 24, height: 24, borderRadius: 5,
                          background: 'rgba(255,255,255,0.06)',
                          border: 'none', color: 'var(--text-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Download size={11} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {filteredEps.length > 36 && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button
                onClick={() => setShowAllEps(!showAllEps)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '8px 20px',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
                }}
              >
                {showAllEps ? (
                  <>Menos episodios <ChevronUp size={14} /></>
                ) : (
                  <>Ver todos ({filteredEps.length}) <ChevronDown size={14} /></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Servidores Táctil Bottom-Sheet para Móvil */}
      <AnimatePresence>
        {downloadModalEp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 120,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            }}
            onClick={() => setDownloadModalEp(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-surface)', borderTop: '1px solid var(--border-moderate)',
                borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
                padding: '20px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
                width: '100%', maxWidth: 500, boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Descargar Ep. {downloadModalEp.number}
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                {downloadServers.map((srv, idx) => {
                  const isSelected = selectedDownloadServer?.url === srv.url;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDownloadServer(srv)}
                      style={{
                        padding: '10px 12px', borderRadius: 'var(--radius-md)',
                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-elevated)',
                        border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                        {srv.name}
                      </span>
                      {srv.isDirect && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.15)', padding: '2px 6px', borderRadius: 4,
                        }}>
                          Directo
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                <button
                  onClick={() => setDownloadModalEp(null)}
                  style={{
                    padding: '10px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Cerrar
                </button>
                <button
                  disabled={!selectedDownloadServer || isStartingDownload}
                  onClick={handleConfirmDownload}
                  style={{
                    padding: '10px', background: 'var(--accent-primary)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                    opacity: !selectedDownloadServer || isStartingDownload ? 0.6 : 1,
                  }}
                >
                  {isStartingDownload ? 'Iniciando...' : 'Descargar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
