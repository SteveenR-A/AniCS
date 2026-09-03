import { invoke } from '@tauri-apps/api/core';
import type { HistoryEntry, AnimeResult } from '@/types';

export const upsertHistory = (entry: HistoryEntry): Promise<void> =>
  invoke('upsert_history', { entry });

export const batchUpsertHistory = (entries: HistoryEntry[]): Promise<void> =>
  invoke('batch_upsert_history', { entries });

export const getHistory = (limit = 50, offset = 0, profileId?: string): Promise<HistoryEntry[]> =>
  invoke('get_history', { limit, offset, profileId });

export const getAllHistory = (profileId?: string): Promise<HistoryEntry[]> =>
  invoke('get_all_history', { profileId });

export const getEpisodeProgress = (episodeUrl: string, profileId?: string): Promise<number | null> =>
  invoke('get_episode_progress', { episodeUrl, profileId });

export const clearHistory = (profileId?: string): Promise<void> =>
  invoke('clear_history', { profileId });

export const removeHistory = (id: string): Promise<void> =>
  invoke('remove_history', { id });

export const removeHistoryBatch = (ids: string[]): Promise<void> =>
  invoke('remove_history_batch', { ids });

export const removeHistoryByAnime = (animeUrl: string, profileId?: string): Promise<void> =>
  invoke('remove_history_by_anime', { animeUrl, profileId });

export const addFavorite = (anime: AnimeResult, profileId?: string, status?: string): Promise<void> =>
  invoke('add_favorite', { anime, profileId, status });

export const batchAddFavorites = (favorites: AnimeResult[], profileId?: string): Promise<void> =>
  invoke('batch_add_favorites', { favorites, profileId });

export const updateFavoriteStatus = (url: string, status: string, profileId?: string): Promise<void> =>
  invoke('update_favorite_status', { url, status, profileId });

export const removeFavorite = (url: string, profileId?: string): Promise<void> =>
  invoke('remove_favorite', { url, profileId });

export const isFavorite = (url: string, profileId?: string): Promise<boolean> =>
  invoke('is_favorite', { url, profileId });

export const getFavorites = (profileId?: string): Promise<AnimeResult[]> =>
  invoke('get_favorites', { profileId });

export const getAllFavoritesForSync = (profileId?: string): Promise<AnimeResult[]> =>
  invoke('get_all_favorites_for_sync', { profileId });

export const getStorageSpaceInfo = (): Promise<import('@/types').StorageSpaceInfo> =>
  invoke('get_storage_space_info');

export const getAllSettings = (): Promise<Record<string, string>> =>
  invoke('get_all_settings');

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

/**
 * Normalizador de títulos para deduplicación canónica de animes e historial
 * Elimina acentos, mayúsculas, signos de puntuación, caracteres de reemplazo (\uFFFD / )
 * y espacios redundantes para unificar registros provenientes de descargas locales y
 * servidores online (JKAnime, etc.).
 */
export function normalizeAnimeTitleKey(str: string): string {
  if (!str) return '';
  return str
    .replace(/\uFFFD/g, 'e')         // Manejar decodificación corrupta de 'é' (ej. Caraméliser)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes/diacríticos
    .replace(/[^a-z0-9]/g, '')       // Eliminar caracteres especiales, signos (!, _, etc.) y espacios
    .trim();
}


