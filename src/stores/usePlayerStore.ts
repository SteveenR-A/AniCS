import { create } from 'zustand';
import type { VideoServer, ResolvedMedia, Episode, AnimeDetails } from '@/types';

interface PlayerStore {
  currentAnime: AnimeDetails | null;
  currentEpisode: Episode | null;
  servers: VideoServer[];
  resolvedMedia: ResolvedMedia | null;
  selectedServer: VideoServer | null;
  isLoadingServers: boolean;
  isResolving: boolean;
  isPlayerOpen: boolean;
  volume: number;
  isMuted: boolean;
  playbackTime: number;
  duration: number;

  setCurrentAnime: (anime: AnimeDetails | null) => void;
  setCurrentEpisode: (episode: Episode | null) => void;
  setServers: (servers: VideoServer[]) => void;
  setResolvedMedia: (media: ResolvedMedia | null) => void;
  setSelectedServer: (server: VideoServer | null) => void;
  setIsLoadingServers: (v: boolean) => void;
  setIsResolving: (v: boolean) => void;
  resetPlayback: () => void;
  openPlayer: () => void;
  closePlayer: () => void;
  setVolume: (v: number) => void;
  setIsMuted: (v: boolean) => void;
  setPlaybackTime: (t: number) => void;
  setDuration: (d: number) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  currentAnime: null,
  currentEpisode: null,
  servers: [],
  resolvedMedia: null,
  selectedServer: null,
  isLoadingServers: false,
  isResolving: false,
  isPlayerOpen: false,
  volume: 1,
  isMuted: false,
  playbackTime: 0,
  duration: 0,

  setCurrentAnime: (anime) => set({ currentAnime: anime }),
  setCurrentEpisode: (episode) => set({ currentEpisode: episode }),
  setServers: (servers) => set({ servers }),
  setResolvedMedia: (media) => set({ resolvedMedia: media }),
  setSelectedServer: (server) => set({ selectedServer: server }),
  setIsLoadingServers: (v) => set({ isLoadingServers: v }),
  setIsResolving: (v) => set({ isResolving: v }),
  resetPlayback: () => set({ resolvedMedia: null, selectedServer: null, playbackTime: 0, duration: 0, isResolving: false, isLoadingServers: false }),
  openPlayer: () => set({ isPlayerOpen: true }),
  closePlayer: () => set({ isPlayerOpen: false, resolvedMedia: null, selectedServer: null }),
  setVolume: (v) => set({ volume: v }),
  setIsMuted: (v) => set({ isMuted: v }),
  setPlaybackTime: (t) => set({ playbackTime: t }),
  setDuration: (d) => set({ duration: d }),
}));
