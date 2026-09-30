import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import * as animeService from '../animeService';
import type { SearchFilters, VideoServer } from '@/types';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('animeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchAnime', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ title: 'Anime 1' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.searchAnime('naruto', 'jkanime');

      expect(invoke).toHaveBeenCalledWith('search_anime', { query: 'naruto', source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });

    it('handles optional source parameter', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await animeService.searchAnime('naruto');

      expect(invoke).toHaveBeenCalledWith('search_anime', { query: 'naruto', source: undefined });
    });
  });

  describe('getLatest', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ title: 'Anime 1' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getLatest('jkanime', 2);

      expect(invoke).toHaveBeenCalledWith('get_latest', { source: 'jkanime', page: 2 });
      expect(result).toEqual(mockResult);
    });

    it('handles optional page parameter', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      await animeService.getLatest('jkanime');

      expect(invoke).toHaveBeenCalledWith('get_latest', { source: 'jkanime', page: undefined });
    });
  });

  describe('getSchedule', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ title: 'Anime 1' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getSchedule('jkanime');

      expect(invoke).toHaveBeenCalledWith('get_schedule', { source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getScheduleDays', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ day: 'Monday', list: [] }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getScheduleDays('jkanime');

      expect(invoke).toHaveBeenCalledWith('get_schedule_days', { source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTopAnimes', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ title: 'Anime 1' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getTopAnimes('jkanime');

      expect(invoke).toHaveBeenCalledWith('get_top', { source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDetails', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = { title: 'Anime 1', description: 'test' };
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getDetails('/anime/1', 'jkanime');

      expect(invoke).toHaveBeenCalledWith('get_details', { url: '/anime/1', source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('advancedSearch', () => {
    it('calls invoke with correct arguments', async () => {
      const filters: SearchFilters = { genre: 'Action', page: 1 };
      const mockResult = { results: [], hasNextPage: false };
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.advancedSearch(filters, 'jkanime');

      expect(invoke).toHaveBeenCalledWith('advanced_search', { filters, source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getSources', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ id: 'jkanime', name: 'JKAnime' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getSources();

      expect(invoke).toHaveBeenCalledWith('get_sources');
      expect(result).toEqual(mockResult);
    });

    it('appends custom sources from SQLite custom_sources setting', async () => {
      const mockResult = [{ id: 'jkanime', name: 'JKAnime', baseUrl: 'https://jkanime.org' }];
      vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === 'get_sources') return mockResult;
        if (cmd === 'get_setting' && args?.key === 'custom_sources') {
          return JSON.stringify([{ name: 'Mi Fuente', url: 'https://custom.org', type: 'Anime' }]);
        }
        return null;
      });

      const result = await animeService.getSources();

      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        id: 'custom_0',
        name: 'Mi Fuente',
        baseUrl: 'https://custom.org',
      });
    });

    it('returns only built-in sources when custom sources are deleted', async () => {
      const mockResult = [{ id: 'jkanime', name: 'JKAnime', baseUrl: 'https://jkanime.org' }];
      vi.mocked(invoke).mockImplementation(async (cmd: string, args?: any) => {
        if (cmd === 'get_sources') return mockResult;
        if (cmd === 'get_setting' && args?.key === 'custom_sources') {
          return '[]';
        }
        return null;
      });

      const result = await animeService.getSources();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('jkanime');
    });
  });

  describe('getServers', () => {
    it('calls invoke with correct arguments and preserves real server names', async () => {
      const mockResult = [{ name: 'Server 1', url: 'http://test' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getServers('/episode/1', 'jkanime');

      expect(invoke).toHaveBeenCalledWith('get_servers', { episodeUrl: '/episode/1', source: 'jkanime' });
      expect(result).toEqual([{ name: 'Server 1', url: 'http://test' }]);
    });
  });

  describe('resolveStream', () => {
    it.each([
      ['https://example.com/stream.m3u8?token=abc', 'hls'],
      ['https://example.com/video.mp4', 'mp4'],
    ])('plays a custom direct URL %s without requiring a catalog extractor', async (url, mediaType) => {
      const result = await animeService.resolveStream({ name: 'Personalizado', url, isDirect: true }, 'custom');
      expect(result).toMatchObject({ directUrl: url, mediaType, qualities: [] });
      expect(invoke).not.toHaveBeenCalled();
    });

    it('calls invoke with correct arguments', async () => {
      const server: VideoServer = { name: 'Server 1', url: 'http://test', isDirect: false };
      const mockResult = { url: 'http://direct', isM3u8: false };
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.resolveStream(server, 'jkanime');

      expect(invoke).toHaveBeenCalledWith('resolve_stream', { server, source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getGenres', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ id: '1', name: 'Action' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getGenres('jkanime');

      expect(invoke).toHaveBeenCalledWith('get_genres', { source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });
});
