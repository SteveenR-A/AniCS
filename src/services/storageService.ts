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

export interface DatabaseStats {
  historyCount: number;
  favoritesCount: number;
  downloadsCount: number;
  cachedImagesCount: number;
  databaseSizeBytes: number;
  databaseSizeFormatted: string;
}

/** Obtener estadísticas y peso de la base de datos SQLite */
export const getDatabaseStats = (): Promise<DatabaseStats> =>
  invoke('get_database_stats');

/** Optimiza y compacta SQLite (VACUUM) recuperando espacio sin perder datos */
export const optimizeDatabase = (): Promise<void> =>
  invoke('optimize_database');

/** Restablece de forma segura las tablas de SQLite sin romper la integridad de la app */
export const resetDatabase = (): Promise<void> =>
  invoke('reset_database');

