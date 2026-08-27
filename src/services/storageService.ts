import { invoke } from '@tauri-apps/api/core';
import type { HistoryEntry, AnimeResult } from '@/types';

export const upsertHistory = (entry: HistoryEntry): Promise<void> =>
  invoke('upsert_history', { entry });

export const getHistory = (limit = 50, offset = 0): Promise<HistoryEntry[]> =>
  invoke('get_history', { limit, offset });

export const getEpisodeProgress = (episodeUrl: string): Promise<number | null> =>
  invoke('get_episode_progress', { episodeUrl });

export const clearHistory = (): Promise<void> =>
  invoke('clear_history');

export const addFavorite = (anime: AnimeResult): Promise<void> =>
  invoke('add_favorite', { anime });

export const removeFavorite = (url: string): Promise<void> =>
  invoke('remove_favorite', { url });

export const isFavorite = (url: string): Promise<boolean> =>
  invoke('is_favorite', { url });

export const getFavorites = (): Promise<AnimeResult[]> =>
  invoke('get_favorites');
