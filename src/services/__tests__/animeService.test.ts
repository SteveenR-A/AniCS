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
      const filters: SearchFilters = { genres: ['Action'] };
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
  });

  describe('getServers', () => {
    it('calls invoke with correct arguments', async () => {
      const mockResult = [{ name: 'Server 1', url: 'http://test' }];
      vi.mocked(invoke).mockResolvedValueOnce(mockResult);

      const result = await animeService.getServers('/episode/1', 'jkanime');

      expect(invoke).toHaveBeenCalledWith('get_servers', { episodeUrl: '/episode/1', source: 'jkanime' });
      expect(result).toEqual(mockResult);
    });
  });

  describe('resolveStream', () => {
    it('calls invoke with correct arguments', async () => {
      const server: VideoServer = { name: 'Server 1', url: 'http://test' };
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
