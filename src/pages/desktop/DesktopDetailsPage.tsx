import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ArrowLeft, Play, Download, Bookmark, BookmarkCheck,
  ChevronDown, ChevronUp, Check, HardDrive, CheckCircle2,
  Calendar, Layers, Tag, Tv, Globe, Sparkles, Clock, DownloadCloud
} from 'lucide-react';
import { getDetails, getServers, resolveStream } from '@/services/animeService';
import { addFavorite, removeFavorite, isFavorite as checkFavorite, getHistory, getFavorites, updateFavoriteStatus } from '@/services/storageService';
import { startDownload, scanLocalDownloads, saveLocalAnimeCover, getLocalMediaUrl } from '@/services/downloadService';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { CachedImage } from '@/components/CachedImage';
import { BatchDownloadModal } from '@/components/BatchDownloadModal';
import { FavoriteStatusDropdown } from '@/components/FavoriteStatusDropdown';
import type { AnimeDetails, Episode, VideoServer, LocalEpisodeItem, FavoriteStatus } from '@/types';

export function DesktopDetailsPage() {
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
  const [favoriteStatus, setFavoriteStatus] = useState<FavoriteStatus>('favorite');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showAllEps, setShowAllEps] = useState(false);
  const [epSearch, setEpSearch] = useState('');
  const [loadingEpisode, setLoadingEpisode] = useState<number | null>(null);

  // Sincronización con Descargas Locales e Historial de Visualización
  const [localEpisodesMap, setLocalEpisodesMap] = useState<Map<number, LocalEpisodeItem>>(new Map());
  const [historyMap, setHistoryMap] = useState<Map<number, number>>(new Map());

  // Modal de descarga
  const [downloadModalEp, setDownloadModalEp] = useState<Episode | null>(null);
  const [downloadServers, setDownloadServers] = useState<VideoServer[]>([]);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [selectedDownloadServer, setSelectedDownloadServer] = useState<VideoServer | null>(null);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [downloadSuccessToast, setDownloadSuccessToast] = useState<string | null>(null);

  const {
    openPlayer, setCurrentEpisode, setCurrentAnime, setServers, setResolvedMedia, resetPlayback
  } = usePlayerStore();
  const { activeProfile } = useProfileStore();

  useEffect(() => {
    const load = async () => {
      if (cached && cached.episodes && cached.episodes.length > 0) {
        setDetails(cached);
        setIsLoading(false);
        checkFavorite(decodedUrl, activeProfile?.id).then(fav => {
          setIsFavorite(fav);
          if (fav) {
            getFavorites(activeProfile?.id).then(list => {
              const found = list.find(f => f.url === decodedUrl);
              if (found?.status) setFavoriteStatus(found.status as FavoriteStatus);
            }).catch(() => {});
          }
        }).catch(() => {});
        return;
      }

      if (!passedAnime || !passedAnime.episodes?.length) {
        setIsLoading(true);
      }
      try {
        const [det, fav] = await Promise.all([
          getDetails(decodedUrl, source),
          checkFavorite(decodedUrl, activeProfile?.id),
        ]);
        setDetails(det);
        cacheDetails(det);
        setIsFavorite(fav);
        if (fav) {
          getFavorites(activeProfile?.id).then(list => {
            const found = list.find(f => f.url === decodedUrl);
            if (found?.status) setFavoriteStatus(found.status as FavoriteStatus);
          }).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [decodedUrl, source, cached, cacheDetails, activeProfile?.id]);

  // Normalizador de títulos ultra-tolerante (ignora tildes, guiones, espacios y puntuación)
  const normalizeTitle = (str: string): string => {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes/acentos (é -> e)
      .replace(/[^a-z0-9]/g, ' ')     // Convertir cualquier símbolo o guión bajo a espacio
      .replace(/\s+/g, ' ')           // Espacios simples
      .trim();
  };

  const strictTitlesMatch = (a: string, b: string): boolean => {
    const normA = normalizeTitle(a);
    const normB = normalizeTitle(b);
    if (!normA || !normB) return false;
    if (normA === normB) return true;

    // Normalizar sufijos de temporadas comunes
    const cleanSeasonTokens = (str: string) => {
      return str
        .replace(/\b(1st|first|primer[ao]?)\s+season\b/g, 'season 1')
        .replace(/\b(2nd|second|segund[ao]?)\s+season\b/g, 'season 2')
        .replace(/\b(3rd|third|tercer[ao]?)\s+season\b/g, 'season 3')
        .replace(/\b(4th|fourth|cuart[ao]?)\s+season\b/g, 'season 4')
        .replace(/\b(5th|fifth|quint[ao]?)\s+season\b/g, 'season 5')
        .replace(/\btemporada\s+(\d+)\b/g, 'season $1')
        .replace(/\btemp\s+(\d+)\b/g, 'season $1')
        .replace(/\bs(\d+)\b/g, 'season $1')
        .trim();
    };

    return cleanSeasonTokens(normA) === cleanSeasonTokens(normB);
  };

  // Sincronizar descargas locales e historial cada vez que cambien los detalles del anime
  useEffect(() => {
    if (!details?.title) return;

    // 1. Sincronizar episodios descargados en disco con validación estricta de temporada
    scanLocalDownloads().then((folders) => {
      const match = folders.find(f => strictTitlesMatch(f.animeTitle, details.title));

      const map = new Map<number, LocalEpisodeItem>();
      if (match) {
        for (const ep of match.episodes) {
          map.set(ep.episodeNumber, ep);
        }
        // Si el anime está descargado y tenemos la portada oficial online, repararla/guardarla en disco
        if (details.thumbnailUrl && details.thumbnailUrl.startsWith('http')) {
          saveLocalAnimeCover(match.folderPath, details.thumbnailUrl).catch(console.error);
        }
      }
      setLocalEpisodesMap(map);
    }).catch(console.error);

    // 2. Sincronizar progreso de visualización de SQLite priorizando URL única de anime
    getHistory(500, 0, activeProfile?.id).then((history) => {
      const map = new Map<number, number>();
      for (const h of history) {
        const isUrlMatch = Boolean(h.animeUrl && details.url && h.animeUrl === details.url);
        const isTitleMatch = strictTitlesMatch(h.animeTitle, details.title);

        if (isUrlMatch || isTitleMatch) {
          if (!map.has(h.episodeNumber)) {
            map.set(h.episodeNumber, h.watchProgress);
          }
        }
      }
      setHistoryMap(map);
    }).catch(console.error);
  }, [details?.title, details?.url, activeProfile?.id]);

  const handlePlayEpisode = async (ep: Episode) => {
    if (!details) return;
    resetPlayback();
    setLoadingEpisode(ep.number);

    // Si el episodio ya está descargado en disco, reproducir a través del servidor local de streaming
    const localEp = localEpisodesMap.get(ep.number);
    if (localEp) {
      let streamUrl = '';
      try {
        streamUrl = await getLocalMediaUrl(localEp.filePath);
      } catch {
        streamUrl = convertFileSrc(localEp.filePath);
      }
      const isTs = localEp.filePath.toLowerCase().endsWith('.ts');
      setCurrentAnime({
        title: details.title,
        url: details.url,
        thumbnailUrl: details.thumbnailUrl,
        synopsis: details.synopsis,
        genres: details.genres,
        episodes: details.episodes.map(e => ({
          number: e.number,
          title: e.title || `Episodio ${e.number}`,
          url: e.url,
          watched: (historyMap.get(e.number) ?? 0) >= 0.85,
          watchProgress: historyMap.get(e.number) ?? 0,
        })),
        source: details.source || source,
      });
      setCurrentEpisode({
        number: ep.number,
        title: ep.title || `Episodio ${ep.number}`,
        url: ep.url,
        watched: (historyMap.get(ep.number) ?? 0) >= 0.85,
        watchProgress: historyMap.get(ep.number) ?? 0,
      });
      setResolvedMedia({
        directUrl: streamUrl,
        mediaType: isTs ? 'hls' : 'mp4',
        qualities: [],
      });
      setServers([]);
      openPlayer();
      setLoadingEpisode(null);
      navigate('/player');
      return;
    }

    // Reproducción Online normal
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
    let resolvedMedia: { directUrl: string; referer?: string } | null = null;
    let usedServerName = selectedDownloadServer.name;

    // 1. Intentar primero con el servidor elegido por el usuario
    try {
      resolvedMedia = await resolveStream(selectedDownloadServer, source);
    } catch (err) {
      console.warn(`Servidor seleccionado (${selectedDownloadServer.name}) no disponible, probando servidores de respaldo...`, err);
    }

    // 2. Si el servidor elegido falló, probar automáticamente los demás servidores disponibles
    if (!resolvedMedia || !resolvedMedia.directUrl) {
      const fallbackCandidates = downloadServers.filter(s => s.url !== selectedDownloadServer.url);
      for (const candidate of fallbackCandidates) {
        try {
          const res = await resolveStream(candidate, source);
          if (res && res.directUrl) {
            resolvedMedia = res;
            usedServerName = candidate.name;
            break;
          }
        } catch (candidateErr) {
          console.warn(`Servidor de respaldo (${candidate.name}) no disponible, probando siguiente...`, candidateErr);
        }
      }
    }

    if (!resolvedMedia || !resolvedMedia.directUrl) {
      setDownloadSuccessToast(`No se pudo conectar a ningún servidor para el Ep. ${downloadModalEp.number}`);
      setTimeout(() => setDownloadSuccessToast(null), 4000);
      setIsStartingDownload(false);
      return;
    }

    try {
      const downloadId = await startDownload({
        animeTitle: details.title,
        episodeNumber: downloadModalEp.number,
        streamUrl: resolvedMedia.directUrl,
        referer: resolvedMedia.referer,
      });

      useDownloadStore.getState().addTask({
        id: downloadId,
        animeTitle: details.title,
        episodeNumber: downloadModalEp.number,
        streamUrl: resolvedMedia.directUrl,
        outputPath: '',
        progress: 0,
        speedKbps: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'downloading',
      });

      setDownloadModalEp(null);
      const isFallback = usedServerName !== selectedDownloadServer.name;
      setDownloadSuccessToast(
        isFallback
          ? `Descargando Ep. ${downloadModalEp.number} con ${usedServerName} (respaldo)`
          : `Descarga iniciada: Ep. ${downloadModalEp.number}`
      );
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } catch (e) {
      console.error('Error starting download', e);
      setDownloadSuccessToast(`Error iniciando descarga: Ep. ${downloadModalEp.number}`);
      setTimeout(() => setDownloadSuccessToast(null), 3500);
    } finally {
      setIsStartingDownload(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!details) return;
    try {
      if (isFavorite) {
        await removeFavorite(decodedUrl, activeProfile?.id);
        setIsFavorite(false);
        useSyncStore.getState().triggerDebouncedSync();
      } else {
        await addFavorite({
          title: details.title,
          url: decodedUrl,
          thumbnailUrl: details.thumbnailUrl,
          source: details.source,
          status: favoriteStatus,
        }, activeProfile?.id, favoriteStatus);
        setIsFavorite(true);
        useSyncStore.getState().triggerDebouncedSync();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (newStatus: FavoriteStatus) => {
    if (!details) return;
    try {
      if (!isFavorite) {
        await addFavorite({
          title: details.title,
          url: decodedUrl,
          thumbnailUrl: details.thumbnailUrl,
          source: details.source,
          status: newStatus,
        }, activeProfile?.id, newStatus);
        setIsFavorite(true);
      } else {
        await updateFavoriteStatus(decodedUrl, newStatus, activeProfile?.id);
      }
      setFavoriteStatus(newStatus);
      useSyncStore.getState().triggerDebouncedSync();
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
    : filteredEps.slice(0, 48);

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
    <div style={{ paddingBottom: 60 }}>
      {/* Toast flotante de éxito de descarga */}
      <AnimatePresence>
        {downloadSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            style={{
              position: 'fixed', top: 20, right: 28, zIndex: 9999,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent-primary)',
              boxShadow: 'var(--shadow-glow)',
              borderRadius: 'var(--radius-lg)',
              padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 10,
              color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
            }}
          >
            <CheckCircle2 size={18} color="var(--accent-primary)" />
            <span>{downloadSuccessToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Banner Desktop */}
      <div style={{
        position: 'relative',
        minHeight: 280,
        display: 'flex',
        alignItems: 'flex-end',
        padding: '36px 36px 28px',
        overflow: 'hidden',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {/* Imagen de Fondo Desenfundada */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: `url(${details.thumbnailUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(32px) brightness(0.25)',
          transform: 'scale(1.1)',
        }} />

        {/* Gradientes de Integración */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to top, var(--bg-base) 0%, rgba(13,17,23,0.7) 60%, rgba(13,17,23,0.9) 100%)',
        }} />

        {/* Botón Volver */}
        <button
          onClick={() => navigate(-1)}
          style={{
            position: 'absolute', top: 20, left: 24, zIndex: 10,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-full)',
            width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer',
          }}
        >
          <ArrowLeft size={18} />
        </button>

        {/* Contenido del Banner */}
        <div style={{
          position: 'relative', zIndex: 2,
          display: 'flex', gap: 28, alignItems: 'flex-end',
          maxWidth: 1400, width: '100%', margin: '0 auto',
        }}>
          {/* Poster del Anime */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              width: 150, height: 215, borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid var(--border-moderate)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
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

          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            style={{ flex: 1, minWidth: 0, paddingBottom: 8 }}
          >
            {/* Badges de Tipo y Estado */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10, alignItems: 'center' }}>
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

            <h1 style={{
              fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em',
              color: 'white', lineHeight: 1.25, marginBottom: 12,
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
            }}>
              {details.title}
            </h1>

            {/* Chips de Géneros */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {details.genres.map(g => (
                <button
                  key={g}
                  onClick={() => handleGenreClick(g)}
                  style={{
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', padding: '4px 10px',
                    color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <Tag size={10} style={{ opacity: 0.7 }} /> {g}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Contenido Principal Desktop */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 36px 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {/* Barra de Acciones */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
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

          {/* Botón Favorito y Dropdown de Estado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleToggleFavorite}
              style={{
                background: isFavorite ? 'rgba(236, 72, 153, 0.15)' : 'var(--bg-surface)',
                border: `1px solid ${isFavorite ? 'rgba(236, 72, 153, 0.4)' : 'var(--border-moderate)'}`,
                color: isFavorite ? '#ec4899' : 'var(--text-primary)',
                borderRadius: 'var(--radius-lg)', padding: '12px 20px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              {isFavorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
              {isFavorite ? 'En Favoritos' : 'Añadir a Favoritos'}
            </motion.button>

            {isFavorite && (
              <FavoriteStatusDropdown
                currentStatus={favoriteStatus}
                onSelectStatus={handleStatusChange}
              />
            )}
          </div>

          {/* Botón Descarga por Lotes */}
          {details.episodes.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowBatchModal(true)}
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
                borderRadius: 'var(--radius-lg)', padding: '12px 20px',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <DownloadCloud size={18} /> Descarga por Lotes
            </motion.button>
          )}
        </div>

        {/* Ficha Técnica Desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 14,
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
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

          {details.studio && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
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

          {details.duration && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
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

          {(details.season || details.broadcast) && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
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

          {details.languages && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
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

        {/* Sinopsis Desktop */}
        {details.synopsis && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', padding: '24px 28px',
          }}>
            <h2 style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
            }}>
              Sinopsis
            </h2>
            <p style={{
              fontSize: 14, lineHeight: 1.8, color: 'var(--text-secondary)',
              margin: 0, whiteSpace: 'pre-line',
            }}>
              {details.synopsis}
            </p>
          </div>
        )}

        {/* Lista de Episodios Desktop */}
        <div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, marginBottom: 18,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Episodios ({details.episodes.length})
            </h2>

            {details.episodes.length > 12 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Buscar capítulo..."
                  value={epSearch}
                  onChange={e => setEpSearch(e.target.value)}
                  style={{
                    padding: '8px 14px', background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)', fontSize: 13, width: 150, outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* Grid de Episodios Desktop */}
          {visibleEps.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 24px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 12, maxWidth: 640, margin: '0 auto',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24',
              }}>
                <Calendar size={26} />
              </div>
              <div>
                <h4 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  {details.season ? `Próximo Estreno · ${details.season}` : 'Próximamente'}
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                  Esta producción por <strong>{details.studio || 'estudio'}</strong> está anunciada para su estreno en <strong>{details.season || 'próximas fechas'}</strong>. Los episodios se añadirán automáticamente cuando comience su emisión oficial.
                </p>
              </div>
              <button
                onClick={() => {
                  const baseName = details.title.replace(/\(.*\)|TV|Season.*|2nd.*|3rd.*/gi, '').trim();
                  navigate(`/search?q=${encodeURIComponent(baseName)}`);
                }}
                style={{
                  marginTop: 8,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '10px 24px',
                  color: 'var(--accent-primary)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <Sparkles size={14} /> Ver otras temporadas y películas de la franquicia
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
              gap: 12,
            }}>
              {visibleEps.map((ep) => {
                const isLoadingThis = loadingEpisode === ep.number;
                const localEp = localEpisodesMap.get(ep.number);
                const isDownloaded = !!localEp;

                const prog = historyMap.get(ep.number) ?? (ep.watchProgress ?? (ep.watched ? 1.0 : 0));
                const isWatched = prog >= 0.85 || ep.watched;
                const isInProgress = prog > 0.01 && prog < 0.85;
                const progPct = Math.round(prog * 100);

                return (
                  <motion.div
                    key={ep.number}
                    whileHover={{ y: -3, scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    style={{
                      background: 'var(--bg-surface)',
                      border: `1px solid ${isWatched ? 'rgba(16, 185, 129, 0.4)' : isInProgress ? 'rgba(99, 102, 241, 0.4)' : isDownloaded ? 'rgba(59, 130, 246, 0.35)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 12px 10px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      gap: 8, cursor: 'pointer', position: 'relative',
                      boxShadow: 'var(--shadow-subtle)',
                      overflow: 'hidden',
                    }}
                    onClick={() => handlePlayEpisode(ep)}
                  >
                    {/* Badge de Estado: Descargado */}
                    {isDownloaded && (
                      <div
                        title={`Descargado localmente (${localEp.fileSizeFormatted})`}
                        style={{
                          position: 'absolute', top: 6, left: 6,
                          background: 'rgba(59, 130, 246, 0.18)',
                          color: '#60a5fa',
                          fontSize: 9, fontWeight: 800,
                          padding: '2px 5px', borderRadius: 4,
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        <HardDrive size={10} />
                        <span>{localEp.fileSizeFormatted}</span>
                      </div>
                    )}

                    {/* Badge de Estado: Visto o En Progreso */}
                    {isWatched ? (
                      <div
                        title="Episodio visto"
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          background: 'rgba(16, 185, 129, 0.18)',
                          color: '#34d399',
                          fontSize: 9, fontWeight: 800,
                          padding: '2px 5px', borderRadius: 4,
                          display: 'flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        <CheckCircle2 size={10} />
                        <span>Visto</span>
                      </div>
                    ) : isInProgress ? (
                      <div
                        title={`Progreso: ${progPct}%`}
                        style={{
                          position: 'absolute', top: 6, right: 6,
                          background: 'rgba(99, 102, 241, 0.18)',
                          color: '#818cf8',
                          fontSize: 9, fontWeight: 800,
                          padding: '2px 5px', borderRadius: 4,
                        }}
                      >
                        {progPct}%
                      </div>
                    ) : null}

                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: isWatched ? '#34d399' : 'var(--text-primary)',
                      textAlign: 'center', marginTop: (isDownloaded || isWatched || isInProgress) ? 10 : 0,
                    }}>
                      Episodio {ep.number}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handlePlayEpisode(ep)}
                        title={isDownloaded ? `Reproducir desde disco local (${localEp.fileSizeFormatted})` : 'Reproducir online'}
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isDownloaded ? 'rgba(16, 185, 129, 0.18)' : 'rgba(59, 130, 246, 0.15)',
                          border: 'none',
                          color: isDownloaded ? '#34d399' : 'var(--accent-primary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {isLoadingThis ? (
                          <div style={{
                            width: 14, height: 14, borderRadius: '50%',
                            border: '2px solid var(--accent-primary)',
                            borderTopColor: 'transparent',
                            animation: 'spin-slow 0.6s linear infinite',
                          }} />
                        ) : (
                          <Play size={14} fill="currentColor" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenDownloadModal(ep)}
                        title={isDownloaded ? 'Ya descargado (clic para re-descargar)' : 'Descargar episodio'}
                        style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: isDownloaded ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.06)',
                          border: isDownloaded ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
                          color: isDownloaded ? '#34d399' : 'var(--text-secondary)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {isDownloaded ? <Check size={14} /> : <Download size={14} />}
                      </button>
                    </div>

                    {/* Barrita inferior de progreso de reproducción */}
                    {isInProgress && (
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: 3, background: 'rgba(255,255,255,0.08)',
                      }}>
                        <div style={{
                          width: `${progPct}%`, height: '100%',
                          background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                        }} />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}

          {filteredEps.length > 48 && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button
                onClick={() => setShowAllEps(!showAllEps)}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '12px 28px',
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

      {/* Modal de Servidor Desktop */}
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
                borderRadius: 'var(--radius-xl)', padding: 28,
                width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-xl)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Descargar Episodio {downloadModalEp.number}
                </h3>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', marginBottom: 20 }}>
                  {downloadServers.map((srv, idx) => {
                    const isSelected = selectedDownloadServer?.url === srv.url;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDownloadServer(srv)}
                        style={{
                          padding: '12px 16px', borderRadius: 'var(--radius-md)',
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
                            background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 4,
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
                    padding: '8px 18px', background: 'var(--bg-elevated)',
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
                    padding: '8px 24px', background: 'var(--accent-primary)',
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

      {/* Modal de Descarga por Lotes */}
      {showBatchModal && details && (
        <BatchDownloadModal
          isOpen={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          animeTitle={details.title}
          episodes={details.episodes}
          source={source}
          onSuccessToast={(msg) => {
            setDownloadSuccessToast(msg);
            setTimeout(() => setDownloadSuccessToast(null), 4000);
          }}
        />
      )}
    </div>
  );
}
