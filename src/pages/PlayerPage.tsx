import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, ChevronLeft, ChevronRight,
  Loader2, FastForward, SkipForward, RotateCcw,
  Sparkles, Check, Sun, ListVideo, Zap, Server, AlertCircle, Moon
} from 'lucide-react';
import { usePlayerStore } from '@/stores/usePlayerStore';
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

  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [autoNext, setAutoNext] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'settings'>('none');

  // Gesture Feedback HUD Toasts
  const [hudToast, setHudToast] = useState<{ icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);

  const showToast = (toast: { icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number }) => {
    setHudToast(toast);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setHudToast(null), 1500);
  };

  // Orientación automática a horizontal en Android / Móvil al entrar al reproductor
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

  // Recuperación automática de estado desde URL si se abre directamente o se refresca
  useEffect(() => {
    const initFromParams = async () => {
      if (!queryUrl) return;
      const decoded = decodeURIComponent(queryUrl);

      if (currentAnime && currentEpisode && currentAnime.url === decoded) {
        return;
      }

      setIsLoadingInitial(true);
      setLoadError(null);
      try {
        const details = await getDetails(decoded, querySource);
        setCurrentAnime(details);

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
  }, [queryUrl, queryEp, querySource]);

  // Sincronizar volumen y velocidad en el elemento <video>
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed]);

  // Resolver automáticamente el mejor servidor al recibir lista de servidores
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

  // Selección y resolución de servidor dinámico
  const handleSelectServer = async (server: VideoServer, restoreTime?: number) => {
    const currentTime = restoreTime !== undefined ? restoreTime : (videoRef.current?.currentTime || 0);
    setSelectedServer(server);
    setIsResolving(true);
    setActiveDrawer('none');
    showToast({ icon: 'seek', text: `Cargando ${server.name}...` });

    try {
      const media = await resolveStream(server, currentAnime?.source ?? querySource);
      setResolvedMedia(media);

      setTimeout(() => {
        if (videoRef.current && currentTime > 5) {
          videoRef.current.currentTime = currentTime;
        }
      }, 400);
    } catch (e) {
      console.error(`Failed to resolve stream for ${server.name}:`, e);
      showToast({ icon: 'seek', text: `Servidor ${server.name} falló, buscando alternativa...` });
      tryFallbackServer(server.url);
    } finally {
      setIsResolving(false);
    }
  };

  const tryFallbackServer = (failedUrl?: string) => {
    const currentUrl = failedUrl || selectedServer?.url;
    const candidates = servers.filter(s => s.url !== currentUrl);
    const next = candidates.find(s => s.isDirect) || candidates[0];
    if (next) {
      showToast({ icon: 'seek', text: `Cambiando a ${next.name}...` });
      handleSelectServer(next, videoRef.current?.currentTime || 0);
    }
  };

  // Guardar progreso en historial
  const saveProgress = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentAnime || !currentEpisode) return;
    const progress = video.currentTime / (video.duration || 1);
    upsertHistory({
      id: `${currentAnime.url}-${currentEpisode.number}`,
      animeTitle: currentAnime.title,
      animeUrl: currentAnime.url,
      thumbnailUrl: currentAnime.thumbnailUrl,
      episodeNumber: currentEpisode.number,
      episodeUrl: currentEpisode.url,
      watchProgress: progress,
      watchedAt: new Date().toISOString(),
      source: currentAnime.source,
    }).catch(console.error);
  }, [currentAnime, currentEpisode]);

  // Cargar episodio específico (siguiente/anterior)
  const handleLoadEpisode = async (episodeNumber: number) => {
    if (!currentAnime) return;
    saveProgress();
    setIsResolving(true);
    setResolvedMedia(null);

    try {
      const details = await getDetails(currentAnime.url, currentAnime.source);
      const targetEp = details.episodes.find(e => e.number === episodeNumber);
      if (targetEp) {
        setCurrentEpisode(targetEp);
        const srvs = await getServers(targetEp.url, currentAnime.source);
        setServers(srvs);
      }
    } catch (e) {
      console.error('Error changing episode', e);
    } finally {
      setIsResolving(false);
    }
  };

  // Auto-ocultar controles
  const showControlsTemp = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    if (isPlaying && activeDrawer === 'none') {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3500);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.pause();
    } else {
      v.play();
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

  // GESTOS TÁCTILES COMPLETOS (Android / Móvil y Touchscreens):
  // - Izquierda: Deslizar verticalmente ajusta Brillo
  // - Derecha: Deslizar verticalmente ajusta Volumen
  // - Doble toque izquierda: -10s
  // - Doble toque derecha: +10s
  const handleTouchStart = (e: React.TouchEvent) => {
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
        touchActionSide.current = 'left'; // Brillo
      } else if (x > screenWidth * 0.55) {
        touchActionSide.current = 'right'; // Volumen
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

      // Sensibilidad del gesto vertical (deslizar ~300px recorre el rango completo)
      const change = deltaY / (screenHeight * 0.6);

      if (touchActionSide.current === 'left') {
        // Ajuste de brillo: 0.1 a 1.5
        const newBri = Math.max(0.1, Math.min(1.5, initialBrightness.current + change));
        setBrightness(newBri);
        showToast({
          icon: 'brightness',
          text: `Brillo: ${Math.round(newBri * 100)}%`,
          value: newBri,
        });
      } else if (touchActionSide.current === 'right') {
        // Ajuste de volumen: 0.0 a 1.0
        const newVol = Math.max(0, Math.min(1.0, initialVolume.current + change));
        setVolume(newVol);
        setIsMuted(false);
        showToast({
          icon: 'volume',
          text: `Volumen: ${Math.round(newVol * 100)}%`,
          value: newVol,
        });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const now = Date.now();
    const timeDiff = now - touchStartTime.current;

    // Detectar doble toque (tap rápido < 280ms sin mucho arrastre)
    if (timeDiff < 280 && touchStartX.current !== null && touchStartY.current !== null) {
      const doubleTapDiff = now - lastTapTime.current;
      const x = touchStartX.current;
      const screenWidth = window.innerWidth;

      if (doubleTapDiff < 300) {
        // Doble toque detectado
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

  // Rueda del ratón para PC / Desktop (ajuste rápido con scroll)
  const handleWheel = (e: React.WheelEvent) => {
    const x = e.clientX;
    const screenWidth = window.innerWidth;
    const isUp = e.deltaY < 0;

    if (x < screenWidth * 0.5) {
      // Mitad izquierda: Brillo
      const newBri = Math.max(0.1, Math.min(1.5, brightness + (isUp ? 0.05 : -0.05)));
      setBrightness(newBri);
      showToast({ icon: 'brightness', text: `Brillo: ${Math.round(newBri * 100)}%`, value: newBri });
    } else {
      // Mitad derecha: Volumen
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
        case 'm':
          setIsMuted(!isMuted);
          showToast({ icon: 'volume', text: !isMuted ? 'Silenciado' : 'Sonido activado' });
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n':
          if (currentEpisode) handleLoadEpisode(currentEpisode.number + 1);
          break;
        case 'p':
          if (currentEpisode && currentEpisode.number > 1) handleLoadEpisode(currentEpisode.number - 1);
          break;
        case 'escape':
          if (activeDrawer !== 'none') {
            setActiveDrawer('none');
          } else {
            saveProgress();
            navigate(-1);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, isMuted, currentEpisode, activeDrawer]);

  const handleEnded = () => {
    saveProgress();
    if (autoNext && currentEpisode) {
      handleLoadEpisode(currentEpisode.number + 1);
    }
  };

  if (isLoadingInitial) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, background: '#000' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.1)',
          borderTopColor: 'var(--accent-primary)',
          animation: 'spin-slow 0.8s linear infinite',
        }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Cargando reproductor y servidores...</p>
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
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000000',
      }}>
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

        {/* ── Capa de Atenuación de Brillo Física (Dimmer Overlay) ── */}
        {/* Garantiza atenuación real en hardware decoding tanto en Android como en Windows */}
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

      {/* HUD Toast (Quickshell Style) */}
      <AnimatePresence>
        {hudToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'absolute', top: isMobile ? 40 : 80,
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

      {/* Loading Overlay */}
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

      {/* Controls Overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.92) 100%)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              padding: isMobile ? '16px 20px' : '24px 28px',
              zIndex: 20, pointerEvents: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Top Bar: Back, Title & Dynamic Server Selector Chips */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <button
                  onClick={() => {
                    saveProgress();
                    navigate(-1);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)', flexShrink: 0,
                  }}
                >
                  <ArrowLeft size={18} />
                </button>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: isMobile ? 14 : 16, fontWeight: 800, color: 'white', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentAnime.title}
                  </h2>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Episodio {currentEpisode.number} {currentEpisode.title ? `· ${currentEpisode.title}` : ''}
                  </span>
                </div>
              </div>

              {/* Selector Rápido de Servidores Soportados (Magi, Desu, Mediafire, etc.) */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(10,11,15,0.75)', padding: '4px 8px',
                borderRadius: 'var(--radius-full)', border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)', overflowX: 'auto', maxWidth: isMobile ? 220 : 480,
              }}>
                {!isMobile && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', paddingLeft: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Server size={12} /> Servidor:
                  </span>
                )}
                {servers.map((srv, idx) => {
                  const isSelected = selectedServer?.url === srv.url;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectServer(srv)}
                      title={`Cambiar a ${srv.name}`}
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        background: isSelected
                          ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                          : 'rgba(255,255,255,0.06)',
                        border: `1px solid ${isSelected ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {srv.isDirect && <Zap size={10} color={isSelected ? 'white' : '#34d399'} fill="currentColor" />}
                      {srv.name}
                    </button>
                  );
                })}
              </div>

              {/* Settings & Episodes Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'servers' ? 'none' : 'servers')}
                  title="Lista de episodios"
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <ListVideo size={18} />
                </button>
                <button
                  onClick={() => setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings')}
                  title="Ajustes de reproducción"
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 'var(--radius-full)', width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <Settings size={18} />
                </button>
              </div>
            </div>

            {/* Center: Play/Pause Big Button & Quick Seek Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 24 : 36 }}>
              <button
                onClick={() => seekRelative(-10)}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
                  width: isMobile ? 42 : 50, height: isMobile ? 42 : 50, color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <RotateCcw size={isMobile ? 20 : 24} />
              </button>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                onClick={togglePlay}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  border: 'none', borderRadius: '50%',
                  width: isMobile ? 60 : 72, height: isMobile ? 60 : 72, color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--shadow-glow)',
                }}
              >
                {isPlaying ? <Pause size={isMobile ? 26 : 32} fill="white" /> : <Play size={isMobile ? 26 : 32} fill="white" style={{ marginLeft: 4 }} />}
              </motion.button>

              <button
                onClick={() => seekRelative(10)}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
                  width: isMobile ? 42 : 50, height: isMobile ? 42 : 50, color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <FastForward size={isMobile ? 20 : 24} />
              </button>
            </div>

            {/* Bottom Bar: Timeline, Volume, Skip Opening, Fullscreen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Timeline Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'white', minWidth: 40, textAlign: 'right' }}>
                  {formatTime(playbackTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={playbackTime}
                  onChange={e => {
                    const time = parseFloat(e.target.value);
                    setPlaybackTime(time);
                    if (videoRef.current) videoRef.current.currentTime = time;
                  }}
                  style={{
                    flex: 1, accentColor: 'var(--accent-primary)',
                    cursor: 'pointer', height: 6,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 40 }}>
                  {formatTime(duration)}
                </span>
              </div>

              {/* Actions Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Volume Controls (Desktop & Mobile) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
                      style={{ width: 80, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                    />
                  )}
                </div>

                {/* Center Quick Skip Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => seekRelative(85)}
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-full)', padding: isMobile ? '5px 10px' : '6px 14px',
                      color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <SkipForward size={12} /> Saltar Intro (+85s)
                  </button>
                  {currentEpisode.number > 1 && (
                    <button
                      onClick={() => handleLoadEpisode(currentEpisode.number - 1)}
                      style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 'var(--radius-full)', padding: isMobile ? '5px 8px' : '6px 12px',
                        color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 2,
                      }}
                    >
                      <ChevronLeft size={13} /> {!isMobile && 'Ep. Ant'}
                    </button>
                  )}
                  <button
                    onClick={() => handleLoadEpisode(currentEpisode.number + 1)}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: 'var(--radius-full)', padding: isMobile ? '5px 8px' : '6px 12px',
                      color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}
                  >
                    {!isMobile && 'Ep. Sig'} <ChevronRight size={13} />
                  </button>
                </div>

                {/* Right: Fullscreen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={toggleFullscreen}
                    style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                  >
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
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
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '80vw' : 340,
              background: 'rgba(10,11,15,0.95)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 30, padding: 20, display: 'flex', flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
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

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: isMobile ? '80vw' : 340,
              background: 'rgba(10,11,15,0.95)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 30, padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
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
                      color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Next */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'white', fontWeight: 600 }}>Siguiente episodio automático</span>
              <input
                type="checkbox"
                checked={autoNext}
                onChange={e => setAutoNext(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
