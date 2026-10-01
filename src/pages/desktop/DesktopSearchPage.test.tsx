import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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
afterEach(cleanup);
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
