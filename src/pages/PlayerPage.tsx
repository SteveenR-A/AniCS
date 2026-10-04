import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, ChevronLeft,
  Loader2, SkipForward, SkipBack, RotateCcw, RotateCw,
  Sun, ListVideo, Zap, AlertCircle,
  Scaling, Smartphone, Crown, ExternalLink, Tv
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSubscriptionStore } from '@/stores/useSubscriptionStore';
import { FEATURE_FLAGS } from '@/config/features';
import { resolveStream, getServers, getDetails } from '@/services/animeService';
import { upsertHistory, getEpisodeProgress } from '@/services/storageService';
import { getLocalMediaUrl, setKeepScreenOn, setNativeFullscreen, setNativeScreenOrientation } from '@/services/downloadService';
import { useResponsive } from '@/hooks/useResponsive';
import { rewriteDeadCdnUrl, createRobustHlsLoader } from '@/utils/hlsLoader';
import { isVipServer, getServerPriority } from '@/utils/serverUtils';
import { usePlaybackServers } from '@/hooks/usePlaybackServers';
import { ServerSelector } from '@/components/player/ServerSelector';
import { CastDialog } from '@/components/player/CastDialog';
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
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const doubleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Side taps retain the double-tap seek gesture.
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch gesture state refs
  const touchStartY = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartTime = useRef<number>(0);
  const touchActionSide = useRef<'left' | 'right' | null>(null);
  const initialBrightness = useRef<number>(1.0);
  const initialVolume = useRef<number>(1.0);
  const lastTapTime = useRef<number>(0);
  const suppressTouchClickRef = useRef(false);

  const queryUrl = searchParams.get('url');
  const queryEp = searchParams.get('ep');
  const querySource = searchParams.get('source') ?? 'jkanime';
  const queryAnimeUrl = searchParams.get('animeUrl');

  const {
    currentAnime, currentEpisode, servers: extractedServers, resolvedMedia,
    selectedServer, setSelectedServer, setResolvedMedia, setIsResolving,
    isResolving, volume, isMuted, setVolume, setIsMuted,
    playbackTime, setPlaybackTime, duration, setDuration,
    setServers, setCurrentEpisode, setCurrentAnime, resetPlayback
  } = usePlayerStore();

  const { isVip, openModal: openVipModal } = useSubscriptionStore();
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
  const [showCastDialog, setShowCastDialog] = useState(false);
  const { servers, refresh: refreshServers, addServer } = usePlaybackServers(extractedServers, currentEpisode?.url || '', querySource);
  const interactionRef = useRef({ activeDrawer, showServerDropdown, showControls });
  interactionRef.current = { activeDrawer, showServerDropdown, showControls };
  const pendingSwitchRef = useRef<{ time: number; playing: boolean } | null>(null);
  const serverRequestRef = useRef(0);
  const lastTimeUiUpdateRef = useRef(0);

  const playbackTimeRef = useRef(playbackTime);
  const durationRef = useRef(duration);
  const currentAnimeRef = useRef(currentAnime);
  const currentEpisodeRef = useRef(currentEpisode);
  const hasResumedProgressRef = useRef(false);
  const readyToSaveRef = useRef(false);
  const pendingProgressPromiseRef = useRef<Promise<number | null> | null>(null);
  const mediaSessionRef = useRef(0);
  const progressReadyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const markProgressReady = useCallback(() => {
    clearTimeout(progressReadyTimerRef.current);
    const session = mediaSessionRef.current;
    progressReadyTimerRef.current = setTimeout(() => {
      if (session === mediaSessionRef.current) readyToSaveRef.current = true;
    }, 1500);
  }, []);

  useEffect(() => { playbackTimeRef.current = playbackTime; }, [playbackTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { currentAnimeRef.current = currentAnime; }, [currentAnime]);
  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
    hasResumedProgressRef.current = false;
    readyToSaveRef.current = false;
  }, [currentEpisode]);

  // Detección reactiva de orientación vertical (Portrait)
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerHeight > window.innerWidth;
    }
    return false;
  });
  const [screenOrientation, setScreenOrientation] = useState<'auto' | 'landscape' | 'portrait'>('auto');

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const toggleScreenOrientation = async () => {
    let nextOrientation: 'auto' | 'landscape' | 'portrait' = 'landscape';
    if (screenOrientation === 'auto') {
      nextOrientation = 'landscape';
    } else if (screenOrientation === 'landscape') {
      nextOrientation = 'portrait';
    } else {
      nextOrientation = 'auto';
    }

    setScreenOrientation(nextOrientation);
    setNativeScreenOrientation(nextOrientation);

    // Fallback Web / PWA
    try {
      if (typeof window !== 'undefined' && window.screen && 'orientation' in window.screen) {
        const orient = window.screen.orientation as any;
        if (nextOrientation === 'landscape' && orient?.lock) {
          await orient.lock('landscape').catch(() => {});
        } else if (nextOrientation === 'portrait' && orient?.lock) {
          await orient.lock('portrait').catch(() => {});
        } else if (orient?.unlock) {
          orient.unlock();
        }
      }
    } catch {}

    const label = nextOrientation === 'landscape' ? 'Horizontal' : nextOrientation === 'portrait' ? 'Vertical' : 'Automática (Sensor)';
    showToast({ icon: 'aspect', text: `Orientación: ${label}` });
  };

  // Gestos & HUD Toasts
  const [hudToast, setHudToast] = useState<{ icon: 'volume' | 'brightness' | 'seek' | 'aspect' | 'vip' | 'external' | 'server'; text: string; value?: number } | null>(null);
  const [brightness, setBrightness] = useState(1.0);
  const [doubleTapSide, setDoubleTapSide] = useState<'left' | 'right' | 'center' | null>(null);
  const [doubleTapAction, setDoubleTapAction] = useState<'pause' | 'play' | null>(null);

  // Timeline scrubbing (desplazamiento continuo estilo mpv con puntero táctil/ratón)
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number; percent: number } | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const calculateSeekTime = useCallback((clientX: number) => {
    if (!progressBarRef.current || !duration || duration <= 0) return { time: 0, percent: 0, x: 0 };
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = rect.width > 0 ? (x / rect.width) * 100 : 0;
    const time = Math.max(0, Math.min(duration, (percent / 100) * duration));
    return { time, percent, x };
  }, [duration]);

  const handleProgressBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    const { time, percent, x } = calculateSeekTime(e.clientX);
    setIsScrubbing(true);
    setScrubTime(time);
    setPlaybackTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
    setHoverPosition({ x, time, percent });
  };

  const handleProgressBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const { time, percent, x } = calculateSeekTime(e.clientX);
    if (isScrubbing) {
      setScrubTime(time);
      setPlaybackTime(time);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
      setHoverPosition({ x, time, percent });
    } else {
      setHoverPosition({ x, time, percent });
    }
  };

  const handleProgressBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (isScrubbing) {
      const { time } = calculateSeekTime(e.clientX);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
      }
      setPlaybackTime(time);
      setIsScrubbing(false);
      setScrubTime(null);
      saveProgress();
    }
  };

  const handleProgressBarPointerLeave = () => {
    if (!isScrubbing) {
      setHoverPosition(null);
    }
  };

  const showToast = (toast: { icon: 'volume' | 'brightness' | 'seek' | 'aspect' | 'vip' | 'external' | 'server'; text: string; value?: number }) => {
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
      setNativeFullscreen(true);
      setIsFullscreen(true);
    } else {
      await exitFullscreen();
      setNativeFullscreen(false);
      setIsFullscreen(false);
    }
  }, [isFullscreen, enterFullscreen, exitFullscreen]);

  // Pantalla Completa inmersiva sin bloqueo rígido de orientación
  useEffect(() => {
    enterFullscreen().catch(() => {});
    setNativeFullscreen(true);

    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFull);
      setNativeFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);

      // Restaurar barras del sistema, orientación y permitir que la pantalla se apague normalmente al salir
      setNativeFullscreen(false);
      setNativeScreenOrientation('unspecified');
      setKeepScreenOn(false);
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

  // Screen Wake Lock y mantenimiento de pantalla activa estrictamente reactivo a isPlaying
  const wakeLockSentinelRef = useRef<any>(null);

  useEffect(() => {
    let isSubscribed = true;

    const updateScreenLock = async () => {
      if (isPlaying && document.visibilityState === 'visible') {
        setKeepScreenOn(true);
        try {
          if ('wakeLock' in navigator && !wakeLockSentinelRef.current) {
            const sentinel = await (navigator as any).wakeLock.request('screen');
            if (isSubscribed) {
              wakeLockSentinelRef.current = sentinel;
              sentinel.addEventListener?.('release', () => {
                if (wakeLockSentinelRef.current === sentinel) {
                  wakeLockSentinelRef.current = null;
                }
              });
            } else {
              sentinel.release().catch(() => {});
            }
          }
        } catch {}
      } else {
        setKeepScreenOn(false);
        if (wakeLockSentinelRef.current && typeof wakeLockSentinelRef.current.release === 'function') {
          wakeLockSentinelRef.current.release().catch(() => {});
          wakeLockSentinelRef.current = null;
        }
      }
    };

    updateScreenLock();

    const handleVisibilityChange = () => {
      updateScreenLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setKeepScreenOn(false);
      if (wakeLockSentinelRef.current && typeof wakeLockSentinelRef.current.release === 'function') {
        wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
    };
  }, [isPlaying]);

  // Sincronización precisa de Anime y Episodio desde URL (sin mezclar animes previos)
  const failedServersRef = useRef<Set<string>>(new Set());
  const tryFallbackServerRef = useRef<() => void>(() => {});
  const currentLoadedKey = useRef('');

  const handleSelectServer = useCallback(async (server: VideoServer, currentSource?: string, recoverOnFailure = false) => {
    const isTargetVip = isVipServer(server.name);
    if (isTargetVip && FEATURE_FLAGS.SHOW_SUBSCRIPTION && !isVip) {
      showToast({
        icon: 'vip',
        text: `El servidor ${server.name} es exclusivo para miembros VIP`,
      });
      openVipModal();
      return;
    }
    const sourceToUse = currentSource || querySource;
    const request = ++serverRequestRef.current;
    setIsResolving(true);
    try {
      const media = await resolveStream(server, sourceToUse);
      if (request !== serverRequestRef.current) return;
      const video = videoRef.current;
      pendingSwitchRef.current = { time: video?.currentTime ?? playbackTimeRef.current, playing: video ? !video.paused : false };
      hasResumedProgressRef.current = true;
      readyToSaveRef.current = false;
      setSelectedServer(server);
      setResolvedMedia(media);
      failedServersRef.current.delete(server.url);
    } catch (err) {
      if (request !== serverRequestRef.current) return;
      console.warn(`[AniCS Player] Servidor ${server.name} falló:`, err);
      failedServersRef.current.add(server.url);
      showToast({
        icon: 'server',
        text: `No se pudo cargar ${server.name}`,
      });
      // Keep the previous working stream if resolving the requested server fails.
      if (recoverOnFailure) tryFallbackServerRef.current();
    } finally {
      if (request === serverRequestRef.current) setIsResolving(false);
    }
  }, [querySource, isVip, openVipModal, setSelectedServer, setResolvedMedia, setIsResolving]);

  const tryFallbackServer = useCallback((manualRetry = false) => {
    if (!servers.length || !selectedServer) return;
    const isUserVip = !FEATURE_FLAGS.SHOW_SUBSCRIPTION || isVip;
    const playable = servers.filter(server => !server.unavailableReason);
    const allowed = isUserVip ? playable : playable.filter(s => !isVipServer(s.name));
    if (!allowed.length) return;

    failedServersRef.current.add(selectedServer.url);

    // Buscar el siguiente servidor no probado
    const nextServer = allowed.find(s => !failedServersRef.current.has(s.url));

    // Si ya se probaron todos, permitir reintento manual cíclico si el usuario lo solicita
    if (!nextServer) {
      const currentIndex = allowed.findIndex(s => s.url === selectedServer.url);
      const nextCandidate = allowed[(currentIndex + 1) % allowed.length];
      if (manualRetry && nextCandidate && nextCandidate.url !== selectedServer.url) {
        showToast({
          icon: 'server',
          text: `Reintentando con ${nextCandidate.name}...`,
        });
        handleSelectServer(nextCandidate);
        return;
      }
      showToast({
        icon: 'server',
        text: 'Ningún servidor disponible para este episodio',
      });
      return;
    }

    showToast({
      icon: 'server',
      text: `Cambiando a ${nextServer.name}...`,
    });
    handleSelectServer(nextServer, undefined, true);
  }, [servers, selectedServer, isVip, handleSelectServer]);

  useEffect(() => {
    tryFallbackServerRef.current = tryFallbackServer;
  }, [tryFallbackServer]);

  // Selección y resolución automática del primer servidor funcional disponible
  const autoResolveWorkingServer = useCallback(async (
    candidateServers: VideoServer[],
    source: string,
    expectedRequestId?: number
  ): Promise<boolean> => {
    if (!candidateServers || candidateServers.length === 0) {
      return false;
    }
    const isObsolete = () => typeof expectedRequestId === "number" && expectedRequestId !== serverRequestRef.current;
    if (isObsolete()) return false;

    const isUserVip = !FEATURE_FLAGS.SHOW_SUBSCRIPTION || isVip;
    const allowed = isUserVip
      ? [...candidateServers]
      : candidateServers.filter(s => !isVipServer(s.name));

    if (allowed.length === 0 || isObsolete()) {
      return false;
    }

    // Ordenar servidores por compatibilidad y estabilidad probada
    allowed.sort((a, b) => getServerPriority(b) - getServerPriority(a));

    for (const candidate of allowed) {
      if (isObsolete()) return false;
      if (failedServersRef.current.has(candidate.url)) {
        continue;
      }
      try {
        setIsResolving(true);
        setSelectedServer(candidate);
        const media = await resolveStream(candidate, source);
        if (isObsolete()) return false;
        if (media && media.directUrl) {
          setResolvedMedia(media);
          return true;
        }
      } catch (err) {
        if (isObsolete()) return false;
        console.warn(`[AniCS Player] Servidor ${candidate.name} (${candidate.url}) no resolvió stream:`, err);
        failedServersRef.current.add(candidate.url);
      }
    }

    return false;
  }, [isVip]);

  useEffect(() => {
    const initFromParams = async () => {
      if (!queryUrl) return;
      // URLSearchParams already decodes the outer query parameter. Decoding
      // again corrupts escaped media URLs and local filenames containing '%'.
      const decoded = queryUrl;
      const parsedEp = Number(queryEp ?? 1);
      const epNum = Number.isInteger(parsedEp) && parsedEp > 0 ? parsedEp : 1;
      const loadKey = JSON.stringify([decoded, epNum, querySource, queryAnimeUrl]);
      if (currentLoadedKey.current === loadKey) return;
      currentLoadedKey.current = loadKey;
      const requestId = ++serverRequestRef.current;
      pendingSwitchRef.current = null;
      readyToSaveRef.current = false;
      hasResumedProgressRef.current = false;
      pendingProgressPromiseRef.current = null;
      playbackTimeRef.current = 0;
      durationRef.current = 0;
      clearTimeout(progressReadyTimerRef.current);
      failedServersRef.current.clear();
      resetPlayback();
      setIsLoadingInitial(true);
      setLoadError(null);

      const targetAnimeUrl = (queryAnimeUrl && (queryAnimeUrl.startsWith('http://') || queryAnimeUrl.startsWith('https://')))
        ? queryAnimeUrl
        : decoded;

      try {
        let details = getCachedDetails(targetAnimeUrl);
        if (!details || details.url !== targetAnimeUrl) {
          details = await getDetails(targetAnimeUrl, querySource);
          if (requestId !== serverRequestRef.current) return;
          cacheDetails(details);
        }
        if (requestId !== serverRequestRef.current) return;

        setCurrentAnime(details);
        const targetEp = details.episodes.find(e => e.number === epNum) || details.episodes[0] || {
          number: epNum,
          title: `Episodio ${epNum}`,
          url: `${targetAnimeUrl.replace(/\/$/, '')}/${epNum}/`,
          watched: false,
        };
        setCurrentEpisode(targetEp);
        const activeProfileId = useProfileStore.getState().activeProfile?.id;
        pendingProgressPromiseRef.current = getEpisodeProgress(targetEp.url, activeProfileId);

        setIsResolving(true);
        if (querySource === 'local' || details.source === 'local' || (!targetEp.url.startsWith('http://') && !targetEp.url.startsWith('https://'))) {
          try {
            const streamUrl = await getLocalMediaUrl(targetEp.url);
            if (requestId !== serverRequestRef.current) return;
            const isTs = targetEp.url.toLowerCase().endsWith('.ts');
            setResolvedMedia({
              directUrl: streamUrl,
              mediaType: isTs ? 'hls' : 'mp4',
              qualities: [],
            });
          } catch (err) {
            if (requestId !== serverRequestRef.current) return;
            console.error('Failed to load local episode on init:', err);
            setLoadError('No se pudo abrir el video descargado');
          }
        } else {
          const srvs = await getServers(targetEp.url, querySource);
          if (requestId !== serverRequestRef.current) return;
          setServers(srvs);
          failedServersRef.current.clear();

          const ok = await autoResolveWorkingServer(srvs, querySource, requestId);
          if (requestId !== serverRequestRef.current) return;
          if (!ok) {
            setLoadError('No se encontró ningún servidor con transmisión disponible para este episodio');
          }
        }
        if (requestId === serverRequestRef.current) {
          setIsResolving(false);
        }
      } catch (err: any) {
        if (requestId !== serverRequestRef.current) return;
        console.error('Failed to init player from URL params:', err);
        setLoadError(err?.message || 'No se pudo cargar el anime');
      } finally {
        if (requestId === serverRequestRef.current) {
          setIsResolving(false);
          setIsLoadingInitial(false);
        }
      }
    };

    initFromParams();

    return () => {
      // Limpiar al desmontar la vista del reproductor
      currentLoadedKey.current = '';
      ++serverRequestRef.current;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [queryUrl, queryEp, querySource, queryAnimeUrl]);

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
    ++mediaSessionRef.current;
    clearTimeout(progressReadyTimerRef.current);
    if (!video || !resolvedMedia || !resolvedMedia.directUrl) {
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      return;
    }

    // Cleanup previous hls instance and video state
    const switchState = pendingSwitchRef.current;
    pendingSwitchRef.current = null;
    let disposed = false;
    let restored = !switchState;
    let playStarted = false;
    const sourceTimers: ReturnType<typeof setTimeout>[] = [];
    const restorePosition = () => {
      if (disposed || restored || video.readyState < 1 || !switchState) return;
      video.currentTime = Number.isFinite(video.duration)
        ? Math.min(switchState.time, video.duration) : switchState.time;
      playbackTimeRef.current = video.currentTime;
      setPlaybackTime(video.currentTime);
      restored = true;
      readyToSaveRef.current = true;
    };
    const playWhenReady = () => {
      if (disposed || playStarted) return;
      restorePosition();
      if (!restored || (switchState && !switchState.playing)) return;
      playStarted = true;
      video.play().catch(err => {
        playStarted = false;
        console.warn('[AniCS Stream] No se pudo iniciar reproducción:', err);
      });
    };
    video.addEventListener('loadedmetadata', restorePosition);
    video.addEventListener('canplay', playWhenReady, { once: true });
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();

    let sourceUrl = rewriteDeadCdnUrl(resolvedMedia.directUrl);
    let isHls = resolvedMedia.mediaType === 'hls' || sourceUrl.includes('.m3u8');
    let blobUrlToRevoke: string | null = null;

    let mediaPath = sourceUrl;
    try {
      const url = new URL(sourceUrl);
      mediaPath = url.pathname === '/video'
        ? url.searchParams.get('path') ?? url.pathname
        : url.pathname;
    } catch { /* Keep the original URL if it cannot be parsed. */ }
    if (/\.ts$/i.test(mediaPath)) {
      isHls = true;
      const m3u8Content = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:7200\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:7200.0,\n${sourceUrl}\n#EXT-X-ENDLIST`;
      sourceUrl = URL.createObjectURL(new Blob([m3u8Content], { type: 'application/vnd.apple.mpegurl' }));
      blobUrlToRevoke = sourceUrl;
    }

    if (isHls && Hls.isSupported()) {
      const RobustLoader = createRobustHlsLoader(Hls);
      const hls = new Hls({
        enableWorker: true,
        loader: RobustLoader as any,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 60 * 1000 * 1000,
        capLevelToPlayerSize: true,
        fragLoadingTimeOut: 10000,
        manifestLoadingTimeOut: 10000,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        fragLoadingMaxRetryTimeout: 4000,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      let playTriggered = false;
      const attemptAutoPlay = () => {
        restorePosition();
        if (!disposed && restored && !playTriggered) {
          playTriggered = true;
          playWhenReady();
        }
      };

      // 1. Reanudar progreso inmediatamente al cargar los niveles de HLS, antes de descargar fragmentos
      hls.once(Hls.Events.LEVEL_LOADED, async (_, data) => {
        if (disposed) return;
        const totalDuration = data.details?.totalduration;
        if (totalDuration && totalDuration > 0) {
          setDuration(totalDuration);
          durationRef.current = totalDuration;

          // Si cambiamos de servidor dentro del mismo episodio y ya estábamos en reproducción avanzada
          if (playbackTimeRef.current > 2 && !hasResumedProgressRef.current) {
            hasResumedProgressRef.current = true;
            video.currentTime = playbackTimeRef.current;
            sourceTimers.push(setTimeout(() => { readyToSaveRef.current = true; }, 1500));
            return;
          }

          if (!hasResumedProgressRef.current && currentEpisodeRef.current) {
            try {
              const activeProfileId = useProfileStore.getState().activeProfile?.id;
              const savedProg = pendingProgressPromiseRef.current
                ? await pendingProgressPromiseRef.current
                : await getEpisodeProgress(currentEpisodeRef.current.url, activeProfileId);
              if (disposed) return;

              if (savedProg && savedProg > 0.01 && savedProg < 0.95 && totalDuration > 0) {
                const targetTime = savedProg * totalDuration;
                hasResumedProgressRef.current = true;
                video.currentTime = targetTime;
                showToast({ icon: 'seek', text: `Reanudado al ${Math.round(savedProg * 100)}%` });
                sourceTimers.push(setTimeout(() => { readyToSaveRef.current = true; }, 1500));
                return;
              }
            } catch (e) {
              console.warn('Error reanudando progreso en LEVEL_LOADED:', e);
            }
          }
        }
        readyToSaveRef.current = true;
      });

      // 2. Iniciar reproducción tan pronto como el primer fragmento esté listo en el buffer MSE
      hls.once(Hls.Events.FRAG_BUFFERED, () => {
        attemptAutoPlay();
      });

      // 3. Fallback de seguridad si el buffer o evento se demora
      hls.once(Hls.Events.MANIFEST_PARSED, () => {
        if (video.readyState >= 2) {
          attemptAutoPlay();
        } else {
          sourceTimers.push(setTimeout(attemptAutoPlay, 1200));
        }
      });

      hls.loadSource(sourceUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[AniCS Stream] Error de red fatal en HLS, cambiando a servidor alternativo...', data);
              tryFallbackServerRef.current();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[AniCS Stream] Error de decodificación en HLS, intentando recuperar...', data);
              hls.recoverMediaError();
              break;
            default:
              console.warn('[AniCS Stream] Error irrecuperable en HLS, cambiando a servidor alternativo...', data);
              tryFallbackServerRef.current();
              break;
          }
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = sourceUrl;
      if (video.readyState >= 2) {
        playWhenReady();
      }
    } else {
      video.src = sourceUrl;
      if (video.readyState >= 2) {
        playWhenReady();
      }
    }

    return () => {
      disposed = true;
      sourceTimers.forEach(clearTimeout);
      video.removeEventListener('loadedmetadata', restorePosition);
      video.removeEventListener('canplay', playWhenReady);
      if (blobUrlToRevoke) {
        URL.revokeObjectURL(blobUrlToRevoke);
      }
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [resolvedMedia]);

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
    const activeProfileId = useProfileStore.getState().activeProfile?.id || 'default';
    const historyId = `${cleanAnimeUrl}-${epNum}-${activeProfileId}`;

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
      profileId: activeProfileId,
    })
      .then(() => {
        useSyncStore.getState().triggerDebouncedSync();
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => saveProgress(), 10000);
    return () => {
      clearInterval(interval);
      saveProgress();
    };
  }, [saveProgress]);

  const showControlsTemp = useCallback((customDelay?: number) => {
    setShowControls(true);
    if (!interactionRef.current.showControls && videoRef.current) setPlaybackTime(videoRef.current.currentTime);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
      controlsTimeout.current = undefined;
    }

    // No auto-ocultar los controles si el video está pausado
    const isPaused = videoRef.current ? videoRef.current.paused : false;
    if (isPaused) {
      return;
    }

    const timeoutMs = customDelay ?? (isMobile ? 4500 : 4000);
    controlsTimeout.current = setTimeout(() => {
      if (
        interactionRef.current.activeDrawer === 'none' &&
        !interactionRef.current.showServerDropdown &&
        videoRef.current &&
        !videoRef.current.paused
      ) {
        setShowControls(false);
        setShowServerDropdown(false);
      }
    }, timeoutMs);
  }, [isMobile, setPlaybackTime]);

  useEffect(() => {
    showControlsTemp();
  }, [activeDrawer, showServerDropdown, showControlsTemp]);

  useEffect(() => () => {
    clearTimeout(controlsTimeout.current);
    clearTimeout(toastTimeout.current);
    clearTimeout(doubleTapTimeoutRef.current);
    clearTimeout(progressReadyTimerRef.current);
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    pendingSwitchRef.current = null;
    ++serverRequestRef.current;
    usePlayerStore.getState().resetPlayback();
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
  }, []);

  const toggleControlsManual = () => {
    if (showControls) {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = undefined;
      }
      setShowControls(false);
      setShowServerDropdown(false);
    } else {
      showControlsTemp();
    }
  };

  const togglePlay = useCallback((showHud: boolean | React.SyntheticEvent = true) => {
    const v = videoRef.current;
    if (!v) return;
    if (!v.paused) {
      v.pause();
    } else {
      v.play().catch(() => {});
    }
    if (typeof showHud === 'boolean' ? showHud : true) {
      showControlsTemp();
    }
  }, [showControlsTemp]);

  const handleCastPositionChange = useCallback((position: number) => {
    playbackTimeRef.current = position;
    setPlaybackTime(position);
  }, [setPlaybackTime]);

  const handleCastingStarted = useCallback(() => {
    videoRef.current?.pause();
    saveProgress();
  }, [saveProgress]);

  const handleEnded = () => {
    setIsPlaying(false);
    saveProgress(1.0);
    if (autoNext && currentAnime && currentEpisode) {
      const nextEp = currentAnime.episodes.find(e => e.number === currentEpisode.number + 1);
      if (nextEp) {
        handleLoadEpisode(nextEp.number);
      }
    }
  };

  const handleLoadEpisode = (epNum: number) => {
    if (!currentAnime) return;
    if (currentEpisode?.number === epNum) return;
    const ep = currentAnime.episodes.find(e => e.number === epNum);
    if (!ep) return;

    saveProgress();
    ++serverRequestRef.current;
    pendingSwitchRef.current = null;
    readyToSaveRef.current = false;
    resetPlayback();
    // All episode changes use the same request guards as initial playback.
    // Replacing the player URL also keeps Back pointing to the originating page.
    const params = new URLSearchParams(searchParams);
    params.set('url', currentAnime.url);
    params.set('animeUrl', currentAnime.url);
    params.set('ep', String(ep.number));
    navigate(`/player?${params.toString()}`, { replace: true });
  };

  const seekRelative = (seconds: number, showHud: boolean | React.SyntheticEvent = true) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds));
    showToast({
      icon: 'seek',
      text: seconds > 0 ? `+${seconds}s` : `${seconds}s`,
    });
    if (typeof showHud === 'boolean' ? showHud : true) {
      showControlsTemp();
    }
  };

  // 1 solo clic en pantalla alterna HUD (no pausa, respetando el diámetro del botón central); doble clic busca o pausa según zona.
  const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressTouchClickRef.current) {
      suppressTouchClickRef.current = false;
      return;
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
      return;
    }

    const bounds = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - bounds.left;
    const screenWidth = bounds.width;
    const now = Date.now();
    const doubleTapDiff = now - lastTapTime.current;

    if (doubleTapDiff < 300) {
      // Doble clic confirmado: cancelar acción de 1 clic (no alterar HUD)
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }

      if (x < screenWidth * 0.35) {
        // Doble clic izquierda: -10s sin HUD
        seekRelative(-10, false);
        setDoubleTapSide('left');
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = setTimeout(() => setDoubleTapSide(null), 600);
      } else if (x > screenWidth * 0.65) {
        // Doble clic derecha: +10s sin HUD
        seekRelative(10, false);
        setDoubleTapSide('right');
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = setTimeout(() => setDoubleTapSide(null), 600);
      } else {
        // Doble clic en el centro
        if (isMobile) {
          const willPause = videoRef.current ? !videoRef.current.paused : isPlaying;
          togglePlay(false);
          setDoubleTapAction(willPause ? 'pause' : 'play');
          setDoubleTapSide('center');
          clearTimeout(doubleTapTimeoutRef.current);
          doubleTapTimeoutRef.current = setTimeout(() => {
            setDoubleTapSide(null);
            setDoubleTapAction(null);
          }, 600);
        } else {
          toggleFullscreen();
        }
      }
      lastTapTime.current = 0;
    } else {
      // Primer clic: esperar 300ms para confirmar si es un solo clic
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
    suppressTouchClickRef.current = false;
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
        suppressTouchClickRef.current = true;
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
      if ((e.target as HTMLElement).closest('input, select, textarea, button, [contenteditable="true"]')) return;

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

  if (!currentAnime || !currentEpisode) {
    if (isLoadingInitial) {
      return (
        <div
          ref={containerRef}
          style={{
            width: '100vw', height: '100vh', background: '#000000',
            position: 'relative', overflow: 'hidden', userSelect: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
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
              }}
            />
          </div>
          <div style={{
            position: 'absolute', inset: 0, zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#000000', flexDirection: 'column', gap: 14,
          }}>
            <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
            <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>Cargando anime...</p>
          </div>
        </div>
      );
    }
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
      onMouseMove={() => showControlsTemp()}
      onPointerDownCapture={event => {
        if ((event.target as HTMLElement).closest('[data-interactive], button, input, select')) showControlsTemp();
      }}
      onClick={handleScreenClick}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Capa de Carga Inicial (Overlay sin desmontar el elemento video) ── */}
      {isLoadingInitial && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#000000', flexDirection: 'column', gap: 14,
        }}>
          <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 600 }}>Cargando anime...</p>
        </div>
      )}
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
            setKeepScreenOn(true);
            showControlsTemp();
            if (readyToSaveRef.current) {
              saveProgress();
            }
          }}
          onPause={() => {
            setIsPlaying(false);
            setKeepScreenOn(false);
            if (controlsTimeout.current) {
              clearTimeout(controlsTimeout.current);
              controlsTimeout.current = undefined;
            }
            setShowControls(true);
            saveProgress();
          }}
          onLoadedMetadata={async () => {
            const session = mediaSessionRef.current;
            const v = videoRef.current;
            if (v) {
              if (v.duration && v.duration > 0) {
                setDuration(v.duration);
                durationRef.current = v.duration;
              }

              // Si ya se mantuvo posición por cambio de servidor
              if (playbackTimeRef.current > 2 && !hasResumedProgressRef.current) {
                hasResumedProgressRef.current = true;
                v.currentTime = playbackTimeRef.current;
                markProgressReady();
                return;
              }

              // Si no se reanudó vía HLS LEVEL_LOADED (ej. MP4 directo o local)
              if (!hasResumedProgressRef.current && currentEpisodeRef.current) {
                try {
                  const activeProfileId = useProfileStore.getState().activeProfile?.id;
                  const savedProg = pendingProgressPromiseRef.current
                    ? await pendingProgressPromiseRef.current
                    : await getEpisodeProgress(currentEpisodeRef.current.url, activeProfileId);
                  if (session !== mediaSessionRef.current) return;

                  if (savedProg && savedProg > 0.01 && savedProg < 0.95 && v.duration > 0) {
                    const targetTime = savedProg * v.duration;
                    v.currentTime = targetTime;
                    setPlaybackTime(targetTime);
                    showToast({ icon: 'seek', text: `Reanudado al ${Math.round(savedProg * 100)}%` });
                    hasResumedProgressRef.current = true;
                    markProgressReady();
                    return;
                  }
                  readyToSaveRef.current = true;
                } catch (e) {
                  if (session !== mediaSessionRef.current) return;
                  console.error('Error resuming progress in onLoadedMetadata:', e);
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
              playbackTimeRef.current = v.currentTime;
              const now = performance.now();
              if (interactionRef.current.showControls && now - lastTimeUiUpdateRef.current >= 250) {
                lastTimeUiUpdateRef.current = now;
                setPlaybackTime(v.currentTime);
              }
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

      {/* Double Tap Seek Feedback */}
      <AnimatePresence>
        {doubleTapSide && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              position: 'absolute',
              left: doubleTapSide === 'left' ? '15%' : doubleTapSide === 'center' ? '50%' : undefined,
              right: doubleTapSide === 'right' ? '15%' : undefined,
              top: '50%',
              transform: doubleTapSide === 'center' ? 'translate(-50%, -50%)' : 'translateY(-50%)',
              background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)',
              borderRadius: 'var(--radius-xl)', padding: '16px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              color: 'white', zIndex: 30, pointerEvents: 'none',
            }}
          >
            {doubleTapSide === 'left' && <RotateCcw size={32} />}
            {doubleTapSide === 'right' && <RotateCw size={32} />}
            {doubleTapSide === 'center' && (
              doubleTapAction === 'pause' ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" />
            )}
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {doubleTapSide === 'left' ? '-10s' : doubleTapSide === 'right' ? '+10s' : (doubleTapAction === 'pause' ? 'Pausa' : 'Reproducir')}
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
            {hudToast.icon === 'vip' && <Crown size={16} color="#fbbf24" />}
            {hudToast.icon === 'external' && <ExternalLink size={16} color="var(--accent-primary)" />}
            {hudToast.icon === 'server' && <RotateCw size={16} color="var(--accent-primary)" />}
            <span>{hudToast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Stream Overlay */}
      {isResolving && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, zIndex: 25, pointerEvents: 'none',
        }}>
          <div style={{
            width: isMobile ? 64 : 76, height: isMobile ? 64 : 76, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Loader2 size={32} className="animate-spin" color="var(--accent-primary)" />
          </div>
          <span style={{ color: 'white', fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>Cargando servidor...</span>
        </div>
      )}

      <button
        type="button"
        data-interactive
        aria-label={isPlaying ? 'Pausar video' : 'Reproducir video'}
        onClick={event => { event.stopPropagation(); togglePlay(); }}
        onTouchStart={event => event.stopPropagation()}
        onFocus={() => showControlsTemp()}
        style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: isMobile ? 72 : 88, height: isMobile ? 72 : 88, borderRadius: '50%',
          display: activeDrawer === 'none' && !isResolving && !isLoadingInitial ? 'flex' : 'none',
          alignItems: 'center', justifyContent: 'center',
          color: 'white', background: 'rgba(0,0,0,.45)', border: '1px solid rgba(255,255,255,.35)',
          zIndex: 21, cursor: 'pointer', opacity: showControls ? 1 : 0, transition: 'opacity .2s, transform .15s',
          touchAction: 'manipulation',
        }}
      >
        {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
      </button>

      {/* HUD leaves the video surface reachable; only control bars intercept input. */}
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
              paddingLeft: isMobile ? 'calc(10px + env(safe-area-inset-left, 0px))' : '12px',
              paddingRight: isMobile ? 'calc(10px + env(safe-area-inset-right, 0px))' : '16px',
              zIndex: 20, pointerEvents: 'none',
            }}
            onWheel={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
          >
            {/* ── Top Bar: Volver + Título a la Izquierda | Estado + Servidor + Botones a la Derecha ── */}
            <div
              data-interactive
              onClick={e => e.stopPropagation()}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: isPortrait ? 6 : 12,
                flexWrap: 'nowrap',
              }}
            >
              {/* Izquierda: Botón Volver + Título del Anime */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isPortrait ? 8 : 12, minWidth: 0, flex: 1 }}>
                <button
                  onClick={() => {
                    saveProgress();
                    navigate(-1);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', padding: isPortrait ? '6px 10px' : '6px 14px',
                    display: 'flex', alignItems: 'center', gap: 4,
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)', flexShrink: 0,
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  <ChevronLeft size={16} /> <span style={{ display: isPortrait && isMobile ? 'none' : 'inline' }}>Volver</span>
                </button>

                <h2
                  className="selectable-text"
                  style={{
                    fontSize: isPortrait ? 12 : (isMobile ? 13 : 15),
                    fontWeight: 700, color: 'white', margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    maxWidth: isPortrait ? '180px' : 'auto',
                    userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text',
                  }}
                >
                  {currentAnime.title} {isPortrait ? `E${currentEpisode.number}` : `— Episodio ${currentEpisode.number}`}
                </h2>
              </div>

              {/* Derecha: Estado + Servidor Dropdown + Botón Reload + Episodios + Ajustes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isPortrait ? 5 : 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                {/* Badge de Estado: solo en landscape / pantallas amplias */}
                {!isPortrait && (
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
                )}

                <ServerSelector
                  servers={servers}
                  selectedUrl={selectedServer?.url}
                  selectedName={selectedServer?.name}
                  isOpen={showServerDropdown}
                  isResolving={isResolving}
                  isPortrait={isPortrait}
                  onOpenChange={setShowServerDropdown}
                  onRefresh={refreshServers}
                  onSelect={handleSelectServer}
                  onAdd={addServer}
                />
                {isAndroid && <button
                  type="button"
                  data-interactive
                  aria-label="Transmitir a Smart TV"
                  title="Transmitir a Smart TV"
                  disabled={isResolving || !resolvedMedia?.directUrl}
                  onClick={() => setShowCastDialog(true)}
                  style={{
                    background: showCastDialog ? 'var(--accent-primary)' : 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 'var(--radius-full)', width: isPortrait ? 30 : 34, height: isPortrait ? 30 : 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: isResolving || !resolvedMedia?.directUrl ? 'not-allowed' : 'pointer',
                    opacity: isResolving || !resolvedMedia?.directUrl ? 0.45 : 1,
                    backdropFilter: 'blur(10px)', flexShrink: 0,
                  }}
                >
                  <Tv size={isPortrait ? 13 : 15} />
                </button>}
                {/* Botón Alternar / Cambiar Servidor Siguiente (Solo Desktop) */}
                {!isMobile && (
                  <button
                    onClick={() => tryFallbackServer(true)}
                    title="Cambiar al siguiente servidor"
                    style={{
                      background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-full)', width: isPortrait ? 30 : 34, height: isPortrait ? 30 : 34,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                    }}
                  >
                    <RotateCw size={isPortrait ? 13 : 15} />
                  </button>
                )}

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
                    borderRadius: 'var(--radius-full)', width: isPortrait ? 30 : 34, height: isPortrait ? 30 : 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <ListVideo size={isPortrait ? 13 : 15} />
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
                    borderRadius: 'var(--radius-full)', width: isPortrait ? 30 : 34, height: isPortrait ? 30 : 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                  }}
                >
                  <Settings size={isPortrait ? 13 : 15} />
                </button>

                {/* Botón Abrir en Reproductor Externo (MPV) */}
                {!isMobile && resolvedMedia?.directUrl && (
                  <button
                    onClick={async () => {
                      try {
                        const settings: Record<string, string> = await invoke('get_all_settings');
                        const extPath = settings.external_player_path || '';
                        await invoke('open_in_external_player', {
                          streamUrl: resolvedMedia.directUrl,
                          playerPath: extPath ? extPath : null,
                        });
                        showToast({ icon: 'external', text: 'Abriendo transmisión en MPV...' });
                      } catch (err: any) {
                        console.error('Error lanzando reproductor externo:', err);
                        showToast({ icon: 'external', text: 'No se pudo abrir reproductor externo' });
                      }
                    }}
                    title="Abrir transmisión en MPV (reproductor externo)"
                    style={{
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: 'var(--radius-full)', width: isPortrait ? 30 : 34, height: isPortrait ? 30 : 34,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', cursor: 'pointer', backdropFilter: 'blur(10px)',
                    }}
                  >
                    <ExternalLink size={isPortrait ? 13 : 15} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Bottom Bar: Barra de Progreso + Controles Multimedia Adaptativos ── */}
            <div
              data-interactive
              onClick={e => e.stopPropagation()}
              style={{ pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: isPortrait ? 6 : 10 }}
            >
              {/* Barra de Progreso Interactiva Estilo MPV con Scrubbing / Arrastre Continuo */}
              {(() => {
                const currentDisplayTime = isScrubbing && scrubTime !== null ? scrubTime : playbackTime;
                const currentPercent = duration > 0 ? (currentDisplayTime / duration) * 100 : 0;

                return (
                  <div
                    ref={progressBarRef}
                    data-interactive
                    style={{
                      width: '100%',
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      touchAction: 'none',
                      userSelect: 'none',
                    }}
                    onPointerDown={handleProgressBarPointerDown}
                    onPointerMove={handleProgressBarPointerMove}
                    onPointerUp={handleProgressBarPointerUp}
                    onPointerCancel={handleProgressBarPointerUp}
                    onPointerLeave={handleProgressBarPointerLeave}
                  >
                    {/* Tooltip flotante con marca de tiempo estilo MPV */}
                    {hoverPosition && duration > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          left: `${Math.max(4, Math.min(96, hoverPosition.percent))}%`,
                          bottom: 'calc(100% + 8px)',
                          transform: 'translateX(-50%)',
                          background: 'rgba(10, 12, 18, 0.95)',
                          backdropFilter: 'blur(16px)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '4px 8px',
                          color: 'white',
                          fontSize: 12,
                          fontWeight: 700,
                          pointerEvents: 'none',
                          whiteSpace: 'nowrap',
                          zIndex: 35,
                        }}
                      >
                        <span>{formatTime(hoverPosition.time)}</span>
                      </div>
                    )}

                    {/* Track Base */}
                    <div
                      style={{
                        width: '100%',
                        height: isScrubbing || hoverPosition ? 6 : 4,
                        background: 'rgba(255, 255, 255, 0.22)',
                        borderRadius: 3,
                        position: 'relative',
                        overflow: 'visible',
                        transition: 'height 0.15s ease',
                      }}
                    >
                      {/* Ghost / Hover Preview Track */}
                      {hoverPosition && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: `${hoverPosition.percent}%`,
                            height: '100%',
                            background: 'rgba(255, 255, 255, 0.35)',
                            borderRadius: 3,
                            pointerEvents: 'none',
                          }}
                        />
                      )}

                      {/* Progreso Reproducido / Scrubbed */}
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, currentPercent))}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                          borderRadius: 3,
                          position: 'relative',
                          boxShadow: isScrubbing ? '0 0 12px rgba(59, 130, 246, 0.8)' : 'none',
                        }}
                      >
                        {/* Indicador Thumb / Tirador redondo con resplandor */}
                        <div
                          style={{
                            position: 'absolute',
                            right: -6,
                            top: '50%',
                            transform: `translateY(-50%) scale(${isScrubbing || hoverPosition ? 1.35 : 1})`,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: 'white',
                            boxShadow: '0 0 8px rgba(0,0,0,0.8), 0 0 10px rgba(59,130,246,0.9)',
                            transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Fila(s) de Controles Inferiores - Adaptativo Vertical / Horizontal */}
              {isPortrait ? (
                /* Estructura Móvil Vertical (2 filas limpias y balanceadas) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Fila 1 en Vertical: Timestamp + Controles de Reproducción Centrales */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                      {formatTime(isScrubbing && scrubTime !== null ? scrubTime : playbackTime)} / {formatTime(duration)}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Episodio Anterior */}
                      <button
                        disabled={!currentAnime || currentEpisode.number <= 1}
                        onClick={() => handleLoadEpisode(currentEpisode.number - 1)}
                        style={{
                          background: 'none', border: 'none',
                          color: currentEpisode.number > 1 ? 'white' : 'rgba(255,255,255,0.3)',
                          cursor: currentEpisode.number > 1 ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', padding: 2,
                        }}
                      >
                        <SkipBack size={18} />
                      </button>

                      {/* Retroceder 10s */}
                      <button
                        onClick={() => seekRelative(-10)}
                        style={{
                          background: 'none', border: 'none', color: 'white',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
                          fontSize: 11, fontWeight: 700, padding: 2,
                        }}
                      >
                        <RotateCcw size={15} /> 10
                      </button>

                      {/* Play / Pause Botón Circular */}
                      <button
                        aria-label={isPlaying ? 'Pausar desde controles' : 'Reproducir desde controles'}
                        onClick={togglePlay}
                        style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: 'rgba(255,255,255,0.22)', border: '1px solid rgba(255,255,255,0.35)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', cursor: 'pointer', backdropFilter: 'blur(8px)',
                          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                        }}
                      >
                        {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: 2 }} />}
                      </button>

                      {/* Avanzar 10s */}
                      <button
                        onClick={() => seekRelative(10)}
                        style={{
                          background: 'none', border: 'none', color: 'white',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
                          fontSize: 11, fontWeight: 700, padding: 2,
                        }}
                      >
                        10 <RotateCw size={15} />
                      </button>

                      {/* Episodio Siguiente */}
                      <button
                        disabled={!currentAnime || currentEpisode.number >= currentAnime.episodes.length}
                        onClick={() => handleLoadEpisode(currentEpisode.number + 1)}
                        style={{
                          background: 'none', border: 'none',
                          color: currentEpisode.number < currentAnime.episodes.length ? 'white' : 'rgba(255,255,255,0.3)',
                          cursor: currentEpisode.number < currentAnime.episodes.length ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', padding: 2,
                        }}
                      >
                        <SkipForward size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2 en Vertical: Opciones Secundarias (Saltar Intro, Velocidad, Aspecto, Rotación, Fullscreen) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingTop: 2 }}>
                    {/* Saltar Intro */}
                    {duration > 120 ? (
                      <button
                        onClick={() => seekRelative(85)}
                        style={{
                          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 'var(--radius-full)', padding: '4px 10px',
                          color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        +85s Intro
                      </button>
                    ) : <div />}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Velocidad */}
                      <button
                        onClick={() => {
                          const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed);
                          const nextSpeed = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length];
                          setPlaybackSpeed(nextSpeed);
                          showToast({ icon: 'seek', text: `Velocidad: ${nextSpeed}x` });
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 'var(--radius-md)', padding: '4px 8px',
                          color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >
                        {playbackSpeed.toFixed(1)}X
                      </button>

                      {/* Aspecto */}
                      <button
                        onClick={cycleAspectRatio}
                        title="Relación de aspecto"
                        style={{
                          background: aspectRatio !== 'contain' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 'var(--radius-md)', padding: '4px 7px',
                          color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 3,
                        }}
                      >
                        <Scaling size={13} />
                        <span>{aspectRatio === 'contain' ? '16:9' : aspectRatio === 'cover' ? 'Zoom' : 'Estirar'}</span>
                      </button>

                      {/* Rotar Orientación (Solo Móvil / Android) */}
                      {isMobile && (
                        <button
                          onClick={toggleScreenOrientation}
                          title="Rotar pantalla"
                          style={{
                            background: screenOrientation !== 'auto' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 'var(--radius-md)', padding: '4px 7px',
                            color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <Smartphone size={13} />
                        </button>
                      )}

                      {/* Fullscreen (Solo PC / Escritorio) */}
                      {!isMobile && (
                        <button
                          onClick={toggleFullscreen}
                          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                          style={{
                            background: isFullscreen ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: 'var(--radius-md)', padding: '4px 7px',
                            color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Estructura Horizontal (1 fila elegante tradicional) */
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {/* Grupo Izquierda: ⏮ | ↺ 10 | ▶/⏸ | 10 ↻ | ⏭ | 0:04 / 24:16 */}
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
                      aria-label={isPlaying ? 'Pausar desde controles' : 'Reproducir desde controles'}
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
                      {formatTime(isScrubbing && scrubTime !== null ? scrubTime : playbackTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  {/* Grupo Derecha: Saltar Intro + Velocidad + Aspecto + Rotar (Móvil) / Fullscreen (PC) */}
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

                    {/* Selector de Velocidad */}
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

                    {/* Botón de Rotación (Solo Móvil / Android) */}
                    {isMobile && (
                      <button
                        onClick={toggleScreenOrientation}
                        title="Rotar orientación de pantalla"
                        style={{
                          background: screenOrientation !== 'auto' ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 'var(--radius-md)', padding: '5px 8px',
                          color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Smartphone size={14} />
                      </button>
                    )}

                    {/* Botón de Pantalla Completa (Solo PC / Escritorio) */}
                    {!isMobile && (
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
                    )}
                  </div>
                </div>
              )}
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

            {/* Auto siguiente episodio */}
            <div>
              <button
                onClick={() => {
                  setAutoNext(!autoNext);
                  showToast({ icon: 'seek', text: `Auto-siguiente: ${!autoNext ? 'Activado' : 'Desactivado'}` });
                }}
                style={{
                  width: '100%', padding: isMobile ? '7px 10px' : '9px 12px', borderRadius: 'var(--radius-md)',
                  background: autoNext ? 'rgba(124, 58, 237, 0.2)' : 'var(--bg-elevated)',
                  border: `1px solid ${autoNext ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  color: autoNext ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}
              >
                <span>Siguiente episodio automático</span>
                <span>{autoNext ? 'ON' : 'OFF'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isAndroid && showCastDialog && resolvedMedia?.directUrl && currentEpisode && (
        <CastDialog
          isMobile={isMobile}
          title={`${currentAnime.title} — Episodio ${currentEpisode.number}`}
          streamUrl={resolvedMedia.directUrl}
          localFilePath={currentAnime.source === 'local' || !/^https?:\/\//i.test(currentEpisode.url) ? currentEpisode.url : undefined}
          mediaType={resolvedMedia.mediaType}
          currentTime={videoRef.current?.currentTime ?? playbackTime}
          isPlaying={isPlaying}
          onClose={() => setShowCastDialog(false)}
          onCast={handleCastingStarted}
          onPositionChange={handleCastPositionChange}
        />
      )}
    </div>
  );
}
