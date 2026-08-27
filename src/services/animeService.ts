import { invoke } from '@tauri-apps/api/core';
import type {
  AnimeResult,
  AnimeDetails,
  SearchFilters,
  SearchResultPage,
  VideoServer,
  ResolvedMedia,
  Source,
  GenreItem,
} from '@/types';

/** Buscar anime (en todos los extractores o en uno específico) */
export const searchAnime = (query: string, source?: string): Promise<AnimeResult[]> =>
  invoke('search_anime', { query, source });

/** Obtener últimos episodios */
export const getLatest = (source: string, page?: number): Promise<AnimeResult[]> =>
  invoke('get_latest', { source, page });

/** Obtener horario semanal plano */
export const getSchedule = (source: string): Promise<AnimeResult[]> =>
  invoke('get_schedule', { source });

/** Obtener horario estructurado por días de la semana */
export const getScheduleDays = (source: string): Promise<import('@/types').ScheduleDay[]> =>
  invoke('get_schedule_days', { source });

/** Obtener ranking / top animes más populares */
export const getTopAnimes = (source: string): Promise<AnimeResult[]> =>
  invoke('get_top', { source });

/** Obtener detalles completos de una serie */
export const getDetails = (url: string, source: string): Promise<AnimeDetails> =>
  invoke('get_details', { url, source });

/** Búsqueda avanzada con filtros */
export const advancedSearch = (filters: SearchFilters, source: string): Promise<SearchResultPage> =>
  invoke('advanced_search', { filters, source });

/** Obtener lista de extractores disponibles */
export const getSources = (): Promise<Source[]> =>
  invoke('get_sources');

/** Obtener servidores de video de un episodio */
export const getServers = (episodeUrl: string, source: string): Promise<VideoServer[]> =>
  invoke('get_servers', { episodeUrl, source });

/** Resolver un servidor a URL directa */
export const resolveStream = (server: VideoServer, source: string): Promise<ResolvedMedia> =>
  invoke('resolve_stream', { server, source });

/** Obtener lista dinámica de géneros para una fuente */
export const getGenres = (source: string): Promise<GenreItem[]> =>
  invoke('get_genres', { source });
