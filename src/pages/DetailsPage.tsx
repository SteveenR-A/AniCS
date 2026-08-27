import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Download, Bookmark, BookmarkCheck,
  ChevronDown, ChevronUp, Film, Check, Clock,
  Calendar, Layers, Tag, Tv, Globe, Sparkles
} from 'lucide-react';
import { getDetails, getServers, resolveStream } from '@/services/animeService';
import { addFavorite, removeFavorite, isFavorite as checkFavorite } from '@/services/storageService';
import { startDownload } from '@/services/downloadService';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeDetails, Episode, VideoServer } from '@/types';

export function DetailsPage() {
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
      if (!cached && (!passedAnime || !passedAnime.episodes?.length)) {
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

  const handleGenreClick = (genreName: string) => {
    navigate(`/search?genre=${encodeURIComponent(genreName.toLowerCase())}&source=${source}`);
  };

  // Filtrado de episodios
  const allEps = details?.episodes ?? [];
  const filteredEps = epSearch.trim()
    ? allEps.filter(ep => ep.number.toString().includes(epSearch.trim()) || (ep.title && ep.title.toLowerCase().includes(epSearch.toLowerCase())))
    : allEps;

  const visibleEps = showAllEps
    ? filteredEps
    : filteredEps.slice(0, 36);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid var(--border-subtle)',
          borderTopColor: 'var(--accent-primary)',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (!details) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 16 }}>No se pudo cargar la información de este anime.</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            marginTop: 16, padding: '8px 18px', background: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)', cursor: 'pointer',
          }}
        >
          Volver atrás
        </button>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 60, minHeight: '100%' }}>
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

      {/* Hero Banner con Blur */}
      <div style={{ position: 'relative', height: 340, overflow: 'hidden' }}>
        {details.thumbnailUrl && (
          <img
            src={details.thumbnailUrl}
            alt={details.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.35)', transform: 'scale(1.15)' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 20%, var(--bg-base) 100%)',
        }} />

        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 20, left: 24,
            background: 'rgba(10,11,15,0.75)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '8px 16px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            backdropFilter: 'blur(12px)', zIndex: 10,
          }}
        >
          <ArrowLeft size={16} /> Volver
        </button>

        {/* Poster + Título y Badges */}
        <div style={{
          position: 'absolute', bottom: 10, left: 28, right: 28,
          display: 'flex', gap: 24, alignItems: 'flex-end',
        }}>
          {/* Poster */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: 140, height: 200, borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid var(--border-moderate)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              background: 'var(--bg-elevated)',
            }}
          >
            <CachedImage
              src={details.thumbnailUrl}
              alt={details.title}
              fallbackIconSize={48}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </motion.div>

          {/* Info Principal */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            style={{ flex: 1, minWidth: 0, paddingBottom: 6 }}
          >
            {/* Badges de Tipo y Estado */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              {details.animeType && (
                <span style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  color: 'white', fontSize: 11, fontWeight: 700,
                  padding: '3px 10px', borderRadius: 'var(--radius-full)',
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
                  border: `1px solid ${details.status.toLowerCase().includes('concluido') || details.status.toLowerCase().includes('finaliz') ? 'rgba(147, 51, 234, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-full)',
                }}>
                  ● {details.status}
                </span>
              )}
              <span style={{
                background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                padding: '3px 9px', borderRadius: 'var(--radius-full)',
              }}>
                {details.source === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
              </span>
            </div>

            {/* Título */}
            <h1 style={{
              fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em',
              color: 'white', lineHeight: 1.25, marginBottom: 12,
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            }}>
              {details.title}
            </h1>

            {/* Chips de Géneros Dinámicos (Clickables) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {details.genres.map(g => (
                <button
                  key={g}
                  onClick={() => handleGenreClick(g)}
                  title={`Filtrar animes por género: ${g}`}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)', padding: '3px 10px',
                    fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  <Tag size={10} style={{ opacity: 0.7 }} /> {g}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Contenido Principal: Metadata Card + Acciones */}
      <div style={{ padding: '24px 28px 0', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Barra de Acciones */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          {details.episodes.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handlePlayEpisode(details.episodes[0])}
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                color: 'white', border: 'none', borderRadius: 'var(--radius-lg)',
                padding: '12px 24px', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <Play size={18} fill="white" /> Reproducir Ep. {details.episodes[0].number}
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleToggleFavorite}
            style={{
              background: isFavorite ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
              border: `1px solid ${isFavorite ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-moderate)'}`,
              color: isFavorite ? '#f87171' : 'var(--text-primary)',
              borderRadius: 'var(--radius-lg)', padding: '12px 20px',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {isFavorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
            {isFavorite ? 'En Favoritos' : 'Añadir a Favoritos'}
          </motion.button>
        </div>

        {/* Ficha Técnica de Información Enriquecida */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}>
          {/* Total Episodios */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Layers size={20} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Episodios</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                {details.totalEpisodes || details.episodes.length} episodios
              </div>
            </div>
          </div>

          {/* Estudio de Animación */}
          {details.studio && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Tv size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estudio</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {details.studio}
                </div>
              </div>
            </div>
          )}

          {/* Duración */}
          {details.duration && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Duración</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {details.duration}
                </div>
              </div>
            </div>
          )}

          {/* Temporada / Emisión */}
          {(details.season || details.broadcast) && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)', color: '#34d399',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Calendar size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                  {details.season ? 'Temporada' : 'Emisión'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {details.season || details.broadcast}
                </div>
              </div>
            </div>
          )}

          {/* Idioma */}
          {details.languages && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Globe size={20} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Audio</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>
                  {details.languages}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sinopsis */}
        {details.synopsis && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '20px 24px',
          }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10,
            }}>
              Sinopsis
            </h2>
            <p style={{
              fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)',
              margin: 0, whiteSpace: 'pre-line',
            }}>
              {details.synopsis}
            </p>
          </div>
        )}

        {/* Lista de Episodios */}
        <div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Episodios ({details.episodes.length})
            </h2>

            {/* Buscador de episodio */}
            {details.episodes.length > 12 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Buscar cap..."
                  value={epSearch}
                  onChange={e => setEpSearch(e.target.value)}
                  style={{
                    padding: '6px 12px', background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)', fontSize: 12, width: 120, outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* Grid de Episodios */}
          {visibleEps.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '36px 20px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 12, maxWidth: 600, margin: '0 auto',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24',
              }}>
                <Calendar size={24} />
              </div>
              <div>
                <h4 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  {details.season ? `Próximo Estreno · ${details.season}` : 'Próximamente'}
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                  Esta producción por <strong>{details.studio || 'estudio'}</strong> está anunciada para su estreno en <strong>{details.season || 'próximas fechas'}</strong>. Los episodios se añadirán automáticamente cuando comience su emisión oficial.
                </p>
              </div>
              <button
                onClick={() => {
                  const baseName = details.title.replace(/\(.*\)|TV|Season.*|2nd.*|3rd.*/gi, '').trim();
                  navigate(`/search?q=${encodeURIComponent(baseName)}`);
                }}
                style={{
                  marginTop: 6,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '8px 20px',
                  color: 'var(--accent-primary)', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Sparkles size={14} /> Ver otras temporadas y películas de la franquicia
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: 10,
            }}>
              {visibleEps.map((ep) => {
                const isLoadingThis = loadingEpisode === ep.number;
                return (
                  <motion.div
                    key={ep.number}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 10px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 8, cursor: 'pointer', position: 'relative',
                    }}
                    onClick={() => handlePlayEpisode(ep)}
                  >
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                      textAlign: 'center',
                    }}>
                      Ep. {ep.number}
                    </div>

                    {/* Botones de acción rápida */}
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handlePlayEpisode(ep)}
                        title="Reproducir episodio"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: 'rgba(59, 130, 246, 0.15)',
                          border: 'none', color: 'var(--accent-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {isLoadingThis ? (
                          <div style={{
                            width: 12, height: 12, borderRadius: '50%',
                            border: '2px solid var(--accent-primary)',
                            borderTopColor: 'transparent',
                            animation: 'spin-slow 0.6s linear infinite',
                          }} />
                        ) : (
                          <Play size={13} fill="currentColor" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenDownloadModal(ep)}
                        title="Descargar episodio"
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: 'rgba(255,255,255,0.06)',
                          border: 'none', color: 'var(--text-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Download size={13} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Ver más episodios */}
          {filteredEps.length > 36 && (
            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button
                onClick={() => setShowAllEps(!showAllEps)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '10px 24px',
                  color: 'var(--text-primary)', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
                }}
              >
                {showAllEps ? (
                  <>Mostrar menos <ChevronUp size={16} /></>
                ) : (
                  <>Ver todos los {filteredEps.length} episodios <ChevronDown size={16} /></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Selección de Servidor para Descarga */}
      <AnimatePresence>
        {downloadModalEp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 110,
              background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setDownloadModalEp(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-xl)', padding: 24,
                width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-xl)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Descargar Episodio {downloadModalEp.number}
                </h3>
                <button
                  onClick={() => setDownloadModalEp(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                Selecciona el servidor de descarga con mejor velocidad:
              </p>

              {isLoadingServers ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', margin: '0 auto 8px',
                    border: '2px solid var(--accent-primary)', borderTopColor: 'transparent',
                    animation: 'spin-slow 0.6s linear infinite',
                  }} />
                  Cargando servidores disponibles...
                </div>
              ) : downloadServers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>No hay servidores disponibles para descargar.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', marginBottom: 20 }}>
                  {downloadServers.map((srv, idx) => {
                    const isSelected = selectedDownloadServer?.url === srv.url;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDownloadServer(srv)}
                        style={{
                          padding: '10px 14px', borderRadius: 'var(--radius-md)',
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
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDownloadModalEp(null)}
                  style={{
                    padding: '8px 16px', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  Cancelar
                </button>
                <button
                  disabled={!selectedDownloadServer || isStartingDownload}
                  onClick={handleConfirmDownload}
                  style={{
                    padding: '8px 20px', background: 'var(--accent-primary)',
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

function X({ size, ...props }: { size: number; [key: string]: any }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
