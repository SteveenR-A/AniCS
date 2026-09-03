import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSyncStore } from '../useSyncStore';
import * as storageService from '@/services/storageService';
import * as profileService from '@/services/profileService';
import type { HistoryEntry, AnimeResult, UserProfile, GistFilesPayload } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/services/profileService', async (importOriginal) => {
  const actual = await importOriginal<typeof profileService>();
  return {
    ...actual,
    saveSecureSecret: vi.fn().mockResolvedValue(undefined),
    getSecureSecret: vi.fn().mockResolvedValue(''),
    deleteSecureSecret: vi.fn().mockResolvedValue(undefined),
    getSyncConfig: vi.fn().mockResolvedValue(''),
    setSyncConfig: vi.fn().mockResolvedValue(undefined),
    getAllSyncConfig: vi.fn().mockResolvedValue({}),
    getAllProfiles: vi.fn().mockResolvedValue([]),
    getActiveProfile: vi.fn().mockResolvedValue({ id: 'default', name: 'Principal' }),
    upsertProfile: vi.fn().mockResolvedValue(undefined),
    getTombstones: vi.fn().mockResolvedValue([]),
    cleanupOldTombstones: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/services/storageService', async (importOriginal) => {
  const actual = await importOriginal<typeof storageService>();
  return {
    ...actual,
    getAllHistory: vi.fn().mockResolvedValue([]),
    getAllFavoritesForSync: vi.fn().mockResolvedValue([]),
    getAllSettings: vi.fn().mockResolvedValue({}),
    upsertHistory: vi.fn().mockResolvedValue(undefined),
    batchUpsertHistory: vi.fn().mockResolvedValue(undefined),
    removeHistoryBatch: vi.fn().mockResolvedValue(undefined),
    addFavorite: vi.fn().mockResolvedValue(undefined),
    batchAddFavorites: vi.fn().mockResolvedValue(undefined),
    removeFavorite: vi.fn().mockResolvedValue(undefined),
  };
});

