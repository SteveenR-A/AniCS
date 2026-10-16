import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAnimeHistory } from './useAnimeHistory';
import type { AnimeDetails, HistoryEntry } from '@/types';

const mocks = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock('@/services/storageService', () => ({ getAllHistory: mocks.history }));
const details: AnimeDetails = { title: 'Serie', url: 'anime', thumbnailUrl: '', synopsis: '', genres: [], source: 'jkanime',
  episodes: [1, 4, 5].map(number => ({ number, url: `ep${number}`, watched: false })) };
const row = (profileId = 'default', progress = .5): HistoryEntry => ({ id: '4', animeTitle: 'Serie', animeUrl: 'anime', thumbnailUrl: '',
  episodeNumber: 4, episodeUrl: 'ep4', watchProgress: progress, watchedAt: '2026-10-16', source: 'jkanime', profileId });

beforeEach(() => { mocks.history.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('ignores a previous profile response after switching profiles', async () => {
  const pending = new Map<string, (rows: HistoryEntry[]) => void>();
  mocks.history.mockImplementation((id: string) => new Promise(resolve => pending.set(id, resolve)));
  const hook = renderHook(({ profileId }) => useAnimeHistory(details, profileId), { initialProps: { profileId: 'default' } });
  hook.rerender({ profileId: 'other' });
  expect(hook.result.current.isLoading).toBe(true);
  await act(async () => pending.get('other')!([]));
  expect(hook.result.current.action?.episode.number).toBe(1);
  await act(async () => pending.get('default')!([row()]));
  expect(hook.result.current.action?.episode.number).toBe(1);
  expect(hook.result.current.progress.size).toBe(0);
});

it('refreshes progress on focus and after sync using the full profile history', async () => {
  mocks.history.mockResolvedValue([row()]);
  const { result } = renderHook(() => useAnimeHistory(details));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mocks.history).toHaveBeenCalledWith('default');
  expect(result.current.action?.episode.number).toBe(4);
  mocks.history.mockResolvedValue([row('default', 1)]);
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(result.current.action?.episode.number).toBe(5));
  mocks.history.mockResolvedValue([]);
  act(() => { window.dispatchEvent(new Event('anics:sync-completed')); });
  await waitFor(() => expect(result.current.action?.episode.number).toBe(1));
});

it('reports an unreadable history and allows retry instead of silently restarting', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.history.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue([row()]);
  const { result } = renderHook(() => useAnimeHistory(details));
  await waitFor(() => expect(result.current.error).toBe(true));
  act(() => { result.current.refresh(); });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.error).toBe(false);
  expect(result.current.action?.episode.number).toBe(4);
});
