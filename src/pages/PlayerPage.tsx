import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, ChevronLeft, ChevronRight,
  Loader2, FastForward, SkipForward, RotateCcw,
  Sparkles, Check, Sun, ListVideo, Zap, Server, AlertCircle,
  Eye, EyeOff, ChevronDown, ChevronUp
} from 'lucide-react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { resolveStream, getServers, getDetails } from '@/services/animeService';
import { upsertHistory } from '@/services/storageService';
import { useResponsive } from '@/hooks/useResponsive';
import type { VideoServer, Episode } from '@/types';

function formatTime(s: number) {
  if (isNaN(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const ASPECT_OPTIONS = [
  { id: 'contain', label: 'Original / Ajustar' },
  { id: 'cover', label: 'Recortar / Zoom 16:9' },
  { id: 'fill', label: 'Estirar / Pantalla' },
] as const;

export function PlayerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isMobile } = useResponsive();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const centerAnimTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Touch gesture state refs
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const touchActionSide = useRef<'left' | 'right' | null>(null);
  const initialBrightness = useRef<number>(1.0);
  const initialVolume = useRef<number>(1.0);
  const lastTapTime = useRef<number>(0);

  const queryUrl = searchParams.get('url');
  const queryEp = searchParams.get('ep');
  const querySource = searchParams.get('source') ?? 'jkanime';

  const {
    currentAnime, currentEpisode, servers, resolvedMedia,
    selectedServer, setSelectedServer, setResolvedMedia, setIsResolving,
    isResolving, volume, isMuted, setVolume, setIsMuted,
    playbackTime, setPlaybackTime, duration, setDuration,
    setServers, setCurrentEpisode, setCurrentAnime
  } = usePlayerStore();

  const { getCachedDetails, cacheDetails } = useAnimeStore();

  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [autoNext, setAutoNext] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'settings'>('none');
  
  // Toggle para ocultar / mostrar la barra de servidores
  const [showServerDropdown, setShowServerDropdown] = useState(false);

  // Gestos & HUD Toasts
  const [hudToast, setHudToast] = useState<{ icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [centerPlayPulse, setCenterPlayPulse] = useState<'play' | 'pause' | null>(null);

  const showToast = (toast: { icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number }) => {
    setHudToast(toast);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setHudToast(null), 1500);
  };

  const triggerCenterPulse = (type: 'play' | 'pause') => {
    setCenterPlayPulse(type);
    if (centerAnimTimeout.current) clearTimeout(centerAnimTimeout.current);
    centerAnimTimeout.current = setTimeout(() => setCenterPlayPulse(null), 500);
  };

  // Orientación automática a horizontal en Android al entrar al reproductor
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.screen && 'orientation' in window.screen) {
        const orient = window.screen.orientation as any;
        if (orient && orient.lock) {
          orient.lock('landscape').catch(() => {});
        }
      }
    } catch {}

    return () => {
      try {
        if (typeof window !== 'undefined' && window.screen && 'orientation' in window.screen) {
          const orient = window.screen.orientation as any;
          if (orient && orient.unlock) {
            orient.unlock();
          }
        }
      } catch {}
    };
  }, []);

  // Recuperación automática de estado desde URL si se refresca
  useEffect(() => {
    const initFromParams = async () => {
      if (!queryUrl) return;
      const decoded = decodeURIComponent(queryUrl);

      if (currentAnime && currentEpisode && currentAnime.url === decoded) {
        return;
      }

      // 1. Revisar si está en la caché RAM para carga instantánea
      const cached = getCachedDetails(decoded);
      if (cached) {
        setCurrentAnime(cached);
        const epNum = queryEp ? parseInt(queryEp, 10) : 1;
        const targetEp = cached.episodes.find(e => e.number === epNum) || cached.episodes[0] || {
          number: epNum,
          title: `Episodio ${epNum}`,
          url: `${decoded.replace(/\/$/, '')}/${epNum}/`,
          watched: false,
        };
        setCurrentEpisode(targetEp);

        try {
          const srvs = await getServers(targetEp.url, querySource);
          setServers(srvs);
        } catch (e) {
          console.error(e);
        }
        return;
      }

      setIsLoadingInitial(true);
      setLoadError(null);
      try {
        const details = await getDetails(decoded, querySource);
        setCurrentAnime(details);
        cacheDetails(details);

        const epNum = queryEp ? parseInt(queryEp, 10) : 1;
        const targetEp = details.episodes.find(e => e.number === epNum) || details.episodes[0] || {
          number: epNum,
          title: `Episodio ${epNum}`,
          url: `${decoded.replace(/\/$/, '')}/${epNum}/`,
          watched: false,
        };
        setCurrentEpisode(targetEp);

        const srvs = await getServers(targetEp.url, querySource);
        setServers(srvs);
      } catch (err: any) {
        console.error('Failed to init player from URL params:', err);
        setLoadError(err?.message || 'No se pudo cargar el anime');
      } finally {
        setIsLoadingInitial(false);
      }
    };

    initFromParams();
  }, [queryUrl, queryEp, querySource, getCachedDetails, cacheDetails]);

  // Sincronizar volumen y velocidad en el elemento <video>
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed]);

  // Resolver automáticamente el mejor servidor
  useEffect(() => {
    if (servers.length > 0 && !resolvedMedia && !isResolving) {
      const preferred = servers.find(s => s.name.toLowerCase().includes('magi'))
        ?? servers.find(s => s.name.toLowerCase().includes('desu'))
        ?? servers.find(s => s.isDirect)
        ?? servers[0];

      if (preferred) {
        handleSelectServer(preferred);
      }
    }
  }, [servers]);

  // Cargar stream resuelto en el elemento de video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedMedia) return;

    if (resolvedMedia.mediaType === 'hls' && Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(resolvedMedia.directUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('Fatal HLS error, attempting fallback server...', data);
          tryFallbackServer();
        }
      });
    } else {
      video.src = resolvedMedia.directUrl;
      video.play().catch(() => {});
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [resolvedMedia]);

  const handleSelectServer = async (server: VideoServer) => {
    setSelectedServer(server);
    setIsResolving(true);
    try {
      const media = await resolveStream(server, querySource);
      setResolvedMedia(media);
    } catch (err) {
      console.warn(`Server ${server.name} failed:`, err);
      tryFallbackServer();
    } finally {
      setIsResolving(false);
    }
  };

  const tryFallbackServer = () => {
    if (!servers.length || !selectedServer) return;
    const currentIndex = servers.findIndex(s => s.url === selectedServer.url);
    const nextServer = servers[(currentIndex + 1) % servers.length];

    if (nextServer && nextServer.url !== selectedServer.url) {
      handleSelectServer(nextServer);
    }
  };

  // Guardar progreso en el historial de SQLite
  const saveProgress = useCallback(() => {
    if (!currentAnime || !currentEpisode || !duration || duration <= 0) return;
    const prog = playbackTime / duration;
    upsertHistory({
      id: `${currentAnime.url}-${currentEpisode.number}`,
      animeTitle: currentAnime.title,
      animeUrl: currentAnime.url,
      thumbnailUrl: currentAnime.thumbnailUrl,
      episodeNumber: currentEpisode.number,
      episodeUrl: currentEpisode.url,
      watchProgress: Math.min(1.0, Math.max(0.0, prog)),
      watchedAt: new Date().toISOString(),
      source: currentAnime.source,
    }).catch(console.error);
  }, [currentAnime, currentEpisode, playbackTime, duration]);

  // Guardar progreso periódicamente cada 10 segundos
  useEffect(() => {
    const interval = setInterval(saveProgress, 10000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [saveProgress]);

  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      // Ocultar controles automáticamente tanto en reproducción como en pausa (protección OLED / Lenovo Vantage)
      if (activeDrawer === 'none') {
        setShowControls(false);
        setShowServerDropdown(false);
      }
    }, 2800);
  }, [activeDrawer]);

  const toggleControlsManual = () => {
    if (showControls) {
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      setShowControls(false);
      setShowServerDropdown(false);
    } else {
      showControlsTemp();
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
      triggerCenterPulse('pause');
    } else {
      v.play().catch(() => {});
      triggerCenterPulse('play');
    }
    showControlsTemp();
  };

  const handleEnded = () => {
    saveProgress();
    if (autoNext && currentAnime && currentEpisode) {
      const nextEp = currentAnime.episodes.find(e => e.number === currentEpisode.number + 1);
      if (nextEp) {
        handleLoadEpisode(nextEp.number);
      }
    }
  };

  const handleLoadEpisode = async (epNum: number) => {
    if (!currentAnime) return;
    const ep = currentAnime.episodes.find(e => e.number === epNum);
    if (!ep) return;

    saveProgress();
    setCurrentEpisode(ep);
    setResolvedMedia(null);
    setPlaybackTime(0);
    setDuration(0);
    setIsResolving(true);

    try {
      const srvs = await getServers(ep.url, querySource);
      setServers(srvs);
      const direct = srvs.find(s => s.name.toLowerCase().includes('magi'))
        ?? srvs.find(s => s.name.toLowerCase().includes('desu'))
        ?? srvs.find(s => s.isDirect)
        ?? srvs[0];

      if (direct) {
        const media = await resolveStream(direct, querySource);
        setSelectedServer(direct);
        setResolvedMedia(media);
      }
    } catch (e) {
      console.error('Failed to change episode:', e);
    } finally {
      setIsResolving(false);
    }
  };

  const seekRelative = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
    showToast({
      icon: 'seek',
      text: seconds > 0 ? `+${seconds}s` : `${seconds}s`,
    });
    showControlsTemp();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Gestos táctiles aislados
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (
      activeDrawer !== 'none' ||
      target.closest('[data-drawer]') ||
      target.closest('.controls-overlay') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('.no-gesture')
    ) {
      touchActionSide.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const screenWidth = window.innerWidth;
      const x = touch.clientX;
      const y = touch.clientY;

      touchStartX.current = x;
      touchStartY.current = y;
      touchStartTime.current = Date.now();
      initialBrightness.current = brightness;
      initialVolume.current = isMuted ? 0 : volume;

      if (x < screenWidth * 0.45) {
        touchActionSide.current = 'left';
      } else if (x > screenWidth * 0.55) {
        touchActionSide.current = 'right';
      } else {
        touchActionSide.current = null;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStartY.current !== null && touchActionSide.current) {
      const touch = e.touches[0];
      const deltaY = touchStartY.current - touch.clientY;
      const screenHeight = window.innerHeight;
      const change = deltaY / (screenHeight * 0.6);

      if (touchActionSide.current === 'left') {
        const newBri = Math.max(0.1, Math.min(1.5, initialBrightness.current + change));
        setBrightness(newBri);
        showToast({ icon: 'brightness', text: `Brillo: ${Math.round(newBri * 100)}%`, value: newBri });
      } else if (touchActionSide.current === 'right') {
        const newVol = Math.max(0, Math.min(1.0, initialVolume.current + change));
        setVolume(newVol);
        setIsMuted(false);
        showToast({ icon: 'volume', text: `Volumen: ${Math.round(newVol * 100)}%`, value: newVol });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const now = Date.now();
    const timeDiff = now - touchStartTime.current;

    if (timeDiff < 280 && touchStartX.current !== null && touchStartY.current !== null) {
      const doubleTapDiff = now - lastTapTime.current;
      const x = touchStartX.current;
      const screenWidth = window.innerWidth;

      if (doubleTapDiff < 300) {
        if (x < screenWidth * 0.4) {
          seekRelative(-10);
          setDoubleTapSide('left');
          setTimeout(() => setDoubleTapSide(null), 600);
        } else if (x > screenWidth * 0.6) {
          seekRelative(10);
          setDoubleTapSide('right');
          setTimeout(() => setDoubleTapSide(null), 600);
        } else {
          togglePlay();
        }
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
        showControlsTemp();
      }
    }

    touchStartY.current = null;
    touchStartX.current = null;
    touchActionSide.current = null;
  };

  // Rueda del ratón aislada para evitar conflictos con scroll de listas
  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (
      activeDrawer !== 'none' ||
      target.closest('[data-drawer]') ||
      target.closest('.controls-overlay') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('.no-gesture')
    ) {
      return;
    }

    const x = e.clientX;
    const screenWidth = window.innerWidth;
    const isUp = e.deltaY < 0;

    if (x < screenWidth * 0.5) {
      const newBri = Math.max(0.1, Math.min(1.5, brightness + (isUp ? 0.05 : -0.05)));
      setBrightness(newBri);
      showToast({ icon: 'brightness', text: `Brillo: ${Math.round(newBri * 100)}%`, value: newBri });
    } else {
      const newVol = Math.max(0, Math.min(1.0, volume + (isUp ? 0.05 : -0.05)));
      setVolume(newVol);
      setIsMuted(false);
      showToast({ icon: 'volume', text: `Volumen: ${Math.round(newVol * 100)}%`, value: newVol });
    }
  };

  // Atajos de teclado para Windows / Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'arrowright':
        case 'l':
          e.preventDefault();
          seekRelative(10);
          break;
        case 's':
          e.preventDefault();
          seekRelative(85);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          showToast({ icon: 'volume', text: `Volumen: ${Math.round(Math.min(1, volume + 0.1) * 100)}%`, value: Math.min(1, volume + 0.1) });
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          showToast({ icon: 'volume', text: `Volumen: ${Math.round(Math.max(0, volume - 0.1) * 100)}%`, value: Math.max(0, volume - 0.1) });
          break;
        case 'c':
        case 'h':
          e.preventDefault();
          toggleControlsManual();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(!isMuted);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, isMuted, isFullscreen]);

  if (isLoadingInitial) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#000', flexDirection: 'column', gap: 14 }}>
        <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
        <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>Cargando episodio...</p>
      </div>
    );
  }

  if (!currentAnime || !currentEpisode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, background: '#000', padding: 24, textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: '#f87171', opacity: 0.8 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>
          {loadError || 'No hay contenido seleccionado para reproducir'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 400 }}>
          Selecciona un episodio desde el catálogo o la página de detalles para comenzar a ver.
        </p>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'var(--accent-primary)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 24px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Volver
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw', height: '100vh', background: '#000000',
        position: 'relative', overflow: 'hidden', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: showControls ? 'default' : 'none',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
        paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
      }}
      onMouseMove={showControlsTemp}
      onClick={showControlsTemp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Capa de Video con Brillo Real ── */}
      <div
        style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000000', cursor: 'pointer',
        }}
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          style={{
            width: '100%', height: '100%',
            objectFit: aspectRatio,
            filter: brightness > 1 ? `brightness(${brightness})` : undefined,
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v) setPlaybackTime(v.currentTime);
          }}
          onDurationChange={() => {
            const v = videoRef.current;
            if (v) setDuration(v.duration);
          }}
          onError={() => {
            console.warn('Video element error, switching to fallback server...');
            tryFallbackServer();
          }}
          onEnded={handleEnded}
        />

        {/* Capa de Atenuación de Brillo Física (Dimmer Overlay) */}
        {brightness < 1.0 && (
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: '#000000',
              opacity: Math.max(0, 1.0 - brightness),
              pointerEvents: 'none',
              zIndex: 5,
            }}
          />
        )}
      </div>

      {/* Center Play/Pause Pulse Animation (cuando se hace clic en pantalla) */}
      <AnimatePresence>
        {centerPlayPulse && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.3 }}
            transition={{ duration: 0.3 }}
            style={{
              position: 'absolute',
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', zIndex: 25, pointerEvents: 'none',
            }}
          >
            {centerPlayPulse === 'play' ? <Play size={32} fill="white" style={{ marginLeft: 3 }} /> : <Pause size={32} fill="white" />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Double Tap Seek Feedback */}
      <AnimatePresence>
        {doubleTapSide && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute',
              [doubleTapSide]: '15%',
              top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)',
              borderRadius: 'var(--radius-xl)', padding: '16px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              color: 'white', zIndex: 30, pointerEvents: 'none',
            }}
          >
            {doubleTapSide === 'left' ? <RotateCcw size={32} /> : <FastForward size={32} />}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {doubleTapSide === 'left' ? '-10s' : '+10s'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Toast (Quick Overlay) */}
      <AnimatePresence>
        {hudToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'absolute', top: isMobile ? 40 : 70,
              background: 'rgba(10, 11, 15, 0.88)', backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-moderate)',
              borderRadius: 'var(--radius-full)', padding: '8px 20px',
              color: 'white', zIndex: 40, display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: 'var(--shadow-glow)', fontSize: 13, fontWeight: 700,
              pointerEvents: 'none',
            }}
          >
            {hudToast.icon === 'volume' && <Volume2 size={16} color="var(--accent-primary)" />}
            {hudToast.icon === 'brightness' && <Sun size={16} color="#fbbf24" />}
            {hudToast.icon === 'seek' && <Zap size={16} color="var(--accent-secondary)" />}
            <span>{hudToast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Stream Overlay */}
      {isResolving && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, zIndex: 35, pointerEvents: 'none',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '3px solid var(--border-subtle)',
            borderTopColor: 'var(--accent-primary)',
            animation: 'spin-slow 0.8s linear infinite',
          }} />
          <p style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>
            Conectando a {selectedServer?.name || 'servidor'}...
          </p>
        </div>
      )}

      {/* ─── Controls Overlay ─── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="controls-overlay"
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 20%, transparent 70%, rgba(0,0,0,0.92) 100%)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              padding: isMobile ? '14px 18px' : '20px 24px',
              zIndex: 20, pointerEvents: 'auto',
            }}
            onClick={togglePlay}
            onWheel={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            {/* ── Top Bar: Volver, Título Central y Acciones ── */}
            <div
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              {/* Botón Volver */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <button
                  onClick={() => {
                    saveProgress();
                    navigate(-1);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', padding: '6px 14px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)', flexShrink: 0,
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  <ArrowLeft size={16} /> Volver
                </button>
              </div>

              {/* Título Central */}
              <div style={{ textAlign: 'center', flex: 2, minWidth: 0, overflow: 'hidden' }}>
                <h2 style={{
                  fontSize: isMobile ? 13 : 15, fontWeight: 700, color: 'white', margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  AniCS - {currentAnime.title} - Episodio {currentEpisode.number}
                </h2>
              </div>

              {/* Acciones Superiores Derecha (Servidor Ocultable / Desplegable, Ocultar Controles, Episodios, Ajustes) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flex: 1 }}>
                {/* Selector Desplegable de Servidor */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowServerDropdown(!showServerDropdown)}
                    title="Seleccionar servidor de video"
                    style={{
                      background: 'rgba(10,11,15,0.8)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-full)', padding: '6px 12px',
                      color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(12px)',
                    }}
                  >
                    <Server size={13} color="var(--accent-primary)" />
                    <span>{selectedServer?.name || 'Servidor'}</span>
                    {showServerDropdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>

                  {/* Menú Flotante de Servidores Ocultable */}
                  <AnimatePresence>
                    {showServerDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        style={{
                          position: 'absolute', top: '115%', right: 0,
                          background: 'rgba(15,16,22,0.96)', backdropFilter: 'blur(20px)',
                          border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-lg)',
                          padding: 8, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 4,
                          minWidth: 160, boxShadow: 'var(--shadow-lg)',
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px' }}>
                          Servidores disponibles
                        </span>
                        {servers.map((srv, idx) => {
                          const isSelected = selectedServer?.url === srv.url;
                          return (
                            <button
                              key={idx}
                              onClick={() => {
                                handleSelectServer(srv);
                                setShowServerDropdown(false);
                              }}
                              style={{
                                padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                                background: isSelected ? 'var(--accent-primary)' : 'transparent',
                                border: 'none', color: isSelected ? 'white' : 'var(--text-primary)',
                                fontSize: 12, fontWeight: isSelected ? 700 : 500, cursor: 'pointer',
                                textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {srv.isDirect && <Zap size={11} color={isSelected ? 'white' : '#34d399'} />}
                                {srv.name}
                              </span>
                              {isSelected && <Check size={12} />}
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Botón Ocultar Controles Manualmente */}
                <button
                  onClick={toggleControlsManual}
                  title="Ocultar controles (C o H)"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <EyeOff size={15} />
                </button>

                {/* Botón Drawer de Episodios */}
                <button
                  onClick={() => {
                    setActiveDrawer(activeDrawer === 'servers' ? 'none' : 'servers');
                    setShowServerDropdown(false);
                  }}
                  title="Lista de episodios"
                  style={{
                    background: activeDrawer === 'servers' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <ListVideo size={16} />
                </button>

                {/* Botón Drawer de Ajustes */}
                <button
                  onClick={() => {
                    setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings');
                    setShowServerDropdown(false);
                  }}
                  title="Ajustes de video"
                  style={{
                    background: activeDrawer === 'settings' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>

            {/* ─── Bottom Bar: Barra de Progreso + Controles Inferiores (Estilo AniCS C#) ─── */}
            <div
              className="no-gesture"
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              onWheel={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {/* Barra de Progreso / Timeline Seekbar con barra verde/azul */}
              <div style={{ position: 'relative', width: '100%', height: 16, display: 'flex', alignItems: 'center' }}>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={playbackTime}
                  onWheel={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}
                  onTouchMove={e => e.stopPropagation()}
                  onChange={e => {
                    const time = parseFloat(e.target.value);
                    setPlaybackTime(time);
                    if (videoRef.current) videoRef.current.currentTime = time;
                  }}
                  style={{
                    width: '100%', accentColor: 'var(--accent-primary)',
                    cursor: 'pointer', height: 6,
                  }}
                />
              </div>

              {/* Fila de Controles Inferiores */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                {/* Grupo Izquierdo: Botones de Reproducción, Saltos de 10s, Volumen y Tiempo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>
                  {/* Episodio Anterior */}
                  {currentEpisode.number > 1 && (
                    <button
                      onClick={() => handleLoadEpisode(currentEpisode.number - 1)}
                      title="Episodio anterior"
                      style={{
                        background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 'var(--radius-md)',
                        width: 32, height: 32, color: 'white', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                  )}

                  {/* Retroceder 10 Segundos */}
                  <button
                    onClick={() => seekRelative(-10)}
                    title="Retroceder 10s"
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 'var(--radius-md)',
                      width: 34, height: 32, color: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                      fontSize: 11, fontWeight: 700,
                    }}
                  >
                    <RotateCcw size={13} />
                    <span>10</span>
                  </button>

                  {/* Botón Principal PLAY / PAUSE */}
                  <button
                    onClick={togglePlay}
                    title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                      border: 'none', borderRadius: 'var(--radius-md)',
                      width: 40, height: 34, color: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: 'var(--shadow-glow)',
                    }}
                  >
                    {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: 2 }} />}
                  </button>

                  {/* Avanzar 10 Segundos */}
                  <button
                    onClick={() => seekRelative(10)}
                    title="Avanzar 10s"
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 'var(--radius-md)',
                      width: 34, height: 32, color: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                      fontSize: 11, fontWeight: 700,
                    }}
                  >
                    <span>10</span>
                    <FastForward size={13} />
                  </button>

                  {/* Episodio Siguiente */}
                  <button
                    onClick={() => handleLoadEpisode(currentEpisode.number + 1)}
                    title="Episodio siguiente"
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 'var(--radius-md)',
                      width: 32, height: 32, color: 'white', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <ChevronRight size={18} />
                  </button>

                  {/* Control de Volumen y Porcentaje */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                    </button>
                    {!isMobile && (
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          setIsMuted(false);
                        }}
                        style={{ width: 70, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                      />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 30 }}>
                      {isMuted ? '0%' : `${Math.round(volume * 100)}%`}
                    </span>
                  </div>

                  {/* Tiempo de Reproducción */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'white', marginLeft: 8 }}>
                    {formatTime(playbackTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Grupo Derecho: Estado, Selector de Velocidad, Saltar Intro y Pantalla Completa */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Botón Saltar Intro */}
                  <button
                    onClick={() => seekRelative(85)}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-full)', padding: '5px 12px',
                      color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <SkipForward size={12} /> Saltar Intro (+85s)
                  </button>

                  {/* Estado: ● Reproduciendo / ● Pausado */}
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: isPlaying ? '#34d399' : '#fbbf24',
                    background: isPlaying ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 191, 36, 0.12)',
                    padding: '3px 9px', borderRadius: 'var(--radius-full)',
                  }}>
                    ● {isPlaying ? 'Reproduciendo' : 'Pausado'}
                  </span>

                  {/* Selector de Velocidad Dropdown */}
                  <select
                    value={playbackSpeed}
                    onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-md)', padding: '3px 8px',
                      color: 'white', fontSize: 11, fontWeight: 700, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    {SPEED_OPTIONS.map(s => (
                      <option key={s} value={s} style={{ background: '#181920', color: 'white' }}>
                        {s}x
                      </option>
                    ))}
                  </select>

                  {/* Pantalla Completa */}
                  <button
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}
                  >
                    {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Drawer: Episodes List */}
      <AnimatePresence>
        {activeDrawer === 'servers' && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            data-drawer="true"
            className="drawer-panel"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '80vw' : 340,
              background: 'rgba(10,11,15,0.95)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 30, padding: 20, display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Episodios</h3>
              <button
                onClick={() => setActiveDrawer('none')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div
              style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}
              onWheel={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onTouchMove={e => e.stopPropagation()}
            >
              {currentAnime.episodes.map(ep => {
                const isCurrent = ep.number === currentEpisode.number;
                return (
                  <button
                    key={ep.number}
                    onClick={() => {
                      handleLoadEpisode(ep.number);
                      setActiveDrawer('none');
                    }}
                    style={{
                      padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: isCurrent ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${isCurrent ? 'transparent' : 'var(--border-subtle)'}`,
                      color: isCurrent ? 'white' : 'var(--text-primary)',
                      textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: isCurrent ? 700 : 500,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span>Episodio {ep.number}</span>
                    {isCurrent && <span style={{ fontSize: 10, fontWeight: 800 }}>ACTUAL</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Drawer: Settings & Servers Detailed */}
      <AnimatePresence>
        {activeDrawer === 'settings' && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25 }}
            data-drawer="true"
            className="drawer-panel"
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '80vw' : 340,
              background: 'rgba(10,11,15,0.95)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 30, padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white', margin: 0 }}>Ajustes de Reproducción</h3>
              <button
                onClick={() => setActiveDrawer('none')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Brillo */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sun size={14} color="#fbbf24" /> Brillo de Pantalla
                </span>
                <span style={{ fontSize: 12, color: 'white', fontWeight: 700 }}>{Math.round(brightness * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.1}
                max={1.5}
                step={0.05}
                value={brightness}
                onChange={e => setBrightness(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: 8, accentColor: '#fbbf24', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Tip: Desliza verticalmente en la mitad izquierda de la pantalla para ajustar.
              </span>
            </div>

            {/* Nivel de Ganancia de Audio */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Volume2 size={14} color="var(--accent-primary)" /> Ganancia de Audio
                </span>
                <span style={{ fontSize: 12, color: 'white', fontWeight: 700 }}>{isMuted ? 'Muted' : `${Math.round(volume * 100)}%`}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={e => {
                  setVolume(parseFloat(e.target.value));
                  setIsMuted(false);
                }}
                style={{ width: '100%', marginTop: 8, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Tip: Desliza verticalmente en la mitad derecha de la pantalla para ajustar.
              </span>
            </div>

            {/* Velocidad */}
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Velocidad de reproducción
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                {SPEED_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    style={{
                      padding: '8px 0', borderRadius: 'var(--radius-md)',
                      background: playbackSpeed === s ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${playbackSpeed === s ? 'transparent' : 'var(--border-subtle)'}`,
                      color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Escalado de Video */}
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Escalado de Video
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {ASPECT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setAspectRatio(opt.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 'var(--radius-md)',
                      background: aspectRatio === opt.id ? 'rgba(59,130,246,0.2)' : 'var(--bg-elevated)',
                      border: `1px solid ${aspectRatio === opt.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span>{opt.label}</span>
                    {aspectRatio === opt.id && <Check size={14} color="var(--accent-primary)" />}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
