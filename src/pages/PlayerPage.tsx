import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, ChevronLeft, ChevronRight,
  Loader2, FastForward, SkipForward, RotateCcw,
  Sparkles, Check, Sun, ListVideo
} from 'lucide-react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { resolveStream, getServers, getDetails } from '@/services/animeService';
import { upsertHistory } from '@/services/storageService';
import type { VideoServer } from '@/types';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const {
    currentAnime, currentEpisode, servers, resolvedMedia,
    selectedServer, setSelectedServer, setResolvedMedia, setIsResolving,
    isResolving, volume, isMuted, setVolume, setIsMuted,
    playbackTime, setPlaybackTime, duration, setDuration,
    setServers, setCurrentEpisode,
  } = usePlayerStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | 'fill'>('contain');
  const [autoNext, setAutoNext] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'servers' | 'settings'>('none');

  // Gesture Feedback Toasts (Quickshell HUD style)
  const [hudToast, setHudToast] = useState<{ icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);

  // Double tap animation indicators
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);

  const showToast = (toast: { icon: 'volume' | 'brightness' | 'seek'; text: string; value?: number }) => {
    setHudToast(toast);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setHudToast(null), 1400);
  };

  // Sincronizar volumen y velocidad
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed]);

  // Resolver primer servidor al cargar
  useEffect(() => {
    if (servers.length > 0 && !resolvedMedia) {
      const firstDirect = servers.find(s => s.isDirect) ?? servers[0];
      if (firstDirect) handleSelectServer(firstDirect);
    }
  }, [servers]);

  // Cargar stream en el video
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
    } else if (resolvedMedia.mediaType === 'mp4' || resolvedMedia.mediaType === 'unknown') {
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
    setActiveDrawer('none');
    try {
      const media = await resolveStream(server, currentAnime?.source ?? 'jkanime');
      setResolvedMedia(media);
    } catch (e) {
      console.error('Failed to resolve stream', e);
    } finally {
      setIsResolving(false);
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

  // Atajos de teclado para Windows / Desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si se está escribiendo en un input
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
        case 's': // Skip Intro
          e.preventDefault();
          seekRelative(85);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          showToast({ icon: 'volume', text: `${Math.round(Math.min(1, volume + 0.1) * 100)}%`, value: Math.min(1, volume + 0.1) });
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          showToast({ icon: 'volume', text: `${Math.round(Math.max(0, volume - 0.1) * 100)}%`, value: Math.max(0, volume - 0.1) });
          break;
        case 'm':
          setIsMuted(!isMuted);
          showToast({ icon: 'volume', text: !isMuted ? 'Silenciado' : 'Sonido activado' });
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n': // Next episode
          if (currentEpisode) handleLoadEpisode(currentEpisode.number + 1);
          break;
        case 'p': // Previous episode
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

  // Manejo de fin de video (Auto-Next)
  const handleEnded = () => {
    saveProgress();
    if (autoNext && currentEpisode) {
      handleLoadEpisode(currentEpisode.number + 1);
    }
  };

  if (!currentAnime || !currentEpisode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16, background: '#000' }}>
        <p style={{ color: 'var(--text-muted)' }}>No hay contenido para reproducir</p>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'var(--accent-primary)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', cursor: 'pointer',
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
      }}
      onMouseMove={showControlsTemp}
      onClick={showControlsTemp}
    >
      {/* ─── Video Layer: Geométricamente centrado en pantalla física ─── */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        filter: `brightness(${brightness})`,
      }}>
        <video
          ref={videoRef}
          style={{
            width: '100%', height: '100%',
            objectFit: aspectRatio,
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
          onEnded={handleEnded}
        />
      </div>

      {/* ─── Gesture Ripple Indicators (Double-tap seek) ─── */}
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
              background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
              borderRadius: 'var(--radius-xl)', padding: '16px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              color: 'white', zIndex: 30,
            }}
          >
            {doubleTapSide === 'left' ? <RotateCcw size={32} /> : <FastForward size={32} />}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {doubleTapSide === 'left' ? '-10s' : '+10s'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── HUD Toast (Quickshell Neon Pill) ─── */}
      <AnimatePresence>
        {hudToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(17, 19, 24, 0.85)', backdropFilter: 'blur(20px)',
              border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-full)',
              padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: 'var(--shadow-glow)', color: 'white', zIndex: 40,
            }}
          >
            {hudToast.icon === 'volume' && <Volume2 size={18} color="var(--accent-primary)" />}
            {hudToast.icon === 'brightness' && <Sun size={18} color="var(--accent-warning)" />}
            {hudToast.icon === 'seek' && <FastForward size={18} color="var(--accent-secondary)" />}
            <span style={{ fontSize: 13, fontWeight: 700 }}>{hudToast.text}</span>
            {hudToast.value !== undefined && (
              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }}>
                <div style={{ width: `${hudToast.value * 100}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 2 }} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Loading Overlay ─── */}
      <AnimatePresence>
        {isResolving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
              zIndex: 35,
            }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'var(--accent-primary-glow)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={32} color="var(--accent-primary)" style={{ animation: 'spin-slow 1s linear infinite' }} />
            </div>
            <p style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Cargando stream de video...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Controls Overlay (Safe-Area Centered for Android Cutout / Notch) ─── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              // Padding adaptativo para cámaras tipo notch / punch-hole en Android
              paddingTop: 'max(16px, env(safe-area-inset-top, 16px))',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
              paddingLeft: 'max(24px, env(safe-area-inset-left, 24px))',
              paddingRight: 'max(24px, env(safe-area-inset-right, 24px))',
              zIndex: 25, pointerEvents: 'none',
            }}
          >
            {/* 1. Top Bar */}
            <div style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
              borderRadius: 'var(--radius-lg)', padding: '12px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              pointerEvents: 'auto', backdropFilter: 'blur(8px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { saveProgress(); navigate(-1); }}
                  style={{
                    background: 'rgba(255,255,255,0.1)', border: 'none',
                    borderRadius: '50%', width: 36, height: 36,
                    color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ArrowLeft size={18} />
                </motion.button>
                <div>
                  <h1 style={{ color: 'white', fontSize: 15, fontWeight: 800, lineHeight: 1.2 }}>{currentAnime.title}</h1>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                    Episodio {currentEpisode.number} · {selectedServer?.name ?? 'Servidor'}
                  </p>
                </div>
              </div>

              {/* Botón Skip Intro (+85s) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => seekRelative(85)}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', padding: '6px 14px',
                    color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(8px)',
                  }}
                >
                  <FastForward size={14} color="var(--accent-secondary)" /> Saltar Intro (+85s)
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveDrawer(activeDrawer === 'servers' ? 'none' : 'servers')}
                  style={{
                    background: activeDrawer === 'servers' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                    border: 'none', borderRadius: 'var(--radius-full)', padding: '6px 14px',
                    color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(8px)',
                  }}
                >
                  <ListVideo size={14} /> Servidores ({servers.length})
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings')}
                  style={{
                    background: activeDrawer === 'settings' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                    border: 'none', borderRadius: '50%', width: 36, height: 36,
                    color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Settings size={18} />
                </motion.button>
              </div>
            </div>

            {/* 2. Center Action Controls (Quickshell Glass Pill) */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
              pointerEvents: 'auto',
            }}>
              {/* Episodio Anterior */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                disabled={currentEpisode.number <= 1}
                onClick={() => handleLoadEpisode(currentEpisode.number - 1)}
                style={{
                  background: 'rgba(17,19,24,0.7)', border: '1px solid var(--border-subtle)',
                  borderRadius: '50%', width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: currentEpisode.number <= 1 ? 'rgba(255,255,255,0.2)' : 'white',
                  cursor: currentEpisode.number <= 1 ? 'not-allowed' : 'pointer',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <ChevronLeft size={22} />
              </motion.button>

              {/* Retroceder 10s */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => seekRelative(-10)}
                style={{
                  background: 'rgba(17,19,24,0.7)', border: '1px solid var(--border-subtle)',
                  borderRadius: '50%', width: 48, height: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer', backdropFilter: 'blur(12px)',
                }}
              >
                <RotateCcw size={20} />
              </motion.button>

              {/* Play / Pause Principal */}
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={togglePlay}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  border: 'none', borderRadius: '50%', width: 72, height: 72,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer',
                  boxShadow: '0 0 25px var(--accent-primary-glow)',
                }}
              >
                {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" style={{ marginLeft: 4 }} />}
              </motion.button>

              {/* Avanzar 10s */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => seekRelative(10)}
                style={{
                  background: 'rgba(17,19,24,0.7)', border: '1px solid var(--border-subtle)',
                  borderRadius: '50%', width: 48, height: 48,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer', backdropFilter: 'blur(12px)',
                }}
              >
                <FastForward size={20} />
              </motion.button>

              {/* Siguiente Episodio */}
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleLoadEpisode(currentEpisode.number + 1)}
                style={{
                  background: 'rgba(17,19,24,0.7)', border: '1px solid var(--border-subtle)',
                  borderRadius: '50%', width: 44, height: 44,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer', backdropFilter: 'blur(12px)',
                }}
              >
                <SkipForward size={20} />
              </motion.button>
            </div>

            {/* 3. Bottom Bar */}
            <div style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
              borderRadius: 'var(--radius-lg)', padding: '14px 20px',
              display: 'flex', flexDirection: 'column', gap: 10,
              pointerEvents: 'auto', backdropFilter: 'blur(8px)',
            }}>
              {/* Progress Slider */}
              <div
                style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 3, cursor: 'pointer' }}
                onClick={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  v.currentTime = ((e.clientX - rect.left) / rect.width) * (v.duration || 0);
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${duration > 0 ? (playbackTime / duration) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                  borderRadius: 3,
                }} />
              </div>

              {/* Controles inferiores */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
                  </button>

                  <button onClick={() => setIsMuted(!isMuted)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>

                  <input
                    type="range" min="0" max="1" step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                    style={{ width: 80, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />

                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(playbackTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Selector de velocidad rápido */}
                  <button
                    onClick={() => {
                      const nextIdx = (SPEED_OPTIONS.indexOf(playbackSpeed) + 1) % SPEED_OPTIONS.length;
                      const nextSpeed = SPEED_OPTIONS[nextIdx];
                      setPlaybackSpeed(nextSpeed);
                      showToast({ icon: 'seek', text: `${nextSpeed}x Velocidad` });
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    {playbackSpeed}x
                  </button>

                  {/* Pantalla completa */}
                  <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Drawer 1: Selector de Servidores (Quickshell Glass Sheet) ─── */}
      <AnimatePresence>
        {activeDrawer === 'servers' && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 300,
              background: 'rgba(17, 19, 24, 0.95)', backdropFilter: 'blur(30px)',
              borderLeft: '1px solid var(--border-moderate)',
              padding: '24px 20px', zIndex: 50,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ListVideo size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>Servidores</h3>
              </div>
              <button onClick={() => setActiveDrawer('none')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
              {servers.map((s) => {
                const isSelected = selectedServer?.url === s.url;
                return (
                  <motion.button
                    key={s.url}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelectServer(s)}
                    style={{
                      padding: '12px 14px', borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: 'white', textAlign: 'left', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: s.isDirect ? 'var(--accent-success)' : 'var(--accent-warning)',
                      }} />
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {s.isDirect ? 'Directo / Rápido' : 'Servidor Web'}
                        </p>
                      </div>
                    </div>
                    {isSelected && <Check size={16} color="var(--accent-primary)" />}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Drawer 2: Ajustes de Reproducción ─── */}
      <AnimatePresence>
        {activeDrawer === 'settings' && (
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0, width: 320,
              background: 'rgba(17, 19, 24, 0.95)', backdropFilter: 'blur(30px)',
              borderLeft: '1px solid var(--border-moderate)',
              padding: '24px 20px', zIndex: 50,
              display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>Ajustes de Video</h3>
              </div>
              <button onClick={() => setActiveDrawer('none')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Proporción de aspecto */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                Proporción de Pantalla
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setAspectRatio(opt.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                      background: aspectRatio === opt.id ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                      border: aspectRatio === opt.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: 'white', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    {opt.label}
                    {aspectRatio === opt.id && <Check size={14} color="var(--accent-primary)" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Brillo */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
                Brillo ({Math.round(brightness * 100)}%)
              </label>
              <input
                type="range" min="0.4" max="1.6" step="0.05"
                value={brightness}
                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-warning)', cursor: 'pointer' }}
              />
            </div>

            {/* Auto siguiente episodio */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>Auto-Siguiente</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cargar siguiente episodio al finalizar</p>
              </div>
              <input
                type="checkbox" checked={autoNext}
                onChange={(e) => setAutoNext(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
