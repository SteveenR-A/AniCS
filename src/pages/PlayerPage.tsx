import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Settings, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { resolveStream } from '@/services/animeService';
import { upsertHistory } from '@/services/storageService';
import type { VideoServer } from '@/types';

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function PlayerPage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const {
    currentAnime, currentEpisode, servers, resolvedMedia,
    selectedServer, setSelectedServer, setResolvedMedia, setIsResolving,
    isResolving, volume, isMuted, setIsMuted,
    playbackTime, setPlaybackTime, duration, setDuration,
  } = usePlayerStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showServerMenu, setShowServerMenu] = useState(false);

  // Sincronizar volumen en el elemento de video
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Resolver automáticamente el primer servidor disponible al entrar
  useEffect(() => {
    if (servers.length > 0 && !resolvedMedia) {
      const firstDirect = servers.find(s => s.isDirect) ?? servers[0];
      if (firstDirect) handleSelectServer(firstDirect);
    }
  }, [servers]);

  // Cargar media en el video cuando se resuelve
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
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (resolvedMedia.mediaType === 'mp4') {
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
    setShowServerMenu(false);
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
  const saveProgress = () => {
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
  };

  // Auto-ocultar controles
  const showControlsTemp = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    if (isPlaying) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  if (!currentAnime || !currentEpisode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 16 }}>
        <p style={{ color: 'var(--text-muted)' }}>No hay contenido para reproducir</p>
        <button onClick={() => navigate(-1)} style={{ color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Volver
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ width: '100%', height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}
      onMouseMove={showControlsTemp}
      onClick={showControlsTemp}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
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
        onEnded={saveProgress}
      />

      {/* Loading overlay */}
      <AnimatePresence>
        {isResolving && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16,
            }}
          >
            <Loader2 size={40} color="var(--accent-primary)" style={{ animation: 'spin-slow 1s linear infinite' }} />
            <p style={{ color: 'white', fontSize: 14 }}>Cargando stream...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            {/* Top bar */}
            <div style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
              padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <button onClick={() => { saveProgress(); navigate(-1); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <ArrowLeft size={22} />
              </button>
              <div>
                <p style={{ color: 'white', fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{currentAnime.title}</p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Episodio {currentEpisode.number}</p>
              </div>
            </div>

            {/* Center play/pause */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
              <motion.button whileTap={{ scale: 0.9 }}
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.currentTime = Math.max(0, v.currentTime - 10);
                }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                <ChevronLeft size={24} />
              </motion.button>

              <motion.button whileTap={{ scale: 0.85 }}
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (isPlaying) { v.pause(); } else { v.play(); }
                }}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 68, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', backdropFilter: 'blur(12px)' }}>
                {isPlaying ? <Pause size={30} fill="white" /> : <Play size={30} fill="white" />}
              </motion.button>

              <motion.button whileTap={{ scale: 0.9 }}
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  v.currentTime = Math.min(v.duration, v.currentTime + 10);
                }}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}>
                <ChevronRight size={24} />
              </motion.button>
            </div>

            {/* Bottom bar */}
            <div style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
              padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Progress bar */}
              <div style={{ position: 'relative', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer' }}
                onClick={(e) => {
                  const v = videoRef.current;
                  if (!v) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
                }}
              >
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${duration > 0 ? (playbackTime / duration) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                  borderRadius: 2,
                }} />
              </div>

              {/* Control buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => { const v = videoRef.current; if (v) { if (isPlaying) { v.pause(); } else { v.play(); } } }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    {isPlaying ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
                  </button>
                  <button onClick={() => setIsMuted(!isMuted)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(playbackTime)} / {formatTime(duration)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
                  {/* Server selector */}
                  <button
                    onClick={() => setShowServerMenu(v => !v)}
                    style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '4px 10px', color: 'white', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Settings size={14} />
                    {selectedServer?.name ?? 'Servidor'}
                  </button>

                  <AnimatePresence>
                    {showServerMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                        style={{
                          position: 'absolute', bottom: '110%', right: 0,
                          background: 'rgba(17,19,24,0.95)', backdropFilter: 'blur(20px)',
                          border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                          padding: 8, minWidth: 160, zIndex: 50,
                        }}
                      >
                        {servers.map((s) => (
                          <button
                            key={s.url}
                            onClick={() => handleSelectServer(s)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                              padding: '8px 10px', background: selectedServer?.url === s.url ? 'var(--accent-primary-glow)' : 'transparent',
                              border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                            }}
                          >
                            {s.isDirect && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-success)', flexShrink: 0 }} />}
                            {s.name}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button onClick={toggleFullscreen} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex' }}>
                    <Maximize size={20} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
