import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../usePlayerStore';
import type { VideoServer, Episode, AnimeDetails, ResolvedMedia } from '@/types';

describe('usePlayerStore', () => {
  beforeEach(() => {
    usePlayerStore.getState().resetPlayback();
    usePlayerStore.getState().closePlayer();
  });

  it('manages currentAnime and currentEpisode', () => {
    const anime = { title: 'Attack on Titan', url: '/anime/aot' } as AnimeDetails;
    const episode = { number: 1, url: '/episode/1' } as Episode;

    usePlayerStore.getState().setCurrentAnime(anime);
    usePlayerStore.getState().setCurrentEpisode(episode);

    expect(usePlayerStore.getState().currentAnime).toEqual(anime);
    expect(usePlayerStore.getState().currentEpisode).toEqual(episode);
  });

  it('manages servers and selectedServer', () => {
    const servers: VideoServer[] = [{ name: 'Server 1', url: 'http://test', isDirect: false }];
    usePlayerStore.getState().setServers(servers);
    usePlayerStore.getState().setSelectedServer(servers[0]);

    expect(usePlayerStore.getState().servers).toEqual(servers);
    expect(usePlayerStore.getState().selectedServer).toEqual(servers[0]);
  });

  it('handles playback lifecycle: open, resetPlayback, closePlayer', () => {
    const media: ResolvedMedia = { directUrl: 'http://stream.m3u8', mediaType: 'hls', qualities: [] };
    usePlayerStore.getState().openPlayer();
    usePlayerStore.getState().setResolvedMedia(media);
    usePlayerStore.getState().setPlaybackTime(120);
    usePlayerStore.getState().setDuration(1400);

    expect(usePlayerStore.getState().isPlayerOpen).toBe(true);
    expect(usePlayerStore.getState().playbackTime).toBe(120);

    usePlayerStore.getState().resetPlayback();
    expect(usePlayerStore.getState().resolvedMedia).toBeNull();
    expect(usePlayerStore.getState().playbackTime).toBe(0);

    usePlayerStore.getState().closePlayer();
    expect(usePlayerStore.getState().isPlayerOpen).toBe(false);
  });

  it('handles volume and mute state', () => {
    usePlayerStore.getState().setVolume(0.5);
    usePlayerStore.getState().setIsMuted(true);

    expect(usePlayerStore.getState().volume).toBe(0.5);
    expect(usePlayerStore.getState().isMuted).toBe(true);
  });
});
