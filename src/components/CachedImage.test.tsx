import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CachedImage, clearMemoryCache, getCachedImageUrl, resolveImageUrl } from './CachedImage';

const mocks = vi.hoisted(() => ({ cacheImage: vi.fn() }));
vi.mock('@/services/downloadService', () => ({ cacheImage: mocks.cacheImage }));
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (path: string) => `asset://localhost/${path}` }));

let enterViewport: () => void;
beforeEach(() => {
  clearMemoryCache();
  mocks.cacheImage.mockReset().mockResolvedValue('data:image/png;base64,AAAA');
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      enterViewport = () => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('defers both the source URL and IPC until the image approaches the viewport', async () => {
  render(<CachedImage src="https://example.com/poster" alt="Poster" />);
  expect(mocks.cacheImage).not.toHaveBeenCalled();
  expect(screen.getByAltText('Poster')).not.toHaveAttribute('src');
  await act(async () => enterViewport());
  expect(mocks.cacheImage).toHaveBeenCalledTimes(1);
  expect(screen.getByAltText('Poster')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
});

it('loads eager covers immediately and composes consumer load callbacks', async () => {
  const onLoad = vi.fn();
  render(<CachedImage src="https://example.com/hero" alt="Hero" loading="eager" onLoad={onLoad} />);
  await act(async () => {});
  const image = screen.getByAltText('Hero');
  fireEvent.load(image);
  expect(mocks.cacheImage).toHaveBeenCalledTimes(1);
  expect(image).toHaveStyle({ opacity: '1' });
  expect(onLoad).toHaveBeenCalledTimes(1);
});

it('ignores a previous source resolving after the card has changed', async () => {
  const pending = new Map<string, (url: string) => void>();
  mocks.cacheImage.mockImplementation((url: string) => new Promise(resolve => pending.set(url, resolve)));
  const page = render(<CachedImage src="https://example.com/old" alt="Poster" loading="eager" />);
  page.rerender(<CachedImage src="https://example.com/new" alt="Poster" loading="eager" />);
  await act(async () => pending.get('https://example.com/new')!('data:image/png;base64,NEW'));
  await act(async () => pending.get('https://example.com/old')!('data:image/png;base64,OLD'));
  expect(screen.getByAltText('Poster')).toHaveAttribute('src', 'data:image/png;base64,NEW');
});

it('recovers a recycled card after both cached and remote image loads failed', async () => {
  const page = render(<CachedImage src="https://example.com/broken" alt="Poster" loading="eager" />);
  await act(async () => {});
  fireEvent.error(screen.getByAltText('Poster'));
  expect(screen.getByAltText('Poster')).toHaveAttribute('src', 'https://example.com/broken');
  fireEvent.error(screen.getByAltText('Poster'));
  expect(screen.getByRole('img', { name: 'Poster' }).tagName).toBe('SPAN');
  page.rerender(<CachedImage src="https://example.com/valid" alt="Poster" loading="eager" />);
  await act(async () => {});
  expect(screen.getByAltText('Poster')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
});

it('does not refill a cleared cache or remove a newer in-flight request', async () => {
  const pending: ((url: string) => void)[] = [];
  mocks.cacheImage.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  const url = 'https://example.com/poster';
  const old = resolveImageUrl(url);
  expect(resolveImageUrl(url)).toBe(old);
  clearMemoryCache();
  const current = resolveImageUrl(url);
  pending[0]('data:image/png;base64,OLD');
  await old;
  expect(getCachedImageUrl(url)).toBe(url);
  expect(resolveImageUrl(url)).toBe(current);
  pending[1]('data:image/png;base64,NEW');
  await current;
  expect(getCachedImageUrl(url)).toBe('data:image/png;base64,NEW');
});

it('keeps a local cover available without IPC or an observer callback', async () => {
  render(<CachedImage src="/videos/cover.jpg" alt="Local" />);
  expect(screen.getByAltText('Local')).toHaveAttribute('src', 'asset://localhost//videos/cover.jpg');
  expect(mocks.cacheImage).not.toHaveBeenCalled();
});
