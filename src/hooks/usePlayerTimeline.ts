import { useCallback, useRef, useState, type PointerEvent, type RefObject } from 'react';

/** Pointer seeking shared by the adaptive player; playback lifecycle stays in the page. */
export function usePlayerTimeline({ duration, videoRef, setPlaybackTime, onSeekEnd }: {
  duration: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  setPlaybackTime: (time: number) => void;
  onSeekEnd: () => void;
}) {
  // Timeline scrubbing (desplazamiento continuo estilo mpv con puntero táctil/ratón)
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; time: number; percent: number } | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const calculateSeekTime = useCallback((clientX: number) => {
    if (!progressBarRef.current || !Number.isFinite(duration) || duration <= 0) return { time: 0, percent: 0, x: 0 };
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = rect.width > 0 ? (x / rect.width) * 100 : 0;
    const time = Math.max(0, Math.min(duration, (percent / 100) * duration));
    return { time, percent, x };
  }, [duration]);

  const handleProgressBarPointerDown = (e: PointerEvent<HTMLDivElement>) => {
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

  const handleProgressBarPointerMove = (e: PointerEvent<HTMLDivElement>) => {
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

  const handleProgressBarPointerUp = (e: PointerEvent<HTMLDivElement>) => {
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
      onSeekEnd();
    }
  };

  const handleProgressBarPointerLeave = () => {
    if (!isScrubbing) {
      setHoverPosition(null);
    }
  };

  return {
    isScrubbing, scrubTime, hoverPosition, progressBarRef,
    handleProgressBarPointerDown, handleProgressBarPointerMove,
    handleProgressBarPointerUp, handleProgressBarPointerLeave,
  };
}
