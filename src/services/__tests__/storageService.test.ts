import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  upsertHistory,
  getHistory,
  getEpisodeProgress,
  clearHistory,
  removeHistory,
  addFavorite,
  removeFavorite,
  isFavorite,
  getFavorites,
  getDatabaseStats,
  optimizeDatabase,
  resetDatabase,
} from '../storageService';
import { invoke } from '@tauri-apps/api/core';
import type { HistoryEntry, AnimeResult } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('storageService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('upsertHistory should call invoke with correct arguments', async () => {
    const entry = { title: 'Test Anime' } as unknown as HistoryEntry;
    await upsertHistory(entry);
    expect(invoke).toHaveBeenCalledWith('upsert_history', { entry });
  });

  it('getHistory should call invoke with default arguments', async () => {
    await getHistory();
    expect(invoke).toHaveBeenCalledWith('get_history', { limit: 50, offset: 0, profileId: undefined });
  });

  it('getHistory should call invoke with provided arguments', async () => {
    await getHistory(10, 5, 'profile_1');
    expect(invoke).toHaveBeenCalledWith('get_history', { limit: 10, offset: 5, profileId: 'profile_1' });
  });

  it('getEpisodeProgress should call invoke with correct arguments', async () => {
    const episodeUrl = 'http://example.com/ep1';
    await getEpisodeProgress(episodeUrl, 'profile_1');
    expect(invoke).toHaveBeenCalledWith('get_episode_progress', { episodeUrl, profileId: 'profile_1' });
  });

  it('clearHistory should call invoke with correct arguments', async () => {
    await clearHistory('profile_1');
    expect(invoke).toHaveBeenCalledWith('clear_history', { profileId: 'profile_1' });
  });

  it('removeHistory should call invoke with correct arguments', async () => {
    const id = 'https://jkanime.net/naruto-1';
    await removeHistory(id);
    expect(invoke).toHaveBeenCalledWith('remove_history', { id });
  });

  it('addFavorite should call invoke with correct arguments', async () => {
    const anime = { title: 'Test Anime' } as unknown as AnimeResult;
    await addFavorite(anime, 'profile_1');
    expect(invoke).toHaveBeenCalledWith('add_favorite', { anime, profileId: 'profile_1' });
  });

  it('removeFavorite should call invoke with correct arguments', async () => {
    const url = 'http://example.com/anime';
    await removeFavorite(url, 'profile_1');
    expect(invoke).toHaveBeenCalledWith('remove_favorite', { url, profileId: 'profile_1' });
  });

  it('isFavorite should call invoke with correct arguments', async () => {
    const url = 'http://example.com/anime';
    await isFavorite(url, 'profile_1');
    expect(invoke).toHaveBeenCalledWith('is_favorite', { url, profileId: 'profile_1' });
  });

  it('getFavorites should call invoke with correct arguments', async () => {
    await getFavorites('profile_1');
    expect(invoke).toHaveBeenCalledWith('get_favorites', { profileId: 'profile_1' });
  });

  it('getDatabaseStats should call invoke with correct arguments', async () => {
    await getDatabaseStats();
    expect(invoke).toHaveBeenCalledWith('get_database_stats');
  });

  it('optimizeDatabase should call invoke with correct arguments', async () => {
    await optimizeDatabase();
    expect(invoke).toHaveBeenCalledWith('optimize_database');
  });

  it('resetDatabase should call invoke with correct arguments', async () => {
    await resetDatabase();
    expect(invoke).toHaveBeenCalledWith('reset_database');
  });
});
