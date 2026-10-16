import { describe, expect, it } from 'vitest';
import { animePlaybackAction } from '../animePlayback';
import type { AnimeDetails, HistoryEntry } from '@/types';

const details: AnimeDetails = {
  title: 'Serie temporada 1', url: 'https://example.com/serie', thumbnailUrl: '', synopsis: '', genres: [], source: 'jkanime',
  episodes: [6, 5, 4, 3, 2, 1].map(number => ({ number, url: `https://example.com/ep${number}`, watched: false })),
};
const row = (number: number, progress: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: `ep${number}`, animeTitle: details.title, animeUrl: details.url, thumbnailUrl: '', episodeNumber: number,
  episodeUrl: `https://example.com/ep${number}`, watchProgress: progress, watchedAt: '2026-10-16T12:00:00Z',
  source: 'jkanime', profileId: 'default', ...overrides,
});

describe('primary playback action', () => {
  it('starts with episode 1 when there is no history, regardless of catalogue ordering', () => {
    expect(animePlaybackAction(details, [])).toMatchObject({ episode: { number: 1 }, label: 'Reproducir episodio 1' });
  });
  it('resumes an incomplete episode 4', () => {
    expect(animePlaybackAction(details, [row(4, .5)])).toMatchObject({ episode: { number: 4 }, label: 'Reanudar episodio 4' });
  });
  it.each([.9, 1])('continues with episode 5 after completing episode 4 (%s)', progress => {
    expect(animePlaybackAction(details, [row(4, progress)])).toMatchObject({ episode: { number: 5 }, label: 'Continuar episodio 5' });
  });
  it('uses the most recent watch rather than the highest episode number', () => {
    expect(animePlaybackAction(details, [row(4, 1), row(2, .3, { watchedAt: '2026-10-16T13:00:00Z' })])?.episode.number).toBe(2);
  });
  it('skips completed successors and handles gaps in available episode numbers', () => {
    expect(animePlaybackAction(details, [row(4, 1), row(5, 1, { watchedAt: '2026-10-16T11:00:00Z' })])?.episode.number).toBe(6);
    expect(animePlaybackAction({ ...details, episodes: details.episodes.filter(ep => ep.number !== 5) }, [row(4, 1)])?.episode.number).toBe(6);
  });
  it('offers the final watched episode again when there is no successor', () => {
    expect(animePlaybackAction(details, [row(6, 1)])).toMatchObject({ episode: { number: 6 }, label: 'Volver a ver episodio 6' });
  });
  it('keeps profiles and seasons separate', () => {
    const unrelated = row(4, .5, { animeTitle: 'Serie temporada 2', animeUrl: 'other', episodeUrl: 'other/4' });
    expect(animePlaybackAction(details, [unrelated, row(4, 1, { profileId: 'other' })])?.episode.number).toBe(1);
    expect(animePlaybackAction(details, [row(4, .5, { profileId: 'other' })], 'other')?.episode.number).toBe(4);
  });
  it('matches local history, punctuation and canonical URLs', () => {
    expect(animePlaybackAction(details, [row(4, .5, { animeTitle: 'Serie S1', animeUrl: '/Videos/serie', episodeUrl: '/Videos/serie/4.mp4', source: 'local' })])?.episode.number).toBe(4);
    expect(animePlaybackAction(details, [row(4, .5, { animeTitle: 'Legacy title', animeUrl: details.url + '/' })])?.episode.number).toBe(4);
  });
  it('keeps a genuinely empty catalogue disabled', () => {
    expect(animePlaybackAction({ ...details, episodes: [] }, [row(4, 1)])).toBeNull();
  });
});
