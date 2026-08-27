import { create } from 'zustand';
import type { AnimeResult, AnimeDetails, Source, GenreItem } from '@/types';
import { getSources, getGenres } from '@/services/animeService';

interface AnimeStore {
  sources: Source[];
  activeSource: string;
  genres: GenreItem[];
  isLoadingGenres: boolean;
  latestEpisodes: AnimeResult[];
  searchResults: AnimeResult[];
  isSearching: boolean;
  selectedAnime: AnimeDetails | null;
  isLoadingDetails: boolean;

  setActiveSource: (id: string) => void;
  setSources: (sources: Source[]) => void;
  setGenres: (genres: GenreItem[]) => void;
  setLatestEpisodes: (episodes: AnimeResult[]) => void;
  setSearchResults: (results: AnimeResult[]) => void;
  setIsSearching: (v: boolean) => void;
  setSelectedAnime: (anime: AnimeDetails | null) => void;
  setIsLoadingDetails: (v: boolean) => void;
  loadSources: () => Promise<void>;
  loadGenres: (source?: string) => Promise<void>;
}

export const useAnimeStore = create<AnimeStore>((set, get) => ({
  sources: [],
  activeSource: 'jkanime',
  genres: [],
  isLoadingGenres: false,
  latestEpisodes: [],
  searchResults: [],
  isSearching: false,
  selectedAnime: null,
  isLoadingDetails: false,

  setActiveSource: (id) => {
    set({ activeSource: id });
    get().loadGenres(id);
  },
  setSources: (sources) => set({ sources }),
  setGenres: (genres) => set({ genres }),
  setLatestEpisodes: (episodes) => set({ latestEpisodes: episodes }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSelectedAnime: (anime) => set({ selectedAnime: anime }),
  setIsLoadingDetails: (v) => set({ isLoadingDetails: v }),

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
