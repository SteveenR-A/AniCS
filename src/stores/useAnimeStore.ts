import { create } from 'zustand';
import type { AnimeResult, AnimeDetails, Source, GenreItem, ScheduleDay } from '@/types';
import { getSources, getGenres } from '@/services/animeService';
import { prefetchImage, setMemoryCacheBatch } from '@/components/CachedImage';
import { preloadImagesBatch } from '@/services/downloadService';

interface AnimeStore {
  sources: Source[];
  activeSource: string;
  genres: GenreItem[];
  genresBySource: Record<string, GenreItem[]>;
  isLoadingGenres: boolean;

  // ── Cache en RAM por fuente (0ms al cambiar de tab o regresar a una página) ──
  latestEpisodesBySource: Record<string, AnimeResult[]>;
  scheduleBySource: Record<string, AnimeResult[]>;
  scheduleDaysBySource: Record<string, ScheduleDay[]>;
  topListBySource: Record<string, AnimeResult[]>;

  // ── Cache de búsqueda en RAM ──
  searchQuery: string;
  searchResults: AnimeResult[];
  lastSearchSource: string;
  isSearching: boolean;

  // ── Cache de detalles en RAM (0ms instantáneo) ──
  selectedAnime: AnimeDetails | null;
  isLoadingDetails: boolean;
  detailsCache: Record<string, AnimeDetails>;

  // ── Acciones ──
  setActiveSource: (id: string) => void;
  setSources: (sources: Source[]) => void;
  setGenres: (genres: GenreItem[]) => void;

  // Setters y Getters de Home
  setLatestEpisodes: (episodes: AnimeResult[], source?: string) => void;
  getLatestEpisodes: (source?: string) => AnimeResult[] | undefined;

  setSchedule: (schedule: AnimeResult[], source?: string) => void;
  getSchedule: (source?: string) => AnimeResult[] | undefined;

  // Setters y Getters de Horarios
  setScheduleDays: (days: ScheduleDay[], source?: string) => void;
  getScheduleDays: (source?: string) => ScheduleDay[] | undefined;

  // Setters y Getters de Top Animes
  setTopList: (list: AnimeResult[], source?: string) => void;
  getTopList: (source?: string) => AnimeResult[] | undefined;

  // Búsqueda
  setSearchResults: (results: AnimeResult[], query?: string, source?: string) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (v: boolean) => void;

  // Detalles
  setSelectedAnime: (anime: AnimeDetails | null) => void;
  setIsLoadingDetails: (v: boolean) => void;
  cacheDetails: (details: AnimeDetails) => void;
  getCachedDetails: (url: string) => AnimeDetails | undefined;

  // Acciones asíncronas
  loadSources: () => Promise<void>;
  loadGenres: (source?: string) => Promise<void>;
  preloadImages: (animes: AnimeResult[]) => void;
}

export const useAnimeStore = create<AnimeStore>((set, get) => ({
  sources: [],
  activeSource: 'jkanime',
  genres: [],
  genresBySource: {},
  isLoadingGenres: false,

  latestEpisodesBySource: {},
  scheduleBySource: {},
  scheduleDaysBySource: {},
  topListBySource: {},

  searchQuery: '',
  searchResults: [],
  lastSearchSource: '',
  isSearching: false,

  selectedAnime: null,
  isLoadingDetails: false,
  detailsCache: {},

  setActiveSource: (id) => {
    set({ activeSource: id });
    const cachedGenres = get().genresBySource[id];
    if (cachedGenres && cachedGenres.length > 0) {
      set({ genres: cachedGenres });
    } else {
      get().loadGenres(id);
    }
  },

  setSources: (sources) => set({ sources }),
  setGenres: (genres) => {
    const src = get().activeSource;
    set((state) => ({
      genres,
      genresBySource: { ...state.genresBySource, [src]: genres },
    }));
  },

  setLatestEpisodes: (episodes, source) => {
    const src = source || get().activeSource;
    set((state) => ({
      latestEpisodesBySource: {
        ...state.latestEpisodesBySource,
        [src]: episodes,
      },
    }));
    get().preloadImages(episodes);
  },

  getLatestEpisodes: (source) => {
    const src = source || get().activeSource;
    return get().latestEpisodesBySource[src];
  },

  setSchedule: (schedule, source) => {
    const src = source || get().activeSource;
    set((state) => ({
      scheduleBySource: {
        ...state.scheduleBySource,
        [src]: schedule,
      },
    }));
    get().preloadImages(schedule);
  },

  getSchedule: (source) => {
    const src = source || get().activeSource;
    return get().scheduleBySource[src];
  },

  setScheduleDays: (days, source) => {
    const src = source || get().activeSource;
    set((state) => ({
      scheduleDaysBySource: {
        ...state.scheduleDaysBySource,
        [src]: days,
      },
    }));
    // Precargar todas las imágenes de los días de emisión en el backend
    const allAnimes = days.flatMap((d) => d.animes);
    get().preloadImages(allAnimes);
  },

  getScheduleDays: (source) => {
    const src = source || get().activeSource;
    return get().scheduleDaysBySource[src];
  },

  setTopList: (list, source) => {
    const src = source || get().activeSource;
    set((state) => ({
      topListBySource: {
        ...state.topListBySource,
        [src]: list,
      },
    }));
    get().preloadImages(list);
  },

  getTopList: (source) => {
    const src = source || get().activeSource;
    return get().topListBySource[src];
  },

  setSearchResults: (results, query, source) => {
    const src = source || get().activeSource;
    set({
      searchResults: results,
      searchQuery: query !== undefined ? query : get().searchQuery,
      lastSearchSource: src,
    });
    get().preloadImages(results);
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSearching: (v) => set({ isSearching: v }),

  setSelectedAnime: (anime) => set({ selectedAnime: anime }),
  setIsLoadingDetails: (v) => set({ isLoadingDetails: v }),

  cacheDetails: (details) => {
    if (!details || !details.url) return;
    set((state) => ({
      detailsCache: {
        ...state.detailsCache,
        [details.url]: details,
      },
    }));
    if (details.thumbnailUrl) {
      prefetchImage(details.thumbnailUrl);
    }
  },

  getCachedDetails: (url) => {
    return get().detailsCache[url];
  },

  preloadImages: (animes) => {
    const urls = animes.map((a) => a.thumbnailUrl).filter(Boolean) as string[];
    if (urls.length > 0) {
      preloadImagesBatch(urls)
        .then((batch) => {
          if (batch && Object.keys(batch).length > 0) {
            setMemoryCacheBatch(batch);
          }
        })
        .catch(() => {/* best-effort */});
    }
  },

  loadSources: async () => {
    try {
      const sources = await getSources();
      const initialSource = sources[0]?.id ?? 'jkanime';
      set({ sources, activeSource: initialSource });
      get().loadGenres(initialSource);
    } catch (e) {
      console.error('Failed to load sources', e);
    }
  },

  loadGenres: async (source?: string) => {
    const src = source || get().activeSource;
    const cached = get().genresBySource[src];
    if (cached && cached.length > 0) {
      set({ genres: cached });
      return;
    }

    set({ isLoadingGenres: true });
    try {
      const genres = await getGenres(src);
      set((state) => ({
        genres,
        genresBySource: { ...state.genresBySource, [src]: genres },
      }));
    } catch (e) {
      console.error('Failed to load genres for source:', src, e);
    } finally {
      set({ isLoadingGenres: false });
    }
  },
}));