describe('useSyncStore - Gist Download & Local Merge Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({
      config: {
        githubToken: 'ghp_test_token_123',
        gistId: 'test_gist_id_456',
        lastEtag: '',
        lastSyncAt: '',
        autoSync: true,
        encryptionEnabled: false,
        gistUrl: 'https://gist.github.com/test_gist_id_456',
      },
      isSyncing: false,
      syncStatus: 'idle',
      lastError: null,
      sessionDerivedKey: null,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('descarga datos del Gist remoto y los fusiona exitosamente con los datos locales existentes', async () => {
    // 1. Datos locales en este dispositivo (ej. vio Naruto episodio 1)
    const localProfiles: UserProfile[] = [
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
    ];
    const localHistory: HistoryEntry[] = [
      {
        id: 'naruto-1-default',
        animeTitle: 'Naruto',
        animeUrl: 'https://jkanime.net/naruto/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/naruto/1/',
        watchProgress: 0.5,
        watchedAt: '2026-09-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];
    const localFavorites: AnimeResult[] = [
      { title: 'Naruto', url: 'https://jkanime.net/naruto/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' },
    ];

    vi.mocked(profileService.getAllProfiles).mockResolvedValue(localProfiles);
    vi.mocked(storageService.getAllHistory).mockResolvedValue(localHistory);
    vi.mocked(storageService.getAllFavoritesForSync).mockResolvedValue(localFavorites);
    vi.mocked(profileService.getTombstones).mockResolvedValue([]);
    vi.mocked(storageService.getAllSettings).mockResolvedValue({});
    vi.mocked(profileService.getSyncConfig).mockResolvedValue(''); // Primer sync, sin hashes previos

    // 2. Datos remotos en GitHub Gist (subidos previamente desde otro dispositivo, ej. One Piece ep 100)
    const remoteSyncMeta = {
      schemaVersion: 2,
      appVersion: '0.2.2',
      lastModifiedAt: '2026-09-02T12:00:00Z',
      lastModifiedDevice: 'android',
      fileHashes: { profiles: 'h1', history: 'h2', favorites: 'h3', settings: 'h4' },
      deletedFavorites: [],
      deletedProfiles: [],
      deletedHistory: [],
    };
    const remoteHistory = [
      {
        id: 'onepiece-100-default',
        animeTitle: 'One Piece',
        animeUrl: 'https://jkanime.net/one-piece/',
        thumbnailUrl: '',
        episodeNumber: 100,
        episodeUrl: 'https://jkanime.net/one-piece/100/',
        watchProgress: 0.9,
        watchedAt: '2026-09-02T11:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];
    const remoteFavorites = [
      { title: 'One Piece', url: 'https://jkanime.net/one-piece/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' },
    ];

    const mockGistResponse = {
      id: 'test_gist_id_456',
      description: 'AniCS Cloud Sync (Secret)',
      files: {
        'sync_meta.json': { content: JSON.stringify(remoteSyncMeta), truncated: false },
        'profiles.json': { content: JSON.stringify(localProfiles), truncated: false },
        'history.json': { content: JSON.stringify(remoteHistory), truncated: false },
        'favorites.json': { content: JSON.stringify(remoteFavorites), truncated: false },
        'settings.json': { content: '{}', truncated: false },
      },
    };

    // Mock de fetch para simular GitHub API: GET Gist -> 200, PATCH Gist -> 200
    let uploadedPayloadBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({
            ETag: 'W/"etag-remote-123"',
            date: 'Wed, 02 Sep 2026 12:05:00 GMT',
          }),
          json: async () => mockGistResponse,
        });
      }
      if (method === 'PATCH') {
        if (init?.body) {
          uploadedPayloadBody = JSON.parse(init.body as string);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({
            ETag: 'W/"etag-merged-789"',
            date: 'Wed, 02 Sep 2026 12:06:00 GMT',
          }),
          json: async () => ({ id: 'test_gist_id_456', html_url: 'https://gist.github.com/test_gist_id_456' }),
        });
      }
      return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
    });

    // 3. Ejecutar sincronización
    await useSyncStore.getState().syncNow();

    // 4. Verificar que se persistió en SQLite la fusión de ambos conjuntos de datos
    expect(storageService.batchUpsertHistory).toHaveBeenCalled();
    const historyCallArg = vi.mocked(storageService.batchUpsertHistory).mock.calls[0][0];
    const animeTitlesInHistory = historyCallArg.map(h => h.animeTitle).sort();
    expect(animeTitlesInHistory).toEqual(['Naruto', 'One Piece']);

    expect(storageService.batchAddFavorites).toHaveBeenCalled();
    const favoritesCallArg = vi.mocked(storageService.batchAddFavorites).mock.calls[0][0];
    const titlesInFavorites = favoritesCallArg.map(f => f.title).sort();
    expect(titlesInFavorites).toEqual(['Naruto', 'One Piece']);

    // 5. Verificar que se subió la versión fusionada de vuelta a GitHub para que ambos dispositivos queden actualizados
    expect(uploadedPayloadBody).not.toBeNull();
    const uploadedHistory = JSON.parse(uploadedPayloadBody.files['history.json'].content);
    expect(uploadedHistory.map((h: any) => h.animeTitle).sort()).toEqual(['Naruto', 'One Piece']);

    // 6. Estado final exitoso
    expect(useSyncStore.getState().syncStatus).toBe('success');
    expect(useSyncStore.getState().isSyncing).toBe(false);
  });

  it('descarga e importa automáticamente datos del Gist en un dispositivo nuevo con base de datos local vacía (0 escrituras en GitHub)', async () => {
    // 1. Base local vacía (instalación limpia)
    vi.mocked(profileService.getAllProfiles).mockResolvedValue([
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
    ]);
    vi.mocked(storageService.getAllHistory).mockResolvedValue([]);
    vi.mocked(storageService.getAllFavoritesForSync).mockResolvedValue([]);
    vi.mocked(profileService.getTombstones).mockResolvedValue([]);
    vi.mocked(storageService.getAllSettings).mockResolvedValue({});
    vi.mocked(profileService.getSyncConfig).mockResolvedValue('');

    // 2. Datos remotos en GitHub Gist
    const remoteHistory = [
      {
        id: 'bleach-1-default',
        animeTitle: 'Bleach',
        animeUrl: 'https://jkanime.net/bleach/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/bleach/1/',
        watchProgress: 1.0,
        watchedAt: '2026-09-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];
    const remoteFavorites = [
      { title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' },
    ];

    const mockGistResponse = {
      id: 'test_gist_id_456',
      description: 'AniCS Cloud Sync (Secret)',
      files: {
        'sync_meta.json': {
          content: JSON.stringify({
            schemaVersion: 2,
            appVersion: '0.2.2',
            lastModifiedAt: '2026-09-02T12:00:00Z',
            fileHashes: { profiles: 'h1', history: 'h2', favorites: 'h3', settings: 'h4' },
            deletedFavorites: [],
            deletedProfiles: [],
            deletedHistory: [],
          }),
          truncated: false,
        },
        'profiles.json': { content: '[]', truncated: false },
        'history.json': { content: JSON.stringify(remoteHistory), truncated: false },
        'favorites.json': { content: JSON.stringify(remoteFavorites), truncated: false },
        'settings.json': { content: '{}', truncated: false },
      },
    };

    let patchCalled = false;
    globalThis.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: 'W/"etag-remote-fresh"' }),
          json: async () => mockGistResponse,
        });
      }
      if (method === 'PATCH') {
        patchCalled = true;
        return Promise.resolve({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) });
      }
      return Promise.reject(new Error('Unhandled'));
    });

    // 3. Ejecutar sincronización en dispositivo nuevo
    await useSyncStore.getState().syncNow();

    // 4. Se importaron los datos a la base local sin hacer PATCH a GitHub
    expect(storageService.batchUpsertHistory).toHaveBeenCalledWith(remoteHistory);
    expect(storageService.batchAddFavorites).toHaveBeenCalledWith(remoteFavorites);
    expect(patchCalled).toBe(false); // 0 escrituras, optimización de cuota GitHub

    expect(useSyncStore.getState().syncStatus).toBe('success');
  });
});
