import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAllSettings, setSetting } from '@/services/storageService';
import type { VideoServer } from '@/types';
import { getDirectMediaType } from '@/utils/mediaUrls';

export interface PlaybackServer extends VideoServer {
  episodeUrl?: string;
  source?: string;
  unavailableReason?: string;
}

export function isDirectMediaUrl(url: string): boolean {
  return getDirectMediaType(url) !== null;
}

function readEntries(value?: string): PlaybackServer[] {
  try {
    const parsed: unknown = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry): entry is PlaybackServer =>
      entry && typeof entry.name === 'string' && typeof entry.url === 'string' &&
      /^https?:\/\//i.test(entry.url)) : [];
  } catch {
    return [];
  }
}

export function mergePlaybackServers(builtIn: VideoServer[], saved: PlaybackServer[], episodeUrl: string, source: string): PlaybackServer[] {
  const unique = new Map<string, PlaybackServer>();
  for (const server of [...builtIn, ...saved.filter(entry =>
    (!entry.episodeUrl || entry.episodeUrl === episodeUrl) && (!entry.source || entry.source === source))]) {
    if (!unique.has(server.url)) unique.set(server.url, server);
  }
  return [...unique.values()];
}

/** Refresh on menu opening/focus, rather than polling during playback. */
export function usePlaybackServers(builtIn: VideoServer[], episodeUrl: string, source: string) {
  const [saved, setSaved] = useState<PlaybackServer[]>([]);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const settings = await getAllSettings();
    if (request !== generation.current) return;
    const catalogs = readEntries(settings.custom_sources).map(entry => ({
      ...entry,
      isDirect: isDirectMediaUrl(entry.url),
      unavailableReason: isDirectMediaUrl(entry.url) ? undefined : 'Catálogo: requiere un extractor compatible',
    }));
    setSaved([...readEntries(settings.custom_video_servers), ...catalogs]);
  }, []);

  useEffect(() => {
    const onFocus = () => { void refresh().catch(console.error); };
    onFocus();
    window.addEventListener('focus', onFocus);
    window.addEventListener('anics:sources-changed', onFocus);
    return () => {
      ++generation.current;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('anics:sources-changed', onFocus);
    };
  }, [refresh]);

  const addServer = useCallback(async (name: string, rawUrl: string) => {
    const url = new URL(rawUrl.trim());
    if (!['https:', 'http:'].includes(url.protocol) || !name.trim()) {
      throw new Error('Introduce un nombre y una URL HTTP o HTTPS válida.');
    }
    const settings = await getAllSettings();
    const entries = readEntries(settings.custom_video_servers);
    const server: PlaybackServer = { name: name.trim(), url: url.href, isDirect: isDirectMediaUrl(url.href), episodeUrl, source };
    const updated = entries.filter(entry => !(entry.url === server.url && entry.episodeUrl === episodeUrl && entry.source === source));
    await setSetting('custom_video_servers', JSON.stringify([...updated, server]));
    await refresh();
  }, [episodeUrl, source, refresh]);

  const servers = useMemo(() => mergePlaybackServers(builtIn, saved, episodeUrl, source), [builtIn, saved, episodeUrl, source]);
  return { servers, refresh, addServer };
}
