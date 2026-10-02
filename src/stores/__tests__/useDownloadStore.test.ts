import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { DownloadTask, DownloadProgress } from '@/types';
import { useDownloadStore } from '../useDownloadStore';
import { getAllDownloads, notifyServiceStop, onDownloadCreated, onDownloadProgress } from '@/services/downloadService';

const events = vi.hoisted(() => ({
  created: undefined as ((task: DownloadTask) => void) | undefined,
  progress: undefined as ((progress: DownloadProgress) => void) | undefined,
}));
vi.mock('@/services/downloadService', () => ({
  getAllDownloads: vi.fn(),
  onDownloadCreated: vi.fn(async callback => { events.created = callback; return vi.fn(); }),
  onDownloadProgress: vi.fn(async callback => { events.progress = callback; return vi.fn(); }),
  onDownloadCompleted: vi.fn(async () => vi.fn()),
  onDownloadPaused: vi.fn(async () => vi.fn()),
  pauseDownload: vi.fn(), resumeDownload: vi.fn(), retryDownload: vi.fn(),
  cancelDownload: vi.fn(), deleteDownloadRecord: vi.fn(),
  notifyServiceStart: vi.fn(), notifyServiceUpdate: vi.fn(), notifyServiceStop: vi.fn(),
  notifyDownloadComplete: vi.fn(), formatSpeed: vi.fn(() => '0 KB/s'),
  isActiveStatus: (status: string) => status === 'queued' || status === 'downloading',
}));

function task(id: string, queueOrder: number): DownloadTask {
  return { id, queueOrder, animeTitle: 'Serie', episodeNumber: queueOrder, streamUrl: '', outputPath: '',
    status: 'queued', progress: 0, downloadedBytes: 0, createdAt: '2026-10-02T00:00:00Z' };
}

beforeEach(() => {
  useDownloadStore.getState().cleanup();
  useDownloadStore.setState({ tasks: new Map(), initialized: false });
  vi.clearAllMocks();
  vi.mocked(getAllDownloads).mockResolvedValue([]);
});
afterEach(() => useDownloadStore.getState().cleanup());

describe('download queue store', () => {
  it('disposes a subscription that finishes after cleanup during a StrictMode remount', async () => {
    let finish!: (stop: () => void) => void;
    vi.mocked(onDownloadCreated).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const initializing = useDownloadStore.getState().init();
    useDownloadStore.getState().cleanup();
    const stop = vi.fn();
    finish(stop);
    await initializing;
    expect(stop).toHaveBeenCalledOnce();
    expect(onDownloadProgress).not.toHaveBeenCalled();
    await useDownloadStore.getState().init();
    expect(useDownloadStore.getState().initialized).toBe(true);
    expect(onDownloadProgress).toHaveBeenCalledOnce();
  });
  it('keeps arrival order when backend events and hydration arrive out of order', async () => {
    vi.mocked(getAllDownloads).mockResolvedValue([task('ep4', 4), task('ep3', 3), task('ep2', 2)]);
    await useDownloadStore.getState().init();
    events.created!(task('manual8', 8));
    expect([...useDownloadStore.getState().tasks.keys()]).toEqual(['ep2', 'ep3', 'ep4', 'manual8']);
    vi.mocked(getAllDownloads).mockResolvedValue([task('manual8', 8), task('ep2', 2), task('ep4', 4), task('ep3', 3)]);
    await useDownloadStore.getState().syncWithDb();
    expect([...useDownloadStore.getState().tasks.keys()]).toEqual(['ep2', 'ep3', 'ep4', 'manual8']);
  });

  it('recovers progress for an unknown batch task without stopping the download service', async () => {
    await useDownloadStore.getState().init();
    vi.mocked(getAllDownloads).mockResolvedValue([task('batch2', 2)]);
    events.progress!({ id: 'batch2', status: 'downloading', progress: 17, speedKbps: 90, downloadedBytes: 17, totalBytes: 100 });
    await waitFor(() => expect(useDownloadStore.getState().tasks.get('batch2')?.progress).toBe(17));
    expect(useDownloadStore.getState().tasks.get('batch2')?.status).toBe('downloading');
    expect(notifyServiceStop).not.toHaveBeenCalled();
  });

  it('a manual caller placeholder preserves status and order already supplied by Rust', async () => {
    await useDownloadStore.getState().init();
    events.created!(task('ep2', 2));
    events.created!(task('manual8', 8));
    useDownloadStore.getState().addTask({ ...task('manual8', 8), queueOrder: undefined, status: 'downloading' });
    expect(useDownloadStore.getState().tasks.get('manual8')).toMatchObject({ status: 'queued', queueOrder: 8 });
    expect([...useDownloadStore.getState().tasks.keys()]).toEqual(['ep2', 'manual8']);
  });

  it('a delayed queued snapshot does not erase an error received while refreshing', async () => {
    await useDownloadStore.getState().init();
    events.created!(task('ep2', 2));
    let finish!: (tasks: DownloadTask[]) => void;
    vi.mocked(getAllDownloads).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const refreshing = useDownloadStore.getState().syncWithDb();
    events.progress!({ id: 'ep2', status: 'failed', error: 'Servidor no disponible', progress: 0, downloadedBytes: 0, speedKbps: 0 });
    finish([task('ep2', 2)]);
    await refreshing;
    expect(useDownloadStore.getState().tasks.get('ep2')).toMatchObject({ status: 'failed', error: 'Servidor no disponible' });
  });
});
