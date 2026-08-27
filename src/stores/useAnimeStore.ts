import { create } from 'zustand';
import type { AnimeResult, AnimeDetails, Source } from '@/types';
import { getSources } from '@/services/animeService';

interface AnimeStore {
  sources: Source[];
  activeSource: string;
  latestEpisodes: AnimeResult[];
  searchResults: AnimeResult[];
  isSearching: boolean;
  selectedAnime: AnimeDetails | null;
  isLoadingDetails: boolean;

  setActiveSource: (id: string) => void;
  setSources: (sources: Source[]) => void;
  setLatestEpisodes: (episodes: AnimeResult[]) => void;
  setSearchResults: (results: AnimeResult[]) => void;
  setIsSearching: (v: boolean) => void;
  setSelectedAnime: (anime: AnimeDetails | null) => void;
  setIsLoadingDetails: (v: boolean) => void;
  loadSources: () => Promise<void>;
}

export const useAnimeStore = create<AnimeStore>((set) => ({
  sources: [],
  activeSource: 'jkanime',
  latestEpisodes: [],
  searchResults: [],
  isSearching: false,
  selectedAnime: null,
  isLoadingDetails: false,

  setActiveSource: (id) => set({ activeSource: id }),
  setSources: (sources) => set({ sources }),
  setLatestEpisodes: (episodes) => set({ latestEpisodes: episodes }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSelectedAnime: (anime) => set({ selectedAnime: anime }),
  setIsLoadingDetails: (v) => set({ isLoadingDetails: v }),

  loadSources: async () => {
    try {
      const sources = await getSources();
      set({ sources, activeSource: sources[0]?.id ?? 'jkanime' });
    } catch (e) {
      console.error('Failed to load sources', e);
    }
  },
}));
