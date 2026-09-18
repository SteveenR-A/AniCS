import { describe, it, expect } from 'vitest';
import { isVipServer, maskAndFilterServers } from '../serverUtils';
import type { VideoServer } from '@/types';

describe('serverUtils', () => {
  describe('isVipServer', () => {
    it('detects magi and desu servers as VIP', () => {
      expect(isVipServer('Servidor Magi')).toBe(true);
      expect(isVipServer('Desu 1080p')).toBe(true);
      expect(isVipServer('Servidor Dedicado VIP')).toBe(true);
      expect(isVipServer('VIP Server 1')).toBe(true);
    });

    it('returns false for non-VIP servers', () => {
      expect(isVipServer('Servidor CDN 1')).toBe(false);
      expect(isVipServer('Streamwish')).toBe(false);
      expect(isVipServer('VOE')).toBe(false);
      expect(isVipServer('Mediafire')).toBe(false);
    });
  });

  describe('maskAndFilterServers', () => {
    it('returns empty array if null or undefined or empty', () => {
      expect(maskAndFilterServers([])).toEqual([]);
      expect(maskAndFilterServers(null as any)).toEqual([]);
      expect(maskAndFilterServers(undefined as any)).toEqual([]);
    });

    it('filters out unsupported hosts like Mega, 1fichier, rapidgator', () => {
      const input: VideoServer[] = [
        { name: 'Mega', url: 'https://mega.nz/file/123', isDirect: false },
        { name: '1fichier', url: 'https://1fichier.com/?abc', isDirect: false },
        { name: 'Rapidgator', url: 'https://rapidgator.net/file/xyz', isDirect: false },
        { name: 'ZippyShare', url: 'https://zippyshare.com/v/123', isDirect: false },
        { name: 'Torrent', url: 'magnet:?xt=urn:btih:123', isDirect: false },
        { name: 'Fembed', url: 'https://fembed.com/v/123', isDirect: false },
        { name: 'Valid Server', url: 'https://stream.example.com/video.mp4', isDirect: false },
      ];

      const result = maskAndFilterServers(input);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Servidor CDN 1');
      expect(result[0].url).toBe('https://stream.example.com/video.mp4');
    });

    it('masks known server types with clean professional names', () => {
      const input: VideoServer[] = [
        { name: 'Magi', url: 'https://magi.example.com/hls/1', isDirect: false },
        { name: 'Desu', url: 'https://desu.example.com/hls/2', isDirect: false },
        { name: 'Asura M3U8', url: 'https://redirector.php?url=abc', isDirect: false },
        { name: 'Mediafire', url: 'https://download.example.com/file.mp4', isDirect: false },
        { name: 'Voe', url: 'https://voe.sx/e/123', isDirect: false },
        { name: 'Streamwish', url: 'https://streamwish.to/e/123', isDirect: false },
        { name: 'Vidhide', url: 'https://vidhide.com/v/123', isDirect: false },
        { name: 'Other CDN', url: 'https://othercdn.com/stream', isDirect: false },
      ];

      const result = maskAndFilterServers(input);
      expect(result[0].name).toBe('Servidor Dedicado VIP (1080p Ultra HD)');
      expect(result[1].name).toBe('Servidor Alta Velocidad (1080p)');
      expect(result[2].name).toBe('Servidor Principal HLS (1080p)');
      expect(result[3].name).toBe('Servidor Espejo (MP4 Directo)');
      expect(result[4].name).toBe('Servidor Rápido (720p HD)');
      expect(result[5].name).toBe('Servidor Alternativo CDN');
      expect(result[6].name).toBe('Servidor Respaldo CDN');
      expect(result[7].name).toBe('Servidor CDN 1');
    });

    it('discards entries with no URL', () => {
      const input: VideoServer[] = [
        { name: 'Empty URL', url: '', isDirect: false },
        { name: 'Valid', url: 'https://valid.com/video', isDirect: false },
      ];

      const result = maskAndFilterServers(input);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://valid.com/video');
    });
  });
});
