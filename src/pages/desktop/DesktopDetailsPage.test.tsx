import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopDetailsPage } from './DesktopDetailsPage';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { scanLocalDownloads } from '@/services/downloadService';
import type { DownloadTask } from '@/types';

vi.mock('@/stores/useAnimeStore', () => ({ useAnimeStore: () => ({ getCachedDetails: () => ({
  title: 'Serie', url: 'anime', thumbnailUrl: 'https://example.com/poster.jpg', synopsis: 'Synopsis', genres: [], source: 'jkanime',
  episodes: [{ number: 1, url: 'https://example.com/ep1', watched: false }],
}), cacheDetails: vi.fn() }) }));
vi.mock('@/stores/useProfileStore', () => ({ useProfileStore: () => ({ activeProfile: { id: 'default' } }) }));
vi.mock('@/stores/useSubscriptionStore', () => ({ useSubscriptionStore: () => ({ isVip: true, openModal: vi.fn() }) }));
vi.mock('@/services/storageService', () => ({ isFavorite: async () => false, getHistory: async () => [],
  getFavorites: async () => [], addFavorite: vi.fn(), removeFavorite: vi.fn(), updateFavoriteStatus: vi.fn() }));
vi.mock('@/services/downloadService', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/downloadService')>(), scanLocalDownloads: vi.fn(), saveLocalAnimeCover: async () => '',
}));
vi.mock('@/components/CachedImage', () => ({ CachedImage: () => null }));
beforeEach(() => { vi.useFakeTimers(); useDownloadStore.setState({ tasks: new Map() }); vi.mocked(scanLocalDownloads).mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('updates downloaded badges on completion and removes them when files disappear', async () => {
  render(<MemoryRouter initialEntries={['/details/anime']}><Routes><Route path="/details/:url" element={<DesktopDetailsPage />} /></Routes></MemoryRouter>);
  await act(async () => {});
  expect(screen.queryByText('Descargado')).not.toBeInTheDocument();
  vi.mocked(scanLocalDownloads).mockResolvedValue([{ animeTitle: 'Serie', folderPath: '/Videos/Serie', totalEpisodes: 1, totalSize: 100,
    totalSizeFormatted: '100 B', episodes: [{ filePath: '/Videos/Serie/Ep001.mp4', fileName: 'Ep001.mp4', episodeNumber: 1,
      fileSize: 100, fileSizeFormatted: '100 B', modifiedAt: '', watchProgress: 0, watchStatus: 'unseen' }] }]);
  const task: DownloadTask = { id: 'download', animeTitle: 'Serie', episodeNumber: 1, streamUrl: '', outputPath: '',
    status: 'completed', progress: 100, downloadedBytes: 100 };
  await act(async () => {
    useDownloadStore.setState({ tasks: new Map([[task.id, task]]) });
    vi.advanceTimersByTime(200);
  });
  expect(screen.getByText('Descargado')).toBeInTheDocument();
  vi.mocked(scanLocalDownloads).mockResolvedValue([]);
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(screen.queryByText('Descargado')).not.toBeInTheDocument();
});
