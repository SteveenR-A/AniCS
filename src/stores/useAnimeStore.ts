import { create } from 'zustand';
import type { AnimeResult, AnimeDetails, Source, GenreItem } from '@/types';
import { getSources, getGenres } from '@/services/animeService';
import { prefetchImage } from '@/components/CachedImage';

interface AnimeStore {
  sources: Source[];
  activeSource: string;
  genres: GenreItem[];
  isLoadingGenres: boolean;
  latestEpisodes: AnimeResult[];
  schedule: AnimeResult[];
  searchResults: AnimeResult[];
  isSearching: boolean;
  selectedAnime: AnimeDetails | null;
  isLoadingDetails: boolean;
  
  // Caché de detalles en RAM para carga instantánea 0ms
  detailsCache: Record<string, AnimeDetails>;

  setActiveSource: (id: string) => void;
  setSources: (sources: Source[]) => void;
  setGenres: (genres: GenreItem[]) => void;
  setLatestEpisodes: (episodes: AnimeResult[]) => void;
  setSchedule: (schedule: AnimeResult[]) => void;
  setSearchResults: (results: AnimeResult[]) => void;
  setIsSearching: (v: boolean) => void;
  setSelectedAnime: (anime: AnimeDetails | null) => void;
  setIsLoadingDetails: (v: boolean) => void;
  cacheDetails: (details: AnimeDetails) => void;
  getCachedDetails: (url: string) => AnimeDetails | undefined;
  loadSources: () => Promise<void>;
  loadGenres: (source?: string) => Promise<void>;
  preloadImages: (animes: AnimeResult[]) => void;
}

export const useAnimeStore = create<AnimeStore>((set, get) => ({
  sources: [],
  activeSource: 'jkanime',
  genres: [],
  isLoadingGenres: false,
  latestEpisodes: [],
  schedule: [],
  searchResults: [],
  isSearching: false,
  selectedAnime: null,
  isLoadingDetails: false,
  detailsCache: {},

  setActiveSource: (id) => {
    set({ activeSource: id });
    get().loadGenres(id);
  },
  setSources: (sources) => set({ sources }),
  setGenres: (genres) => set({ genres }),
  setLatestEpisodes: (episodes) => {
    set({ latestEpisodes: episodes });
    get().preloadImages(episodes);
  },
  setSchedule: (schedule) => {
    set({ schedule });
    get().preloadImages(schedule);
  },
  setSearchResults: (results) => {
    set({ searchResults: results });
    get().preloadImages(results);
  },
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
    animes.forEach((a) => {
      if (a.thumbnailUrl) {
        prefetchImage(a.thumbnailUrl);
      }
    });
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
    set({ isLoadingGenres: true });
    try {
      const genres = await getGenres(src);
      set({ genres });
    } catch (e) {
      console.error('Failed to load genres for source:', src, e);
    } finally {
      set({ isLoadingGenres: false });
    }
  },
}));
