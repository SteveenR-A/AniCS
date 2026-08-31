import { create } from 'zustand';
import type { AnimeResult, AnimeDetails, Source, GenreItem, ScheduleDay } from '@/types';
import { getSources, getGenres } from '@/services/animeService';
import { prefetchImage, setMemoryCacheBatch } from '@/components/CachedImage';
import { preloadImagesBatch } from '@/services/downloadService';

export interface SearchSession {
  query: string;
  genre: string;
  status: string;
  animeType: string;
  orderBy: string;
  results: AnimeResult[];
  currentPage: number;
  totalPages?: number;
  hasNextPage: boolean;
}

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

  // ── Cache de búsqueda y sesiones independientes por fuente ──
  searchQuery: string;
  searchResults: AnimeResult[];
  lastSearchSource: string;
  isSearching: boolean;
  searchSessionsBySource: Record<string, SearchSession>;
  recentSearches: string[];

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
  invalidateSourceCache: (source?: string) => void;

  // Búsqueda y sesiones
  setSearchResults: (results: AnimeResult[], query?: string, source?: string) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (v: boolean) => void;
  saveSearchSession: (source: string, session: Partial<SearchSession>) => void;
  getSearchSession: (source?: string) => SearchSession | undefined;
  addRecentSearch: (term: string) => void;
  removeRecentSearch: (term: string) => void;
  clearRecentSearches: () => void;

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

function isItemSourceValid(item: AnimeResult, src: string): boolean {
  if (item.source && item.source !== src) return false;
  if (item.url) {
    if (src === 'jkanime' && !item.url.includes('jkanime.net')) return false;
    if (src === 'mundodonghua' && !item.url.includes('mundodonghua.com')) return false;
  }
  return true;
}

const RECENT_SEARCHES_KEY = 'anics_recent_searches';

function loadInitialRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 12);
    }
  } catch {}
  return [];
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
  searchSessionsBySource: {},
  recentSearches: loadInitialRecentSearches(),

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
    const validated = episodes
      .filter((ep) => isItemSourceValid(ep, src))
      .map((ep) => ({ ...ep, source: src }));
    set((state) => ({
      latestEpisodesBySource: {
        ...state.latestEpisodesBySource,
        [src]: validated,
      },
    }));
    get().preloadImages(validated);
  },

  getLatestEpisodes: (source) => {
    const src = source || get().activeSource;
    return get().latestEpisodesBySource[src];
  },

  setSchedule: (schedule, source) => {
    const src = source || get().activeSource;
    const validated = schedule
      .filter((a) => isItemSourceValid(a, src))
      .map((a) => ({ ...a, source: src }));
    set((state) => ({
      scheduleBySource: {
        ...state.scheduleBySource,
        [src]: validated,
      },
    }));
    get().preloadImages(validated);
  },

  getSchedule: (source) => {
    const src = source || get().activeSource;
    return get().scheduleBySource[src];
  },

  setScheduleDays: (days, source) => {
    const src = source || get().activeSource;
    const validatedDays = days.map((day) => ({
      ...day,
      animes: day.animes
        .filter((a) => isItemSourceValid(a, src))
        .map((a) => ({ ...a, source: src })),
    }));
    set((state) => ({
      scheduleDaysBySource: {
        ...state.scheduleDaysBySource,
        [src]: validatedDays,
      },
    }));
    // Precargar todas las imágenes de los días de emisión en el backend
    const allAnimes = validatedDays.flatMap((d) => d.animes);
    get().preloadImages(allAnimes);
  },

  getScheduleDays: (source) => {
    const src = source || get().activeSource;
    return get().scheduleDaysBySource[src];
  },

  setTopList: (list, source) => {
    const src = source || get().activeSource;
    const validated = list
      .filter((a) => isItemSourceValid(a, src))
      .map((a) => ({ ...a, source: src }));
    set((state) => ({
      topListBySource: {
        ...state.topListBySource,
        [src]: validated,
      },
    }));
    get().preloadImages(validated);
  },

  getTopList: (source) => {
    const src = source || get().activeSource;
    return get().topListBySource[src];
  },

  invalidateSourceCache: (source?: string) => {
    const src = source || get().activeSource;
    set((state) => {
      const nextLatest = { ...state.latestEpisodesBySource };
      const nextSchedule = { ...state.scheduleBySource };
      const nextScheduleDays = { ...state.scheduleDaysBySource };
      const nextTop = { ...state.topListBySource };
      delete nextLatest[src];
      delete nextSchedule[src];
      delete nextScheduleDays[src];
      delete nextTop[src];
      return {
        latestEpisodesBySource: nextLatest,
        scheduleBySource: nextSchedule,
        scheduleDaysBySource: nextScheduleDays,
        topListBySource: nextTop,
      };
    });
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

  saveSearchSession: (source, sessionData) => {
    set((state) => {
      const existing = state.searchSessionsBySource[source] || {
        query: '',
        genre: '',
        status: '',
        animeType: '',
        orderBy: '',
        results: [],
        currentPage: 1,
        hasNextPage: false,
      };
      return {
        searchSessionsBySource: {
          ...state.searchSessionsBySource,
          [source]: {
            ...existing,
            ...sessionData,
          },
        },
      };
    });
  },

  getSearchSession: (source) => {
    const src = source || get().activeSource;
    return get().searchSessionsBySource[src];
  },

  addRecentSearch: (term) => {
    const trimmed = term.trim();
    if (!trimmed || trimmed.length < 2) return;
    set((state) => {
      const filtered = state.recentSearches.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return { recentSearches: updated };
    });
  },

  removeRecentSearch: (term) => {
    set((state) => {
      const updated = state.recentSearches.filter((t) => t !== term);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {}
      return { recentSearches: updated };
    });
  },

  clearRecentSearches: () => {
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {}
    set({ recentSearches: [] });
  },

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
