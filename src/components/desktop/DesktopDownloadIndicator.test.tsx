import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopDownloadIndicator } from './DesktopDownloadIndicator';
import { useDownloadStore } from '@/stores/useDownloadStore';
import type { DownloadTask } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));
const task = (id: string, values: Partial<DownloadTask> = {}): DownloadTask => ({ id, animeTitle: 'Anime', episodeNumber: 1,
  streamUrl: '', outputPath: '', status: 'downloading', progress: 25, downloadedBytes: 25, totalBytes: 100, speedKbps: 80, ...values });
beforeEach(() => { vi.useFakeTimers(); useDownloadStore.setState({ tasks: new Map() }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<MemoryRouter><DesktopDownloadIndicator /></MemoryRouter>);

it('shows weighted progress and the queue without counting queued bytes', () => {
  useDownloadStore.setState({ tasks: new Map([
    ['a', task('a')], ['b', task('b', { totalBytes: 300, downloadedBytes: 225, progress: 75 })],
    ['q', task('q', { status: 'queued', totalBytes: 1000, downloadedBytes: 0 })],
  ]) });
  show();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '63');
  expect(screen.getByText('160 KB/s · 1 en cola')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Ver descargas' })).toHaveAttribute('href', '/downloads');
});

it('shows an indeterminate circle while waiting for a download to start', () => {
  useDownloadStore.setState({ tasks: new Map([['q', task('q', { status: 'queued', progress: 0 })]]) });
  show();
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.getByText('Descargas en cola')).toBeInTheDocument();
});

it('keeps a completion notice visible when the last download finishes', () => {
  useDownloadStore.setState({ tasks: new Map([['a', task('a')]]) });
  show();
  act(() => useDownloadStore.setState({ tasks: new Map([['a', task('a', { status: 'completed', progress: 100 })]]) }));
  expect(screen.getByRole('status')).toHaveTextContent('Descarga completada');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(6000); });
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('groups batch starts and does not announce old completed records', () => {
  show();
  act(() => {
    useDownloadStore.setState({ tasks: new Map([['old', task('old', { status: 'completed' })]]) });
    useDownloadStore.setState({ tasks: new Map([['a', task('a')], ['b', task('b')]]) });
    vi.advanceTimersByTime(300);
  });
  expect(screen.getByRole('status')).toHaveTextContent('2 descargas añadidas');
  expect(screen.queryByText('Descarga completada')).not.toBeInTheDocument();
});

it('reports download errors and leaves paused downloads accessible', () => {
  useDownloadStore.setState({ tasks: new Map([['a', task('a')], ['p', task('p', { status: 'paused' })]]) });
  show();
  act(() => useDownloadStore.setState({ tasks: new Map([['a', task('a', { status: 'failed', error: 'Sin espacio' })], ['p', task('p', { status: 'paused' })]]) }));
  expect(screen.getByRole('status')).toHaveTextContent('Sin espacio');
  expect(screen.getByText('Descargas en pausa')).toBeInTheDocument();
});
