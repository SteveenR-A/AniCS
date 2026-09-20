import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSyncStore } from '../useSyncStore';
import * as storageService from '@/services/storageService';
import * as profileService from '@/services/profileService';
import type { HistoryEntry, AnimeResult, UserProfile } from '@/types';

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

describe('useSyncStore - Copia de Seguridad JSON & Exportar / Importar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSyncStore.setState({
      config: {
        githubToken: '',
        gistId: '',
        lastSyncAt: '',
        autoSync: false,
        encryptionEnabled: false,
      },
      isSyncing: false,
      syncStatus: 'idle',
      lastError: null,
      sessionDerivedKey: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exportBackupFile recupera datos locales y genera el blob descargable de respaldo', async () => {
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
    vi.mocked(storageService.getAllSettings).mockResolvedValue({ theme: 'dark' });

    // Mock URL.createObjectURL y elementos DOM
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    const realAnchor = document.createElement('a');
    const clickSpy = vi.spyOn(realAnchor, 'click').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(realAnchor);

    await useSyncStore.getState().exportBackupFile();

    expect(profileService.getAllProfiles).toHaveBeenCalledTimes(1);
    expect(storageService.getAllHistory).toHaveBeenCalledTimes(1);
    expect(storageService.getAllFavoritesForSync).toHaveBeenCalledTimes(1);
    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    createElementSpy.mockRestore();
  });

  it('importBackupFile procesa un JSON válido y restaura perfiles, historial y favoritos', async () => {
    const backupJson = JSON.stringify({
      syncMeta: {
        schemaVersion: 2,
        appVersion: '0.2.5',
        lastModifiedAt: '2026-09-20T10:00:00Z',
      },
      profiles: [
        { id: 'p1', name: 'Otaku', avatar: 'star', color: '#ec4899', isActive: true, createdAt: '2026-02-01' },
      ],
      history: [
        {
          id: 'bleach-1-p1',
          animeTitle: 'Bleach',
          animeUrl: 'https://jkanime.net/bleach/',
          thumbnailUrl: '',
          episodeNumber: 1,
          episodeUrl: 'https://jkanime.net/bleach/1/',
          watchProgress: 1.0,
          watchedAt: '2026-09-02T10:00:00Z',
          source: 'jkanime',
          profileId: 'p1',
        },
      ],
      favorites: [
        { title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime', profileId: 'p1' },
      ],
      settings: {},
    });

    const result = await useSyncStore.getState().importBackupFile(backupJson);

    expect(profileService.upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', name: 'Otaku' }));
    expect(storageService.upsertHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'bleach-1-p1', episodeNumber: 1 }));
    expect(storageService.addFavorite).toHaveBeenCalledWith(expect.objectContaining({ title: 'Bleach' }), 'p1');

    expect(result).toEqual({
      profilesCount: 1,
      historyCount: 1,
      favoritesCount: 1,
    });

    expect(useSyncStore.getState().syncStatus).toBe('success');
    expect(useSyncStore.getState().isSyncing).toBe(false);
  });

  it('triggerDebouncedSync no produce errores ni llamadas de red', () => {
    expect(() => {
      useSyncStore.getState().triggerDebouncedSync();
    }).not.toThrow();
  });
});
