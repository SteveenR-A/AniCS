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
import { getDirectMediaType } from '@/utils/mediaUrls';
export const DEFAULT_JKANIME = 'https://jkanime.org';
export const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
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
export const getSources = async (): Promise<Source[]> => {
  let baseSources: Source[] = [];
  try {
    const res = await invoke<Source[]>('get_sources');
    if (Array.isArray(res)) {
      baseSources = res;
    }
  } catch (e) {
    console.error('Error fetching sources from backend:', e);
  }

  if (!baseSources || baseSources.length === 0) {
    baseSources = [
      { id: 'jkanime', name: 'JKAnime', baseUrl: DEFAULT_JKANIME },
      { id: 'mundodonghua', name: 'MundoDonghua', baseUrl: DEFAULT_MUNDODONGHUA },
      { id: 'otakustv', name: 'OtakusTV', baseUrl: DEFAULT_OTAKUSTV },
    ];
  }

  const builtInOnly = baseSources.filter((s) => !s.id.startsWith('custom_'));

  try {
    const rawCustom = await invoke<string | null>('get_setting', { key: 'custom_sources' });
    if (rawCustom) {
      const parsed = JSON.parse(rawCustom);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: { name: string; url: string; type?: string }, idx: number) => {
          builtInOnly.push({
            id: `custom_${idx}`,
            name: item.name || `Personalizado ${idx + 1}`,
            baseUrl: item.url,
          });
        });
      }
    }
  } catch {
    return baseSources;
  }

  return builtInOnly;
};

/** Obtener servidores de video de un episodio */
export const getServers = async (episodeUrl: string, source: string): Promise<VideoServer[]> => {
  const rawServers: VideoServer[] = await invoke('get_servers', { episodeUrl, source });
  return maskAndFilterServers(rawServers);
};

/** Resolver un servidor a URL directa */
export const resolveStream = (server: VideoServer, source: string): Promise<ResolvedMedia> => {
  const mediaType = server.isDirect ? getDirectMediaType(server.url) : null;
  if (mediaType) {
    return Promise.resolve({
      directUrl: server.url,
      mediaType,
      referer: server.referer,
      qualities: [],
    });
  }
  return invoke('resolve_stream', { server, source });
};

/** Obtener lista dinámica de géneros para una fuente */
export const getGenres = (source: string): Promise<GenreItem[]> =>
  invoke('get_genres', { source });
