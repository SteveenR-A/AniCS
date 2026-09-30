import type { ResolvedMedia } from '@/types';

export function getDirectMediaType(rawUrl: string): ResolvedMedia['mediaType'] | null {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (/\.(m3u8|ts)$/i.test(url.pathname)) return 'hls';
    if (/\.mp4$/i.test(url.pathname)) return 'mp4';
    if (/\.webm$/i.test(url.pathname)) return 'unknown';
  } catch { /* Invalid URLs cannot be treated as direct media. */ }
  return null;
}
