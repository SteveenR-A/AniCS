import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenreItem } from '@/types';
import { getGenres } from '@/services/animeService';
import { useAnimeStore } from '../useAnimeStore';

vi.mock('@/services/animeService', () => ({ getGenres: vi.fn(), getSources: vi.fn() }));
vi.mock('@/components/CachedImage', () => ({ prefetchImage: vi.fn(), setMemoryCacheBatch: vi.fn() }));
vi.mock('@/services/downloadService', () => ({ preloadImagesBatch: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  useAnimeStore.setState({ activeSource: 'jkanime', genres: [], genresBySource: {}, isLoadingGenres: false });
});

describe('genre loading', () => {
  it('shares an in-flight request for the same source', async () => {
    let finish!: (genres: GenreItem[]) => void;
    vi.mocked(getGenres).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const first = useAnimeStore.getState().loadGenres();
    const second = useAnimeStore.getState().loadGenres();
    const calls = vi.mocked(getGenres).mock.calls.length;
    const genres = [{ name: 'Acción', slug: 'accion' }];
    finish(genres);
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(useAnimeStore.getState().genres).toEqual(genres);
    expect(useAnimeStore.getState().isLoadingGenres).toBe(false);
  });

  it('a background source request does not leave the active source loading forever', async () => {
    let finish!: (genres: GenreItem[]) => void;
    vi.mocked(getGenres)
      .mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce([{ name: 'Fantasía', slug: 'fantasia' }]);
    const active = useAnimeStore.getState().loadGenres('jkanime');
    await useAnimeStore.getState().loadGenres('mundodonghua');
    const genres = [{ name: 'Acción', slug: 'accion' }];
    finish(genres);
    await active;
    expect(useAnimeStore.getState().genres).toEqual(genres);
    expect(useAnimeStore.getState().isLoadingGenres).toBe(false);
    expect(useAnimeStore.getState().genresBySource.mundodonghua).toEqual([{ name: 'Fantasía', slug: 'fantasia' }]);
  });

  it('keeps the visible genres for the selected source when requests finish out of order', async () => {
    let finishOld!: (genres: GenreItem[]) => void;
    const current = [{ name: 'Fantasía', slug: 'fantasia' }];
    vi.mocked(getGenres)
      .mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce(current);
    const old = useAnimeStore.getState().loadGenres('jkanime');
    useAnimeStore.setState({ activeSource: 'mundodonghua' });
    await useAnimeStore.getState().loadGenres();
    finishOld([{ name: 'Acción', slug: 'accion' }]);
    await old;
    expect(useAnimeStore.getState().genres).toEqual(current);
    expect(useAnimeStore.getState().genresBySource.jkanime).toEqual([{ name: 'Acción', slug: 'accion' }]);
  });

  it('allows retrying after a failed request', async () => {
    vi.mocked(getGenres).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    await useAnimeStore.getState().loadGenres();
    await useAnimeStore.getState().loadGenres();
    expect(getGenres).toHaveBeenCalledTimes(2);
    expect(useAnimeStore.getState().isLoadingGenres).toBe(false);
  });
});
