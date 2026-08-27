import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Download, Bookmark, BookmarkCheck,
  ChevronDown, ChevronUp, Film, X, Loader2, Check, Sparkles, Zap
} from 'lucide-react';
import { getDetails, getServers, resolveStream } from '@/services/animeService';
import { addFavorite, removeFavorite, isFavorite as checkFavorite } from '@/services/storageService';
import { startDownload } from '@/services/downloadService';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
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

  // Modal de selección de servidor para descarga
  const [downloadModalEp, setDownloadModalEp] = useState<Episode | null>(null);
  const [downloadServers, setDownloadServers] = useState<VideoServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [selectedDownloadServer, setSelectedDownloadServer] = useState<VideoServer | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  const { openPlayer, setCurrentAnime, setCurrentEpisode, setServers } = usePlayerStore();

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

  // Abrir modal de selección de servidor de descarga
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

  // Iniciar descarga desde el servidor seleccionado
  const handleConfirmDownload = async () => {
    if (!details || !downloadModalEp || !selectedDownloadServer) return;
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
    <div style={{ paddingBottom: 40 }}>
      {/* Toast de descarga iniciada */}
      <AnimatePresence>
        {downloadSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(16, 185, 129, 0.95)', backdropFilter: 'blur(16px)',
              color: 'white', padding: '10px 20px', borderRadius: 'var(--radius-full)',
              display: 'flex', alignItems: 'center', gap: 8, zIndex: 100,
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)', fontSize: 13, fontWeight: 700,
            }}
          >
            <Check size={16} /> {downloadSuccessToast}
          </motion.div>
        )}
      </AnimatePresence>

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
              {details.genres.map(g => (
                <span key={g} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-full)', padding: '2px 8px',
                  fontSize: 11, color: 'var(--text-secondary)',
                }}>
                  {g}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Acciones principales */}
      <div style={{
        marginTop: 56, padding: '0 24px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        {details.episodes.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handlePlayEpisode(details.episodes[0])}
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              border: 'none', borderRadius: 'var(--radius-full)',
              padding: '12px 24px', color: 'white', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: 'var(--shadow-glow)',
            }}
          >
            <Play size={16} fill="white" /> Ver Ep. 1
          </motion.button>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleToggleFavorite}
          style={{
            background: isFavorite ? 'var(--accent-primary-glow)' : 'var(--bg-surface)',
            border: isFavorite ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-full)', padding: '12px 20px',
            color: isFavorite ? 'var(--accent-primary)' : 'var(--text-secondary)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {isFavorite ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          {isFavorite ? 'En Favoritos' : 'Favorito'}
        </motion.button>
      </div>

      {/* Sinopsis */}
      {details.synopsis && (
        <div style={{ margin: '24px 24px 0', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: 18, border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Sinopsis
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {details.synopsis}
          </p>
        </div>
      )}

      {/* Lista de episodios */}
      <div style={{ margin: '28px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800 }}>
            Episodios ({details.episodes.length})
          </h2>

          {details.episodes.length > 24 && (
            <button
              onClick={() => setShowAllEps(!showAllEps)}
              style={{
                background: 'transparent', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '6px 12px',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
              }}
            >
              {showAllEps ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllEps ? 'Mostrar menos' : 'Ver todos'}
            </button>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 10,
        }}>
          {visibleEps.map((ep) => {
            const isPlayingThis = loadingEpisode === ep.number;
            return (
              <motion.div
                key={ep.number}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 14px',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
                onClick={() => handlePlayEpisode(ep)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                  }}>
                    {isPlayingThis
                      ? <Loader2 size={14} color="var(--accent-primary)" style={{ animation: 'spin-slow 1s linear infinite' }} />
                      : ep.number
                    }
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600 }}>Episodio {ep.number}</p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleOpenDownloadModal(ep)}
                    title="Seleccionar servidor y descargar"
                    style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)', width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-secondary)', cursor: 'pointer',
                    }}
                  >
                    <Download size={13} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ─── Modal de Selección de Servidor para Descargas ─── */}
      <AnimatePresence>
        {downloadModalEp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}
            onClick={() => setDownloadModalEp(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 440,
                background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-xl)', padding: 24,
                boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-secondary-glow)' }}>
                    <Download size={18} color="var(--accent-secondary)" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 800 }}>Descargar Episodio {downloadModalEp.number}</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{details.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setDownloadModalEp(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 8, textTransform: 'uppercase' }}>
                  Selecciona el Servidor de Origen
                </label>

                {isLoadingServers ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, gap: 10, color: 'var(--text-muted)' }}>
                    <Loader2 size={18} style={{ animation: 'spin-slow 1s linear infinite' }} />
                    <span style={{ fontSize: 13 }}>Buscando servidores de descarga...</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
                    {downloadServers.map((s) => {
                      const isSelected = selectedDownloadServer?.url === s.url;
                      return (
                        <button
                          key={s.url}
                          onClick={() => setSelectedDownloadServer(s)}
                          style={{
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            background: isSelected ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                            border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Zap size={14} color={s.isDirect ? 'var(--accent-success)' : 'var(--accent-warning)'} />
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {s.isDirect ? 'Servidor Directo (Alta Velocidad)' : 'Servidor Estándar'}
                              </p>
                            </div>
                          </div>
                          {isSelected && <Check size={16} color="var(--accent-primary)" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  onClick={() => setDownloadModalEp(null)}
                  style={{
                    flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                    borderRadius: 'var(--radius-md)', padding: '10px', color: 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
                <button
                  disabled={!selectedDownloadServer || isStartingDownload}
                  onClick={handleConfirmDownload}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    border: 'none', borderRadius: 'var(--radius-md)', padding: '10px',
                    color: 'white', cursor: selectedDownloadServer ? 'pointer' : 'not-allowed',
                    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    opacity: selectedDownloadServer && !isStartingDownload ? 1 : 0.6,
                  }}
                >
                  {isStartingDownload ? <Loader2 size={16} style={{ animation: 'spin-slow 1s linear infinite' }} /> : <Download size={15} />}
                  {isStartingDownload ? 'Iniciando...' : 'Iniciar Descarga'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
