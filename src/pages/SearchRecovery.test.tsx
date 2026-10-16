import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopSearchPage } from './desktop/DesktopSearchPage';
import { MobileSearchPage } from './mobile/MobileSearchPage';
import { useAnimeStore } from '@/stores/useAnimeStore';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/services/animeService', () => ({ advancedSearch: mocks.search, getGenres: async () => [], getSources: async () => [] }));
vi.mock('@/components/CachedImage', () => ({ CachedImage: () => null, prefetchImage: vi.fn(), setMemoryCacheBatch: vi.fn() }));
vi.mock('@/services/downloadService', () => ({ preloadImagesBatch: async () => ({}) }));
const anime = { title: 'Anime encontrado', url: 'https://example.com/anime', thumbnailUrl: '', source: 'jkanime' };

beforeEach(() => {
  mocks.search.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useAnimeStore.setState({ activeSource: 'jkanime', searchResults: [], searchSessionsBySource: {}, genres: [], recentSearches: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function ChangeQuery() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/search?q=new')}>Cambiar consulta</button>;
}

describe.each([['desktop', DesktopSearchPage], ['mobile', MobileSearchPage]] as const)('%s search recovery', (_, Page) => {
  it('distinguishes failure from empty results and retries the same filters and page', async () => {
    mocks.search.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ results: [anime], hasNext: false });
    useAnimeStore.setState({ searchResults: [anime] });
    render(<MemoryRouter initialEntries={['/search?q=anime&genre=accion&year=2024&p=3']}><Page /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la búsqueda');
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.queryByText('No se encontraron animes')).not.toBeInTheDocument();
    expect(useAnimeStore.getState().searchResults).toEqual([anime]);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar búsqueda' }));
    expect(await screen.findByRole('button', { name: 'Ver detalles de Anime encontrado' })).toBeInTheDocument();
    expect(mocks.search.mock.calls.at(-1)).toEqual([
      expect.objectContaining({ query: 'anime', genre: 'accion', year: '2024', page: 3 }), 'jkanime',
    ]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not let an older rejected request replace newer results with an error', async () => {
    let rejectOld!: (error: Error) => void;
    mocks.search.mockImplementation(({ query }) => query === 'old'
      ? new Promise((_, reject) => { rejectOld = reject; })
      : Promise.resolve({ results: [anime], hasNext: false }));
    render(<MemoryRouter initialEntries={['/search?q=old']}><ChangeQuery /><Page /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar consulta' }));
    await screen.findByRole('button', { name: 'Ver detalles de Anime encontrado' });
    await act(async () => rejectOld(new Error('late failure')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useAnimeStore.getState().searchResults).toEqual([anime]);
  });

  it('allows keyboard activation of a search result', async () => {
    mocks.search.mockResolvedValue({ results: [anime], hasNext: false });
    render(<MemoryRouter initialEntries={['/search?q=anime']}><Routes>
      <Route path="/search" element={<Page />} />
      <Route path="/details/:url" element={<p>Detalles abiertos</p>} />
    </Routes></MemoryRouter>);
    const card = await screen.findByRole('button', { name: 'Ver detalles de Anime encontrado' });
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Detalles abiertos')).toBeInTheDocument();
  });

  it('invalidates a pending failure as soon as the user edits the query', async () => {
    vi.useFakeTimers();
    let rejectOld!: (error: Error) => void;
    mocks.search.mockImplementation(() => new Promise((_, reject) => { rejectOld = reject; }));
    render(<MemoryRouter initialEntries={['/search?q=old']}><Page /></MemoryRouter>);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar anime por título' }), { target: { value: 'next' } });
    await act(async () => rejectOld(new Error('old search failed during debounce')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useAnimeStore.getState().isSearching).toBe(false);
  });
});

it('clears a mobile search error when navigation removes the query parameters', async () => {
  mocks.search.mockRejectedValue(new Error('offline'));
  function ClearQuery() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/search')}>Salir de la consulta</button>;
  }
  render(<MemoryRouter initialEntries={['/search?q=old']}><ClearQuery /><MobileSearchPage /></MemoryRouter>);
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Salir de la consulta' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Sin resultados')).toBeInTheDocument();
});
