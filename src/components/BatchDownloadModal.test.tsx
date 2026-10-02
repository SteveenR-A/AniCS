import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BatchDownloadModal } from './BatchDownloadModal';
import { getBatchDownloadServers, startBatchDownloads } from '@/services/downloadService';
import type { Episode } from '@/types';

const syncWithDb = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/services/downloadService', () => ({
  getBatchDownloadServers: vi.fn(), startBatchDownloads: vi.fn(),
  notifyServiceStart: vi.fn(), MAX_BATCH_EPISODES: 5000,
}));
vi.mock('@/stores/useDownloadStore', () => ({ useDownloadStore: { getState: () => ({ syncWithDb }) } }));
vi.mock('@/stores/useSubscriptionStore', () => ({ useSubscriptionStore: () => ({ isVip: true, openModal: vi.fn() }) }));
vi.mock('@/config/features', () => ({ FEATURE_FLAGS: { SHOW_SUBSCRIPTION: false } }));

function show(episodes: Episode[]) {
  const onClose = vi.fn();
  const onSuccessToast = vi.fn();
  render(<BatchDownloadModal isOpen onClose={onClose} animeTitle="Serie" episodes={episodes} source="jkanime" onSuccessToast={onSuccessToast} />);
  return { onClose, onSuccessToast };
}
function episode(number: number, watched = false): Episode {
  return { number, url: `https://source.test/serie/${number}`, watched, watchProgress: watched ? 1 : 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBatchDownloadServers).mockResolvedValue([
    { key: 'Magi', name: 'Servidor principal' },
    { key: 'Mediafire', name: 'Servidor espejo' },
  ]);
  vi.mocked(startBatchDownloads).mockImplementation(async items => items.map(item => ({ episodeNumber: item.episodeNumber, downloadId: `id${item.episodeNumber}` })));
});
afterEach(cleanup);

describe('BatchDownloadModal', () => {
  it('default No vistos submits in episode order and waits for acceptance before closing', async () => {
    let accept!: (results: { episodeNumber: number; downloadId: string }[]) => void;
    vi.mocked(startBatchDownloads).mockReturnValue(new Promise(resolve => { accept = resolve; }));
    const { onClose } = show([episode(4), episode(3, true), episode(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 2 capítulos' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(startBatchDownloads).toHaveBeenCalledWith([
      expect.objectContaining({ episodeNumber: 2, preferredServer: undefined, allowFallback: true }),
      expect.objectContaining({ episodeNumber: 4 }),
    ]);
    accept([{ episodeNumber: 2, downloadId: 'id2' }, { episodeNumber: 4, downloadId: 'id4' }]);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(syncWithDb).toHaveBeenCalledOnce();
  });

  it('range supports ascending episode lists and sends the original server name with strict selection', async () => {
    show([episode(1), episode(2), episode(3)]);
    fireEvent.click(screen.getByRole('button', { name: 'Por Rango' }));
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[1]).toHaveAttribute('max', '3');
    fireEvent.change(inputs[0], { target: { value: '2' } });
    await screen.findByRole('option', { name: 'Servidor espejo' });
    fireEvent.change(screen.getByLabelText('Servidor de descarga'), { target: { value: 'Mediafire' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 2 capítulos' }));
    await waitFor(() => expect(startBatchDownloads).toHaveBeenCalledWith([
      expect.objectContaining({ episodeNumber: 2, preferredServer: 'Mediafire', allowFallback: false, episodeUrl: 'https://source.test/serie/2' }),
      expect.objectContaining({ episodeNumber: 3, preferredServer: 'Mediafire' }),
    ]));
  });

  it('manual selection uses the same server policy', async () => {
    show([episode(1), episode(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Manual (0)' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    await screen.findByRole('option', { name: 'Servidor principal' });
    fireEvent.change(screen.getByLabelText('Servidor de descarga'), { target: { value: 'Magi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 1 capítulo' }));
    await waitFor(() => expect(startBatchDownloads).toHaveBeenCalledWith([
      expect.objectContaining({ episodeNumber: 2, preferredServer: 'Magi', allowFallback: true }),
    ]));
  });

  it('keeps the dialog open and displays the actual backend rejection', async () => {
    vi.mocked(startBatchDownloads).mockRejectedValue('No hay espacio disponible');
    const { onClose } = show([episode(1)]);
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 1 capítulo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay espacio disponible');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Encolar 1 capítulo' })).toBeEnabled();
  });

  it('accepts more than 200 unseen episodes in a single submission', async () => {
    show(Array.from({ length: 201 }, (_, index) => episode(index + 1)));
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 201 capítulos' }));
    await waitFor(() => expect(startBatchDownloads).toHaveBeenCalledOnce());
    expect(vi.mocked(startBatchDownloads).mock.calls[0][0]).toHaveLength(201);
  });

  it('retains the dialog when every episode is rejected and reports individual errors', async () => {
    vi.mocked(startBatchDownloads).mockResolvedValue([
      { episodeNumber: 1, error: 'Fuente desconocida' },
      { episodeNumber: 2, error: 'Carpeta sin permisos' },
    ]);
    const { onClose } = show([episode(1), episode(2)]);
    fireEvent.click(screen.getByRole('button', { name: 'Encolar 2 capítulos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ep. 1: Fuente desconocida · Ep. 2: Carpeta sin permisos');
    expect(onClose).not.toHaveBeenCalled();
  });
});
