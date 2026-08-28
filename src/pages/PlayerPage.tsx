import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, ChevronLeft, ChevronRight,
  Loader2, SkipForward, SkipBack, RotateCcw, RotateCw,
  Sun, ListVideo, Zap, Server, AlertCircle,
  Eye, EyeOff, Scaling
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { resolveStream, getServers, getDetails } from '@/services/animeService';
import { upsertHistory, getEpisodeProgress } from '@/services/storageService';
import { getLocalMediaUrl } from '@/services/downloadService';
import { useResponsive } from '@/hooks/useResponsive';
import type { VideoServer } from '@/types';

function formatTime(s: number) {
  if (isNaN(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const ASPECT_OPTIONS = [
  { id: 'contain', label: 'Original / Ajustar (16:9)' },
  { id: 'cover', label: 'Recortar / Zoom pantalla' },
  { id: 'fill', label: 'Estirar a los bordes' },
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

  // Timers para distinguir 1 clic (mostrar/ocultar HUD) de 2 clics (seek/play)
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickCountRef = useRef(0);

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
    setServers, setCurrentEpisode, setCurrentAnime, resetPlayback
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
  const [showServerDropdown, setShowServerDropdown] = useState(false);

  // Gestos & HUD Toasts
  const [hudToast, setHudToast] = useState<{ icon: 'volume' | 'brightness' | 'seek' | 'aspect'; text: string; value?: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | null>(null);
  const [centerPlayPulse, setCenterPlayPulse] = useState<'play' | 'pause' | null>(null);

  const showToast = (toast: { icon: 'volume' | 'brightness' | 'seek' | 'aspect'; text: string; value?: number }) => {
    setHudToast(toast);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setHudToast(null), 1500);
  };

  const cycleAspectRatio = () => {
    const nextAspect: 'contain' | 'cover' | 'fill' =
      aspectRatio === 'contain' ? 'cover' : aspectRatio === 'cover' ? 'fill' : 'contain';
    setAspectRatio(nextAspect);
    const label = nextAspect === 'contain' ? 'Original (Ajustar 16:9)' : nextAspect === 'cover' ? 'Zoom (Llenar pantalla)' : 'Estirar imagen';
    showToast({ icon: 'aspect', text: `Aspecto: ${label}` });
  };

  const triggerCenterPulse = (type: 'play' | 'pause') => {
    setCenterPlayPulse(type);
    if (centerAnimTimeout.current) clearTimeout(centerAnimTimeout.current);
    centerAnimTimeout.current = setTimeout(() => setCenterPlayPulse(null), 500);
  };

  // Métodos de control de Pantalla Completa
  const enterFullscreen = useCallback(async () => {
    try {
      await invoke('set_fullscreen', { fullscreen: true });
    } catch {}
    try {
      const elem = document.documentElement as any;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } catch {}
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        const doc = document as any;
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
      }
    } catch {}
    try {
      await invoke('set_fullscreen', { fullscreen: false });
    } catch {}
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const isCurrentlyFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || isFullscreen);
    if (!isCurrentlyFull) {
      await enterFullscreen();
      setIsFullscreen(true);
    } else {
      await exitFullscreen();
      setIsFullscreen(false);
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Orientación horizontal automática, Pantalla Completa inmersiva y Screen Wake Lock
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.screen && 'orientation' in window.screen) {
        const orient = window.screen.orientation as any;
        if (orient && orient.lock) {
          orient.lock('landscape').catch(() => {});
        }
      }
    } catch {}

    enterFullscreen().catch(() => {});

    let wakeLockSentinel: any = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
        enterFullscreen().catch(() => {});
      }
    };

    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFull);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);

      if (wakeLockSentinel && typeof wakeLockSentinel.release === 'function') {
        wakeLockSentinel.release().catch(() => {});
      }

      exitFullscreen().catch(() => {});

      try {
        if (typeof window !== 'undefined' && window.screen && 'orientation' in window.screen) {
          const orient = window.screen.orientation as any;
          if (orient && orient.unlock) {
            orient.unlock();
          }
        }
      } catch {}
    };
  }, [enterFullscreen, exitFullscreen]);

  // Sincronización precisa de Anime y Episodio desde URL (sin mezclar animes previos)
  const currentLoadedKey = useRef<string>('');

  useEffect(() => {
    const initFromParams = async () => {
      if (!queryUrl) return;
      const decoded = decodeURIComponent(queryUrl);
      const epNum = queryEp ? parseInt(queryEp, 10) : 1;
      const loadKey = `${decoded}-${epNum}-${querySource}`;

      // Si ya está exactamente cargado, evitar duplicar
      if (currentLoadedKey.current === loadKey && resolvedMedia) {
        return;
      }

      currentLoadedKey.current = loadKey;
      resetPlayback();
      setIsLoadingInitial(true);
      setLoadError(null);

      try {
        let details = getCachedDetails(decoded);
        if (!details || details.url !== decoded) {
          details = await getDetails(decoded, querySource);
          cacheDetails(details);
        }

        setCurrentAnime(details);
        const targetEp = details.episodes.find(e => e.number === epNum) || details.episodes[0] || {
          number: epNum,
          title: `Episodio ${epNum}`,
          url: `${decoded.replace(/\/$/, '')}/${epNum}/`,
          watched: false,
        };
        setCurrentEpisode(targetEp);

        setIsResolving(true);
        if (querySource === 'local' || details.source === 'local' || (!targetEp.url.startsWith('http://') && !targetEp.url.startsWith('https://'))) {
          try {
            const streamUrl = await getLocalMediaUrl(targetEp.url);
            const isTs = targetEp.url.toLowerCase().endsWith('.ts');
            setResolvedMedia({
              directUrl: streamUrl,
              mediaType: isTs ? 'hls' : 'mp4',
              qualities: [],
            });
          } catch (err) {
            console.error('Failed to load local episode on init:', err);
          }
        } else {
          const srvs = await getServers(targetEp.url, querySource);
          setServers(srvs);

          const preferred = srvs.find(s => s.name.toLowerCase().includes('magi'))
            ?? srvs.find(s => s.name.toLowerCase().includes('desu'))
            ?? srvs.find(s => s.isDirect)
            ?? srvs[0];

          if (preferred) {
            setSelectedServer(preferred);
            const media = await resolveStream(preferred, querySource);
            setResolvedMedia(media);
          }
        }
        setIsResolving(false);
      } catch (err: any) {
        console.error('Failed to init player from URL params:', err);
        setLoadError(err?.message || 'No se pudo cargar el anime');
      } finally {
        setIsLoadingInitial(false);
      }
    };

    initFromParams();

    return () => {
      // Limpiar al desmontar la vista del reproductor
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      resetPlayback();
    };
  }, [queryUrl, queryEp, querySource]);

  // Sincronizar volumen y velocidad en el elemento <video>
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : volume;
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed]);

  // Resolver stream resuelto en el elemento de video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !resolvedMedia || !resolvedMedia.directUrl) {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      return;
    }

    // Cleanup previous hls instance and video state
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();

    let sourceUrl = resolvedMedia.directUrl;
    let isHls = resolvedMedia.mediaType === 'hls' || sourceUrl.includes('.m3u8');
    let blobUrlToRevoke: string | null = null;

    if (sourceUrl.toLowerCase().endsWith('.ts') && !sourceUrl.includes('.m3u8')) {
      isHls = true;
      const m3u8Content = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:7200\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:7200.0,\n${sourceUrl}\n#EXT-X-ENDLIST`;
      sourceUrl = URL.createObjectURL(new Blob([m3u8Content], { type: 'application/vnd.apple.mpegurl' }));
      blobUrlToRevoke = sourceUrl;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(sourceUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('Fatal HLS error, switching fallback server...', data);
          tryFallbackServer();
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
      video.play().catch(() => {});
    } else {
      video.src = sourceUrl;
      video.play().catch(() => {});
    }

    return () => {
      if (blobUrlToRevoke) {
        URL.revokeObjectURL(blobUrlToRevoke);
      }
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

  const playbackTimeRef = useRef(playbackTime);
  const durationRef = useRef(duration);
  const currentAnimeRef = useRef(currentAnime);
  const currentEpisodeRef = useRef(currentEpisode);
  const hasResumedProgressRef = useRef(false);
  const readyToSaveRef = useRef(false);

  useEffect(() => { playbackTimeRef.current = playbackTime; }, [playbackTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { currentAnimeRef.current = currentAnime; }, [currentAnime]);
  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
    hasResumedProgressRef.current = false;
    readyToSaveRef.current = false;
  }, [currentEpisode]);

  const tryFallbackServer = () => {
    if (!servers.length || !selectedServer) return;
    const currentIndex = servers.findIndex(s => s.url === selectedServer.url);
    const nextServer = servers[(currentIndex + 1) % servers.length];

    if (nextServer && nextServer.url !== selectedServer.url) {
      handleSelectServer(nextServer);
    }
  };

  // Guardar progreso en el historial de SQLite
  const saveProgress = useCallback((overrideProgress?: number) => {
    const anime = currentAnimeRef.current;
    const ep = currentEpisodeRef.current;
    if (!anime || !ep) return;

    if (!readyToSaveRef.current && typeof overrideProgress !== 'number') return;

    const dur = durationRef.current;
    const time = playbackTimeRef.current;

    let prog: number;
    if (typeof overrideProgress === 'number') {
      prog = overrideProgress;
    } else if (dur && dur > 0) {
      prog = Math.max(0.01, Math.min(1.0, time / dur));
    } else {
      return;
    }

    const cleanAnimeUrl = anime.url.replace(/\/+$/, '').trim();
    const cleanEpUrl = ep.url.replace(/\/+$/, '').trim();
    const epNum = ep.number;
    const historyId = `${cleanAnimeUrl}-${epNum}`;

    upsertHistory({
      id: historyId,
      animeTitle: anime.title,
      animeUrl: cleanAnimeUrl,
      thumbnailUrl: anime.thumbnailUrl,
      episodeNumber: epNum,
      episodeUrl: cleanEpUrl,
      watchProgress: prog,
      watchedAt: new Date().toISOString(),
      source: anime.source,
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => saveProgress(), 10000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [saveProgress]);

  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
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
    saveProgress(1.0);
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

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }

    setCurrentEpisode(ep);
    setResolvedMedia(null);
    setPlaybackTime(0);
    setDuration(0);
    setIsResolving(true);

    // Si es un anime descargado localmente, resolver a través del servidor local de streaming
    if (currentAnime.source === 'local' || (!ep.url.startsWith('http://') && !ep.url.startsWith('https://'))) {
      try {
        const streamUrl = await getLocalMediaUrl(ep.url);
        const isTs = ep.url.toLowerCase().endsWith('.ts');
        setResolvedMedia({
          directUrl: streamUrl,
          mediaType: isTs ? 'hls' : 'mp4',
          qualities: [],
        });
      } catch (err) {
        console.error('Failed to load local episode:', err);
      } finally {
        setIsResolving(false);
      }
      return;
    }

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

  // Manejo de Clics en Pantalla (1 clic = HUD on/off, 2 clics = seek / pause)
  const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      activeDrawer !== 'none' ||
      target.closest('[data-interactive]') ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('.no-gesture')
    ) {
      return;
    }

    const x = e.clientX;
    const screenWidth = window.innerWidth;
    const now = Date.now();
    const doubleTapDiff = now - lastTapTime.current;

    if (doubleTapDiff < 300) {
      // It's a double click
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      if (x < screenWidth * 0.35) {
        seekRelative(-10);
        setDoubleTapSide('left');
        setTimeout(() => setDoubleTapSide(null), 600);
      } else if (x > screenWidth * 0.65) {
        seekRelative(10);
        setDoubleTapSide('right');
        setTimeout(() => setDoubleTapSide(null), 600);
      } else {
        togglePlay();
      }
      lastTapTime.current = 0;
    } else {
      // First click
      lastTapTime.current = now;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = setTimeout(() => {
        toggleControlsManual();
        clickTimeoutRef.current = null;
      }, 300);
    }
  };

  // Gestos táctiles
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      enterFullscreen().catch(() => {});
    }

    const target = e.target as HTMLElement;
    if (
      activeDrawer !== 'none' ||
      target.closest('[data-interactive]') ||
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

      if (x < screenWidth * 0.4) {
        touchActionSide.current = 'left';
      } else if (x > screenWidth * 0.6) {
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

      if (Math.abs(deltaY) > 10) {
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
    }
  };

  const handleTouchEnd = () => {
    const now = Date.now();
    const timeDiff = now - touchStartTime.current;

    if (timeDiff < 280 && touchStartX.current !== null && touchStartY.current !== null) {
      const doubleTapDiff = now - lastTapTime.current;
      const x = touchStartX.current;
      const screenWidth = window.innerWidth;

      if (doubleTapDiff < 300) {
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
          clickTimeoutRef.current = null;
        }

        if (x < screenWidth * 0.35) {
          seekRelative(-10);
          setDoubleTapSide('left');
          setTimeout(() => setDoubleTapSide(null), 600);
        } else if (x > screenWidth * 0.65) {
          seekRelative(10);
          setDoubleTapSide('right');
          setTimeout(() => setDoubleTapSide(null), 600);
        } else {
          togglePlay();
        }
        lastTapTime.current = 0;
      } else {
        lastTapTime.current = now;
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
        clickTimeoutRef.current = setTimeout(() => {
          toggleControlsManual();
          clickTimeoutRef.current = null;
        }, 300);
      }
    }

    touchStartY.current = null;
    touchStartX.current = null;
    touchActionSide.current = null;
  };

  // Rueda del ratón para volumen y brillo
  const handleWheel = (e: React.WheelEvent) => {
    const target = e.target as HTMLElement;
    if (
      activeDrawer !== 'none' ||
      target.closest('[data-interactive]') ||
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

  // Atajos de teclado
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
        <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>Cargando anime...</p>
      </div>
    );
  }

  if (!currentAnime || !currentEpisode) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16, background: '#000', padding: 24, textAlign: 'center' }}>
        <AlertCircle size={48} style={{ color: '#f87171', opacity: 0.8 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>
          {loadError || 'No hay contenido seleccionado'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 400 }}>
          Selecciona un episodio para comenzar a reproducir.
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
      }}
      onMouseMove={showControlsTemp}
      onClick={handleScreenClick}
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
          background: '#000000', pointerEvents: 'none',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          webkit-playsinline="true"
          style={{
            width: '100%', height: '100%',
            maxWidth: '100%', maxHeight: '100%',
            objectFit: aspectRatio,
            filter: brightness > 1 ? `brightness(${brightness})` : undefined,
          }}
          onPlay={() => {
            setIsPlaying(true);
            if (readyToSaveRef.current) {
              saveProgress();
            }
          }}
          onPause={() => {
            setIsPlaying(false);
            saveProgress();
          }}
          onLoadedMetadata={async () => {
            const v = videoRef.current;
            if (v) {
              setDuration(v.duration);
              durationRef.current = v.duration;
              if (!hasResumedProgressRef.current && currentEpisodeRef.current) {
                try {
                  const savedProg = await getEpisodeProgress(currentEpisodeRef.current.url);
                  if (savedProg && savedProg > 0.01 && savedProg < 0.95 && v.duration > 0) {
                    const targetTime = savedProg * v.duration;
                    v.currentTime = targetTime;
                    hasResumedProgressRef.current = true;
                    setTimeout(() => { readyToSaveRef.current = true; }, 1500);
                    showToast({ icon: 'seek', text: `Reanudado al ${Math.round(savedProg * 100)}%` });
                  } else {
                    readyToSaveRef.current = true;
                  }
                } catch (e) {
                  console.error('Error resuming progress:', e);
                  readyToSaveRef.current = true;
                }
              } else {
                readyToSaveRef.current = true;
              }
            }
          }}
          onTimeUpdate={() => {
            const v = videoRef.current;
            if (v) {
              setPlaybackTime(v.currentTime);
              playbackTimeRef.current = v.currentTime;
            }
          }}
          onDurationChange={() => {
            const v = videoRef.current;
            if (v) {
              setDuration(v.duration);
              durationRef.current = v.duration;
            }
          }}
          onError={() => {
            console.warn('Video error, switching fallback server...');
            tryFallbackServer();
          }}
          onEnded={handleEnded}
        />

        {/* Dimmer de Brillo */}
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

      {/* Center Play/Pause Pulse Animation */}
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
            {doubleTapSide === 'left' ? <RotateCcw size={32} /> : <RotateCw size={32} />}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {doubleTapSide === 'left' ? '-10s' : '+10s'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD Toast */}
      <AnimatePresence>
        {hudToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            style={{
              position: 'absolute', top: isMobile ? 'calc(24px + env(safe-area-inset-top, 0px))' : 70,
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
            {hudToast.icon === 'aspect' && <Scaling size={16} color="var(--accent-primary)" />}
            <span>{hudToast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Stream Overlay */}
      {isResolving && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, zIndex: 15, pointerEvents: 'none',
        }}>
          <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
          <span style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>Cargando servidor...</span>
        </div>
      )}

      {/* ── Overlay HUD Elegante y Limpio (Estilo C# / Imagen 3) ── */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="controls-overlay"
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 25%, transparent 65%, rgba(0,0,0,0.92) 100%)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              paddingTop: isMobile ? 'calc(12px + env(safe-area-inset-top, 0px))' : '18px',
              paddingBottom: isMobile ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : '18px',
              paddingLeft: isMobile ? 'calc(16px + env(safe-area-inset-left, 0px))' : '24px',
              paddingRight: isMobile ? 'calc(16px + env(safe-area-inset-right, 0px))' : '24px',
              zIndex: 20, pointerEvents: 'auto',
            }}
            onClick={handleScreenClick}
            onWheel={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            {/* ── Top Bar (Imagen 3): Volver + Título a la Izquierda | Estado + Servidor + Reload + Ajustes a la Derecha ── */}
            <div
              data-interactive
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
            >
              {/* Izquierda: Botón Volver + Título del Anime */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <button
                  onClick={() => {
                    saveProgress();
                    navigate(-1);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', padding: '6px 14px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)', flexShrink: 0,
                    fontSize: 13, fontWeight: 700,
                  }}
                >
                  <ChevronLeft size={16} /> Volver
                </button>

                <h2 style={{
                  fontSize: isMobile ? 13 : 15, fontWeight: 700, color: 'white', margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {currentAnime.title} — Episodio {currentEpisode.number}
                </h2>
              </div>

              {/* Derecha: Estado + Servidor Dropdown + Botón Reload + Botón Ajustes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                {/* Badge de Estado: Reproduciendo / Pausado */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: isPlaying ? 'rgba(59, 130, 246, 0.25)' : 'rgba(251, 191, 36, 0.2)',
                  border: isPlaying ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(251, 191, 36, 0.4)',
                  padding: '5px 12px', borderRadius: 'var(--radius-full)',
                  color: 'white', fontSize: 11, fontWeight: 700,
                }}>
                  {isPlaying ? <Play size={11} fill="white" /> : <Pause size={11} fill="white" />}
                  <span>{isPlaying ? 'Reproduciendo' : 'Pausado'}</span>
                </div>

                {/* Selector de Servidor */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowServerDropdown(!showServerDropdown)}
                    title="Seleccionar servidor de video"
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-full)', padding: '5px 12px',
                      color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(10px)',
                    }}
                  >
                    <span>{selectedServer?.name || '1080p'}</span>
                  </button>

                  <AnimatePresence>
                    {showServerDropdown && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        style={{
                          position: 'absolute', top: '120%', right: 0,
                          background: 'rgba(15,16,22,0.96)', backdropFilter: 'blur(20px)',
                          border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-lg)',
                          padding: 8, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 4,
                          minWidth: 160, boxShadow: 'var(--shadow-lg)',
                        }}
                      >
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '4px 8px' }}>
                          Servidores
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
                                {srv.name}
                              </span>
                            </button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Botón Alternar / Cambiar Servidor Siguiente */}
                <button
                  onClick={tryFallbackServer}
                  title="Cambiar al siguiente servidor"
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <RotateCw size={15} />
                </button>

                {/* Botón Lista de Episodios */}
                <button
                  onClick={() => {
                    setActiveDrawer(activeDrawer === 'servers' ? 'none' : 'servers');
                    setShowServerDropdown(false);
                  }}
                  title="Lista de episodios"
                  style={{
                    background: activeDrawer === 'servers' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <ListVideo size={15} />
                </button>

                {/* Botón Ajustes */}
                <button
                  onClick={() => {
                    setActiveDrawer(activeDrawer === 'settings' ? 'none' : 'settings');
                    setShowServerDropdown(false);
                  }}
                  title="Ajustes de video"
                  style={{
                    background: activeDrawer === 'settings' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <Settings size={15} />
                </button>
              </div>
            </div>

            {/* ── Bottom Bar (Imagen 3): Barra de Progreso Delgada + Controles Izquierda / Velocidad y Opciones Derecha ── */}
            <div
              data-interactive
              onClick={e => e.stopPropagation()}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {/* Barra de Progreso */}
              <div
                style={{
                  width: '100%', height: 18, display: 'flex', alignItems: 'center',
                  cursor: 'pointer', position: 'relative',
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  const target = pos * (duration || 0);
                  if (videoRef.current) {
                    videoRef.current.currentTime = target;
                    setPlaybackTime(target);
                  }
                }}
              >
                <div style={{
                  width: '100%', height: 3, background: 'rgba(255,255,255,0.25)',
                  borderRadius: 2, position: 'relative', overflow: 'visible',
                }}>
                  {/* Progreso Reproducido */}
                  <div style={{
                    width: `${duration > 0 ? (playbackTime / duration) * 100 : 0}%`,
                    height: '100%', background: 'var(--accent-primary)', borderRadius: 2,
                    position: 'relative',
                  }}>
                    {/* Thumb Circle */}
                    <div style={{
                      position: 'absolute', right: -5, top: -4,
                      width: 11, height: 11, borderRadius: '50%',
                      background: 'white', boxShadow: '0 0 8px rgba(0,0,0,0.6)',
                    }} />
                  </div>
                </div>
              </div>

              {/* Fila Inferior de Controles */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Grupo Izquierda (Imagen 3): ⏮ | ↺ 10 | ▶/⏸ | 10 ↻ | ⏭ | 0:04 / 24:16 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Episodio Anterior */}
                  <button
                    disabled={!currentAnime || currentEpisode.number <= 1}
                    onClick={() => handleLoadEpisode(currentEpisode.number - 1)}
                    style={{
                      background: 'none', border: 'none',
                      color: currentEpisode.number > 1 ? 'white' : 'rgba(255,255,255,0.3)',
                      cursor: currentEpisode.number > 1 ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', padding: 4,
                    }}
                  >
                    <SkipBack size={18} />
                  </button>

                  {/* Retroceder 10s */}
                  <button
                    onClick={() => seekRelative(-10)}
                    style={{
                      background: 'none', border: 'none', color: 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                      fontSize: 12, fontWeight: 700, padding: 4,
                    }}
                  >
                    <RotateCcw size={16} /> 10
                  </button>

                  {/* Play / Pause Botón Circular */}
                  <button
                    onClick={togglePlay}
                    style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', cursor: 'pointer', backdropFilter: 'blur(8px)',
                    }}
                  >
                    {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: 2 }} />}
                  </button>

                  {/* Avanzar 10s */}
                  <button
                    onClick={() => seekRelative(10)}
                    style={{
                      background: 'none', border: 'none', color: 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                      fontSize: 12, fontWeight: 700, padding: 4,
                    }}
                  >
                    10 <RotateCw size={16} />
                  </button>

                  {/* Episodio Siguiente */}
                  <button
                    disabled={!currentAnime || currentEpisode.number >= currentAnime.episodes.length}
                    onClick={() => handleLoadEpisode(currentEpisode.number + 1)}
                    style={{
                      background: 'none', border: 'none',
                      color: currentEpisode.number < currentAnime.episodes.length ? 'white' : 'rgba(255,255,255,0.3)',
                      cursor: currentEpisode.number < currentAnime.episodes.length ? 'pointer' : 'not-allowed',
                      display: 'flex', alignItems: 'center', padding: 4,
                    }}
                  >
                    <SkipForward size={18} />
                  </button>

                  {/* Timestamp */}
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'white', marginLeft: 6 }}>
                    {formatTime(playbackTime)} / {formatTime(duration)}
                  </span>
                </div>

                {/* Grupo Derecha (Imagen 3): Saltar Intro + Velocidad 1.0X + Aspecto / Fullscreen */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Saltar Intro */}
                  {duration > 120 && (
                    <button
                      onClick={() => seekRelative(85)}
                      style={{
                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: 'var(--radius-full)', padding: '5px 12px',
                        color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      Saltar Intro (+85s)
                    </button>
                  )}

                  {/* Selector de Velocidad (1.0X estilo Imagen 3) */}
                  <button
                    onClick={() => {
                      const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed);
                      const nextSpeed = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
                      setPlaybackSpeed(nextSpeed);
                      showToast({ icon: 'seek', text: `Velocidad: ${nextSpeed}x` });
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-md)', padding: '5px 10px',
                      color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {playbackSpeed.toFixed(1)}X
                  </button>

                  {/* Botón de Aspecto */}
                  <button
                    onClick={cycleAspectRatio}
                    title="Relación de aspecto"
                    style={{
                      background: aspectRatio !== 'contain' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-md)', padding: '5px 8px',
                      color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Scaling size={14} />
                    <span>{aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'Zoom' : 'Estirar'}</span>
                  </button>

                  {/* Botón de Pantalla Completa (Fullscreen) */}
                  <button
                    onClick={toggleFullscreen}
                    title={isFullscreen ? 'Salir de pantalla completa (F)' : 'Pantalla completa (F)'}
                    style={{
                      background: isFullscreen ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-md)', padding: '5px 8px',
                      color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drawer Lateral de Episodios ── */}
      <AnimatePresence>
        {activeDrawer === 'servers' && (
          <motion.div
            data-interactive
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: isMobile ? 'min(270px, 72vw)' : 320, maxWidth: '100%',
              background: 'rgba(12, 13, 18, 0.96)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 35, display: 'flex', flexDirection: 'column',
              padding: isMobile ? '12px 14px' : 16, boxShadow: 'var(--shadow-2xl)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: 'white', margin: 0 }}>
                Episodios ({currentAnime.episodes.length})
              </h3>
              <button
                onClick={() => setActiveDrawer('none')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {currentAnime.episodes.map(ep => {
                const isCurrent = currentEpisode.number === ep.number;
                return (
                  <button
                    key={ep.number}
                    onClick={() => {
                      handleLoadEpisode(ep.number);
                      setActiveDrawer('none');
                    }}
                    style={{
                      padding: isMobile ? '8px 10px' : '10px 12px', borderRadius: 'var(--radius-md)',
                      background: isCurrent ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${isCurrent ? 'transparent' : 'var(--border-subtle)'}`,
                      color: 'white', fontSize: isMobile ? 12 : 13, fontWeight: isCurrent ? 700 : 500,
                      textAlign: 'left', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span>Episodio {ep.number}</span>
                    {isCurrent && <Play size={13} fill="white" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Drawer Lateral de Ajustes ── */}
      <AnimatePresence>
        {activeDrawer === 'settings' && (
          <motion.div
            data-interactive
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'absolute', top: 0, right: 0, bottom: 0,
              width: isMobile ? 'min(270px, 72vw)' : 320, maxWidth: '100%',
              background: 'rgba(12, 13, 18, 0.96)', backdropFilter: 'blur(24px)',
              borderLeft: '1px solid var(--border-moderate)',
              zIndex: 35, display: 'flex', flexDirection: 'column',
              padding: isMobile ? '12px 14px' : '16px 18px',
              gap: isMobile ? 12 : 16,
              boxShadow: 'var(--shadow-2xl)',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: isMobile ? 13 : 15, fontWeight: 700, color: 'white', margin: 0 }}>Ajustes de Video</h3>
              <button
                onClick={() => setActiveDrawer('none')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
              >
                Cerrar
              </button>
            </div>

            {/* Brillo */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sun size={12} /> Brillo
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fbbf24' }}>
                  {Math.round(brightness * 100)}%
                </span>
              </div>
              <input
                type="range" min={0.2} max={1.5} step={0.05} value={brightness}
                onChange={e => setBrightness(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
              />
            </div>

            {/* Volumen */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isMuted || volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />} Volumen
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
                  {isMuted ? 'Mute' : `${Math.round(volume * 100)}%`}
                </span>
              </div>
              <input
                type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  if (val > 0 && isMuted) setIsMuted(false);
                }}
                style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
            </div>

            {/* Velocidad de Reproducción */}
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Velocidad
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginTop: 5 }}>
                {SPEED_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      setPlaybackSpeed(s);
                      showToast({ icon: 'seek', text: `Velocidad: ${s}x` });
                    }}
                    style={{
                      padding: isMobile ? '5px 0' : '7px 0', borderRadius: 'var(--radius-md)',
                      background: playbackSpeed === s ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${playbackSpeed === s ? 'transparent' : 'var(--border-subtle)'}`,
                      color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Escalado de Video */}
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Escalado
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 5 }}>
                {ASPECT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setAspectRatio(opt.id);
                      showToast({ icon: 'aspect', text: `Aspecto: ${opt.label}` });
                    }}
                    style={{
                      padding: isMobile ? '6px 10px' : '8px 12px', borderRadius: 'var(--radius-md)',
                      background: aspectRatio === opt.id ? 'rgba(59,130,246,0.2)' : 'var(--bg-elevated)',
                      border: `1px solid ${aspectRatio === opt.id ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {opt.label}
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
