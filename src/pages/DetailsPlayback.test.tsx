import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopDetailsPage } from './desktop/DesktopDetailsPage';
import { MobileDetailsPage } from './mobile/MobileDetailsPage';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { AnimeDetails, HistoryEntry } from '@/types';

const mocks = vi.hoisted(() => ({ history: vi.fn(), servers: vi.fn(), details: null as AnimeDetails | null }));
vi.mock('@/stores/useAnimeStore', () => ({ useAnimeStore: () => ({ getCachedDetails: () => mocks.details, cacheDetails: vi.fn() }) }));
vi.mock('@/stores/useProfileStore', () => ({ useProfileStore: () => ({ activeProfile: { id: 'default' } }) }));
vi.mock('@/stores/useSubscriptionStore', () => ({ useSubscriptionStore: () => ({ isVip: true, openModal: vi.fn() }) }));
vi.mock('@/services/storageService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/storageService')>(),
  getAllHistory: mocks.history, isFavorite: async () => false, getFavorites: async () => [],
}));
vi.mock('@/services/animeService', () => ({ getServers: mocks.servers, resolveStream: vi.fn(), getDetails: vi.fn() }));
vi.mock('@/services/downloadService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/downloadService')>(), scanLocalDownloads: async () => [], saveLocalAnimeCover: vi.fn(),
}));
vi.mock('@/components/CachedImage', () => ({ CachedImage: () => null }));

beforeEach(() => {
  mocks.history.mockReset().mockResolvedValue([]);
  mocks.servers.mockReset().mockResolvedValue([]);
  mocks.details = { title: 'Serie', url: 'anime', thumbnailUrl: 'https://example.com/poster.jpg', synopsis: '', genres: [], source: 'jkanime',
    episodes: [5, 4, 3, 2, 1].map(number => ({ number, url: `https://example.com/ep${number}`, watched: false })) };
});
afterEach(() => { cleanup(); });

describe.each([['desktop', DesktopDetailsPage], ['mobile', MobileDetailsPage]] as const)('%s primary play button', (_, Page) => {
  it.each([
    [null, 'Reproducir episodio 1', 1],
    [.4, 'Reanudar episodio 4', 4],
    [1, 'Continuar episodio 5', 5],
  ] as const)('selects the correct episode for progress %s', async (progress, label, expectedEpisode) => {
    const row: HistoryEntry = { id: '4', animeTitle: 'Serie', animeUrl: 'anime', thumbnailUrl: '', episodeNumber: 4,
      episodeUrl: 'https://example.com/ep4', source: 'jkanime', profileId: 'default', watchProgress: progress ?? 0, watchedAt: '2026-10-16' };
    mocks.history.mockResolvedValue(progress === null ? [] : [row]);
    render(<MemoryRouter initialEntries={['/details/anime']}><Routes>
      <Route path="/details/:url" element={<Page />} />
      <Route path="/player" element={<p>Reproductor abierto</p>} />
    </Routes></MemoryRouter>);
    const play = await screen.findByRole('button', { name: label });
    await act(async () => { fireEvent.click(play); });
    expect(screen.getByText('Reproductor abierto')).toBeInTheDocument();
    expect(usePlayerStore.getState().currentEpisode?.number).toBe(expectedEpisode);
    expect(mocks.servers).toHaveBeenCalledWith(`https://example.com/ep${expectedEpisode}`, 'jkanime');
  });
});
