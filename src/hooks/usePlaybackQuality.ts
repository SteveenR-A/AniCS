import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import Hls from 'hls.js';
import type { ResolvedMedia } from '@/types';

export interface PlaybackQualityOption {
  index: number;
  height: number;
  label: string;
}

export function usePlaybackQuality(
  videoRef: RefObject<HTMLVideoElement | null>,
  hlsRef: RefObject<Hls | null>,
  media: ResolvedMedia | null,
  episodeUrl?: string,
) {
  const [height, setHeight] = useState<number | null>(null);
  const [options, setOptions] = useState<PlaybackQualityOption[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const preference = useRef<{ episode?: string; height: number | null }>({ height: null });

  useEffect(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    let disposed = false;
    if (preference.current.episode !== episodeUrl) {
      preference.current = { episode: episodeUrl, height: null };
    }
    setHeight(null);
    setOptions([]);
    setSelectedLevel(-1);
    if (!video || !media) return;

    const measure = () => {
      if (!disposed && video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0) {
        setHeight(Math.min(video.videoWidth, video.videoHeight));
      }
    };
    const readManifest = () => {
      if (disposed || !hls) return;
      const levels = (hls.levels ?? []).map((level, index) => ({
        index,
        height: level.height,
        label: level.height > 0 ? `${level.height}p` : `${(level.bitrate / 1_000_000).toFixed(1)} Mbps`,
      }));
      setOptions(levels);
      const preferred = preference.current.height;
      const match = preferred === null ? undefined : levels.find(level => level.height === preferred);
      hls.nextLevel = match?.index ?? -1;
      setSelectedLevel(match?.index ?? -1);
    };
    const switched = (_event: unknown, data: { level: number }) => {
      const level = hls?.levels[data.level];
      if (!disposed && level?.height && level.height > 0) setHeight(level.height);
    };
    const ended = () => {
      preference.current = { episode: episodeUrl, height: null };
      if (hls) hls.nextLevel = -1;
      setSelectedLevel(-1);
    };
    video.addEventListener('loadedmetadata', measure);
    video.addEventListener('resize', measure);
    video.addEventListener('ended', ended);
    hls?.on(Hls.Events.MANIFEST_PARSED, readManifest);
    hls?.on(Hls.Events.LEVEL_SWITCHED, switched);
    return () => {
      disposed = true;
      video.removeEventListener('loadedmetadata', measure);
      video.removeEventListener('resize', measure);
      video.removeEventListener('ended', ended);
      hls?.off(Hls.Events.MANIFEST_PARSED, readManifest);
      hls?.off(Hls.Events.LEVEL_SWITCHED, switched);
    };
  }, [videoRef, hlsRef, media, episodeUrl]);

  const selectLevel = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls || !Number.isInteger(index) || index < -1 || index >= hls.levels.length) return;
    preference.current = { episode: episodeUrl, height: index < 0 ? null : hls.levels[index].height };
    hls.nextLevel = index;
    setSelectedLevel(index);
  }, [hlsRef, episodeUrl]);

  return { qualityLabel: height ? `${height}p` : null, options, selectedLevel, selectLevel };
}
