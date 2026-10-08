import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from './PlayerPage';
import { usePlayerStore } from '@/stores/usePlayerStore';

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  mobile: false,
  hlsSupported: false,
  hlsInstances: [] as { emit: (event: string, data?: unknown) => void }[],
  resolve: vi.fn(),
  getServers: vi.fn(),
  getDetails: vi.fn(),
  getProgress: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isMobile: mocks.mobile }) }));
vi.mock('@/stores/useAnimeStore', () => ({ useAnimeStore: () => ({ getCachedDetails: vi.fn(), cacheDetails: vi.fn() }) }));
vi.mock('@/stores/useProfileStore', () => ({ useProfileStore: { getState: () => ({ activeProfile: { id: 'default' } }) } }));
vi.mock('@/stores/useSyncStore', () => ({ useSyncStore: { getState: () => ({ triggerDebouncedSync: vi.fn() }) } }));
vi.mock('@/stores/useSubscriptionStore', () => ({ useSubscriptionStore: () => ({ isVip: false, openModal: vi.fn() }) }));
vi.mock('@/services/animeService', () => ({ resolveStream: mocks.resolve, getServers: mocks.getServers, getDetails: mocks.getDetails }));
vi.mock('@/services/storageService', () => ({
  getAllSettings: () => Promise.resolve(mocks.settings),
  setSetting: (key: string, value: string) => { mocks.settings[key] = value; return Promise.resolve(); },
  getEpisodeProgress: mocks.getProgress,
  upsertHistory: () => Promise.resolve(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: () => Promise.resolve() }));
vi.mock('@/services/downloadService', () => ({
  getLocalMediaUrl: vi.fn(), setKeepScreenOn: vi.fn(),
  setNativeFullscreen: vi.fn(), setNativeScreenOrientation: vi.fn(),
}));
vi.mock('@/utils/hlsLoader', () => ({ rewriteDeadCdnUrl: (url: string) => url, createRobustHlsLoader: () => class {} }));
vi.mock('hls.js', () => {
  class FakeHls {
    static isSupported = () => mocks.hlsSupported;
    static Events = { LEVEL_LOADED: 'level', FRAG_BUFFERED: 'fragment', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = {};
    listeners = new Map<string, ((event: string, data: unknown) => void)[]>();
    constructor() { mocks.hlsInstances.push(this); }
    on(event: string, handler: (event: string, data: unknown) => void) { this.listeners.set(event, [...(this.listeners.get(event) || []), handler]); }
    once(event: string, handler: (event: string, data: unknown) => void) { this.on(event, handler); }
    emit(event: string, data?: unknown) { this.listeners.get(event)?.forEach(handler => handler(event, data)); }
    loadSource() {}
    attachMedia() {}
    destroy() { this.listeners.clear(); }
  }
  return { default: FakeHls };
});

const first = { name: 'Servidor inicial', url: 'https://example.com/first.mp4', isDirect: true };
const second = { name: 'Servidor alternativo', url: 'https://example.com/second.mp4', isDirect: true };
let play: ReturnType<typeof vi.spyOn>;

async function mountPlayer() {
  const view = render(<MemoryRouter><PlayerPage /></MemoryRouter>);
  await act(async () => {});
  const video = view.container.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 1000 });
  Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
  await act(async () => { fireEvent.loadedMetadata(video); fireEvent.canPlay(video); });
  return { ...view, video };
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.settings = {};
  mocks.mobile = false;
  mocks.hlsSupported = false;
  mocks.hlsInstances = [];
  mocks.resolve.mockReset().mockResolvedValue({ directUrl: second.url, mediaType: 'mp4', qualities: [] });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (this: HTMLMediaElement) {
    this.currentTime = 0;
    Object.defineProperty(this, 'readyState', { configurable: true, value: 0 });
  });
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    const wasPlaying = !this.paused;
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    if (wasPlaying) this.dispatchEvent(new Event('pause'));
  });
  usePlayerStore.setState({
    currentAnime: { title: 'Anime de prueba', url: 'https://example.com/anime', source: 'jkanime', episodes: [{ number: 1, url: 'https://example.com/episode', watched: false }], thumbnailUrl: '', synopsis: '', genres: [] },
    currentEpisode: { number: 1, url: 'https://example.com/episode', watched: false },
    servers: [first, second], selectedServer: first,
    resolvedMedia: { directUrl: first.url, mediaType: 'mp4', qualities: [] },
    playbackTime: 0, duration: 0, isResolving: false,
  });
});

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Player interactions', () => {
  it('does not replace a newer episode with a late automatic resolution', async () => {
    const pending = new Map<string, (value: any) => void>();
    mocks.getDetails.mockResolvedValue(usePlayerStore.getState().currentAnime);
    mocks.getServers.mockImplementation(async (url: string) => [{ name: url, url, isDirect: true }]);
    mocks.resolve.mockImplementation((server: { url: string }) => new Promise(resolve => pending.set(server.url, resolve)));
    const anime = usePlayerStore.getState().currentAnime!;
    mocks.getDetails.mockResolvedValue({ ...anime, episodes: [1, 2].map(number => ({ number, url: `https://example.com/ep${number}`, watched: false })) });
    function Navigation() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/player?url=https://example.com/anime&ep=2&source=jkanime')}>Next route</button>;
    }
    render(<MemoryRouter initialEntries={['/player?url=https://example.com/anime&ep=1&source=jkanime']}><Navigation /><PlayerPage /></MemoryRouter>);
    await act(async () => {});
    fireEvent.click(screen.getByText('Next route'));
    await act(async () => {});
    await act(async () => pending.get('https://example.com/ep2')!({ directUrl: 'https://example.com/new.mp4', mediaType: 'mp4', qualities: [] }));
    await act(async () => pending.get('https://example.com/ep1')!({ directUrl: 'https://example.com/old.mp4', mediaType: 'mp4', qualities: [] }));
    expect(usePlayerStore.getState().resolvedMedia?.directUrl).toBe('https://example.com/new.mp4');
  });

  it('releases the native video on unmount', async () => {
    const { video, unmount } = await mountPlayer();
    video.src = 'https://example.com/video.mp4';
    unmount();
    expect(video.paused).toBe(true);
    expect(video.hasAttribute('src')).toBe(false);
  });
  it.each([false, true])('hides casting on Windows even with mobile layout=%s', async mobile => {
    mocks.mobile = mobile;
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    await mountPlayer();
    expect(screen.queryByRole('button', { name: 'Transmitir a Smart TV' })).not.toBeInTheDocument();
  });

  it.each([false, true])('keeps casting on Android with mobile layout=%s', async mobile => {
    mocks.mobile = mobile;
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');
    await mountPlayer();
    expect(screen.getByRole('button', { name: 'Transmitir a Smart TV' })).toBeEnabled();
  });

  it('executes a lower control action once without invoking the video surface action', async () => {
    const { video } = await mountPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar desde controles' }));
    expect(video.paused).toBe(true);
    play.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir desde controles' }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('updates time without notifying the React store while the HUD is hidden', async () => {
    const { video } = await mountPlayer();
    act(() => { vi.advanceTimersByTime(5000); });
    const subscriber = vi.fn();
    const unsubscribe = usePlayerStore.subscribe(subscriber);
    video.currentTime = 24.625;
    fireEvent.timeUpdate(video);
    expect(subscriber).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Pausar video' }));
    expect(usePlayerStore.getState().playbackTime).toBe(24.625);
    unsubscribe();
  });

  it.each([false, true])('toggles playback in one click while controls are hidden (mobile=%s)', async mobile => {
    mocks.mobile = mobile;
    const { video } = await mountPlayer();
    act(() => { vi.advanceTimersByTime(5000); });
    const center = screen.getByRole('button', { name: 'Pausar video' });
    expect(center).toHaveStyle({ opacity: 0 });
    fireEvent.click(center);
    expect(video.paused).toBe(true);
    expect(center).toHaveStyle({ opacity: 1 });
    play.mockClear();
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir video' }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(false);
  });

  it('keeps controls visible when playback is paused', async () => {
    const { video } = await mountPlayer();
    act(() => { video.pause(); });
    const center = screen.getByRole('button', { name: 'Reproducir video' });
    expect(center).toHaveStyle({ opacity: 1 });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(center).toHaveStyle({ opacity: 1 });
  });

  it('toggles controls HUD on single screen background click without pausing', async () => {
    const { container, video } = await mountPlayer();
    const screenSurface = container.firstChild as HTMLElement;
    const center = screen.getByRole('button', { name: 'Pausar video' });

    expect(center).toHaveStyle({ opacity: 1 });
    expect(video.paused).toBe(false);

    // Single click on empty screen area toggles controls after 300ms without pausing
    fireEvent.click(screenSurface, { clientX: 200, clientY: 200 });
    act(() => { vi.advanceTimersByTime(350); });

    expect(center).toHaveStyle({ opacity: 0 });
    expect(video.paused).toBe(false);

    // Another single click restores controls without pausing
    fireEvent.click(screenSurface, { clientX: 200, clientY: 200 });
    act(() => { vi.advanceTimersByTime(350); });

    expect(center).toHaveStyle({ opacity: 1 });
    expect(video.paused).toBe(false);
  });

  it('handles double tap on center to toggle playback on mobile', async () => {
    mocks.mobile = true;
    const { container, video } = await mountPlayer();
    const screenSurface = container.firstChild as HTMLElement;

    // Simulate bounding rect with width 1000
    vi.spyOn(screenSurface, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => {},
    });

    // Double tap in center (x = 500)
    fireEvent.click(screenSurface, { clientX: 500, clientY: 300 });
    fireEvent.click(screenSurface, { clientX: 500, clientY: 300 });

    expect(video.paused).toBe(true);
  });

  it.each([0, 1.25, 67.375])('preserves exact time %s and paused state on a server change', async time => {
    const { video } = await mountPlayer();
    act(() => { video.pause(); video.currentTime = time; });
    play.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar servidor de video' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: second.name })); });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    await act(async () => { fireEvent.loadedMetadata(video); fireEvent.canPlay(video); });
    expect(video.currentTime).toBe(time);
    expect(video.paused).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it('resumes a playing stream at its exact time and ignores stored episode progress', async () => {
    const { video } = await mountPlayer();
    video.currentTime = 39.625;
    mocks.getProgress.mockClear();
    play.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar servidor de video' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: second.name })); });
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    await act(async () => { fireEvent.loadedMetadata(video); fireEvent.canPlay(video); });
    expect(video.currentTime).toBe(39.625);
    expect(video.paused).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
    expect(mocks.getProgress).not.toHaveBeenCalled();
  });

  it('keeps the server menu visible and exposes available entries', async () => {
    mocks.settings.custom_sources = JSON.stringify([{ name: 'Mi catálogo', url: 'https://catalog.example.com', type: 'Anime' }]);
    await mountPlayer();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar servidor de video' })); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect(screen.getByRole('button', { name: /Mi catálogo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar video' })).toHaveStyle({ opacity: 1 });
  });

  it.each([false, true])('restores position before HLS playback and preserves playing=%s', async playing => {
    const { video } = await mountPlayer();
    if (!playing) act(() => video.pause());
    video.currentTime = 17.875;
    play.mockClear();
    mocks.hlsSupported = true;
    mocks.resolve.mockResolvedValue({ directUrl: 'https://example.com/stream.m3u8', mediaType: 'hls', qualities: [] });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Seleccionar servidor de video' })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: second.name })); });
    const hls = mocks.hlsInstances.at(-1)!;
    await act(async () => { hls.emit('level', { details: { totalduration: 1000 } }); hls.emit('fragment'); });
    expect(play).not.toHaveBeenCalled();
    Object.defineProperty(video, 'readyState', { configurable: true, value: 4 });
    await act(async () => { fireEvent.loadedMetadata(video); fireEvent.canPlay(video); hls.emit('manifest'); });
    expect(video.currentTime).toBe(17.875);
    expect(video.paused).toBe(!playing);
    expect(play).toHaveBeenCalledTimes(playing ? 1 : 0);
  });

  it('allows arrow keys and space shortcuts to advance, rewind and toggle play even when a button has focus', async () => {
    const { video } = await mountPlayer();
    video.currentTime = 50;

    // Focus on a button (e.g. Pause/Play button)
    const playPauseBtn = screen.getByRole('button', { name: /Pausar video|Reproducir video/i });
    playPauseBtn.focus();
    expect(document.activeElement).toBe(playPauseBtn);

    // Press ArrowRight directly on focused button to seek +10s
    await act(async () => {
      playPauseBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    expect(video.currentTime).toBe(60);

    // Press ArrowLeft to seek -10s
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    expect(video.currentTime).toBe(50);

    // Press Space to toggle play/pause
    expect(video.paused).toBe(false);
    await act(async () => {
      playPauseBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    expect(video.paused).toBe(true);

    // Press 'k' to toggle play/pause back
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    expect(video.paused).toBe(false);

    // Press 's' to skip intro (+85s)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
      vi.runOnlyPendingTimers();
    });
    expect(video.currentTime).toBe(135);
  });
});
