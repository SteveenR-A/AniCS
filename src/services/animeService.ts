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
import { maskAndFilterServers } from '@/utils/serverUtils';
export const DEFAULT_JKANIME = 'https://jkanime.org';
export const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
export const DEFAULT_ANIMEJL = 'https://www.anime-jl.net';
export const DEFAULT_OTAKUSTV = 'https://www.otakustv.net';
export const DEFAULT_ANDROID_DOWNLOAD_DIR = '/storage/emulated/0/Anime';
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
export const getServers = async (episodeUrl: string, source: string): Promise<VideoServer[]> => {
  const rawServers: VideoServer[] = await invoke('get_servers', { episodeUrl, source });
  return maskAndFilterServers(rawServers);
};

/** Resolver un servidor a URL directa */
export const resolveStream = (server: VideoServer, source: string): Promise<ResolvedMedia> =>
  invoke('resolve_stream', { server, source });

/** Obtener lista dinámica de géneros para una fuente */
export const getGenres = (source: string): Promise<GenreItem[]> =>
  invoke('get_genres', { source });
