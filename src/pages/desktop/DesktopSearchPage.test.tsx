import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { DesktopSearchPage } from './DesktopSearchPage';
import { useAnimeStore } from '@/stores/useAnimeStore';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/services/animeService', () => ({ advancedSearch: mocks.search, getGenres: async () => [], getSources: async () => [] }));
vi.mock('@/components/CachedImage', () => ({ CachedImage: () => null, prefetchImage: vi.fn(), setMemoryCacheBatch: vi.fn() }));
vi.mock('@/services/downloadService', () => ({ preloadImagesBatch: async () => ({}) }));
function Navigation() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/search?q=new')}>New query</button>;
}
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('ignores an older search completing after the latest query', async () => {
  const pending = new Map<string, (value: any) => void>();
  mocks.search.mockImplementation(({ query }) => new Promise(resolve => pending.set(query, resolve)));
  useAnimeStore.setState({ activeSource: 'jkanime', searchResults: [], searchSessionsBySource: {}, genres: [] });
  render(<MemoryRouter initialEntries={['/search?q=old']}><Navigation /><DesktopSearchPage /></MemoryRouter>);
  await act(async () => {});
  fireEvent.click(screen.getByText('New query'));
  await act(async () => {});
  await act(async () => pending.get('new')!({ results: [{ title: 'New result', url: 'https://example.com/new' }], hasNext: false }));
  await act(async () => pending.get('old')!({ results: [{ title: 'Old result', url: 'https://example.com/old' }], hasNext: false }));
  expect(useAnimeStore.getState().searchResults[0].title).toBe('New result');
});

it('does not replace the shared search session after leaving the page', async () => {
  let finish!: (value: any) => void;
  mocks.search.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  useAnimeStore.setState({ activeSource: 'jkanime', searchResults: [], searchSessionsBySource: {}, genres: [] });
  const page = render(<MemoryRouter initialEntries={['/search?q=old']}><DesktopSearchPage /></MemoryRouter>);
  page.unmount();
  const nextResults = [{ title: 'Next page result', url: 'https://example.com/next', thumbnailUrl: '', source: 'jkanime' }];
  useAnimeStore.setState({ searchResults: nextResults });
  await act(async () => finish({ results: [{ title: 'Old result', url: 'https://example.com/old' }], hasNext: false }));
  expect(useAnimeStore.getState().searchResults).toEqual(nextResults);
  expect(useAnimeStore.getState().isSearching).toBe(false);
});

it('cancels a debounced search when leaving the page', async () => {
  vi.useFakeTimers();
  mocks.search.mockReset().mockResolvedValue({ results: [], hasNext: false });
  useAnimeStore.setState({ activeSource: 'jkanime', searchResults: [], searchSessionsBySource: {}, genres: [] });
  const page = render(<MemoryRouter><DesktopSearchPage /></MemoryRouter>);
  await act(async () => {});
  fireEvent.change(screen.getByPlaceholderText(/Buscar anime por título/), { target: { value: 'Naruto' } });
  const calls = mocks.search.mock.calls.length;
  page.unmount();
  await act(async () => { vi.advanceTimersByTime(500); });
  expect(mocks.search).toHaveBeenCalledTimes(calls);
  expect(useAnimeStore.getState().isSearching).toBe(false);
});

it('restarts the initial search after StrictMode replays the effects', async () => {
  const pending: ((value: any) => void)[] = [];
  mocks.search.mockReset().mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  useAnimeStore.setState({ activeSource: 'jkanime', searchResults: [], searchSessionsBySource: {}, genres: [] });
  render(<StrictMode><MemoryRouter initialEntries={['/search?q=old']}><DesktopSearchPage /></MemoryRouter></StrictMode>);
  expect(pending).toHaveLength(2);
  await act(async () => pending[1]({ results: [{ title: 'Current result', url: 'https://example.com/current' }], hasNext: false }));
  await act(async () => pending[0]({ results: [{ title: 'Obsolete result', url: 'https://example.com/old' }], hasNext: false }));
  expect(useAnimeStore.getState().searchResults[0].title).toBe('Current result');
  expect(useAnimeStore.getState().isSearching).toBe(false);
});
