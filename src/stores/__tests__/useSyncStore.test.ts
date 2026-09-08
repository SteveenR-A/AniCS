import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSyncStore } from '../useSyncStore';
import * as storageService from '@/services/storageService';
import * as profileService from '@/services/profileService';
import type { HistoryEntry, AnimeResult, UserProfile, CloudSyncPayload } from '@/types';
import { getDoc, setDoc } from 'firebase/firestore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/services/firebase/firebaseConfig', () => ({
  firestoreDb: {},
  firebaseAuth: {},
  firebaseApp: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('mock_doc_ref'),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/services/firebase/authService', () => ({
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn(),
  registerWithEmail: vi.fn(),
  logoutFirebase: vi.fn(),
  subscribeToAuthChanges: vi.fn().mockReturnValue(() => {}),
  getCurrentFirebaseUser: vi.fn().mockReturnValue({
    uid: 'test_user_uid_123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null,
  }),
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

import { useSubscriptionStore } from '../useSubscriptionStore';

describe('useSyncStore - Firestore Cloud Download & Local Merge Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionStore.getState().setVipStatus(true);
    useSyncStore.setState({
      config: {
        userId: 'test_user_uid_123',
        userEmail: 'test@example.com',
        userDisplayName: 'Test User',
        userPhotoUrl: '',
        lastSyncAt: '',
        autoSync: true,
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

  it('descarga datos de Firestore y los fusiona exitosamente con los datos locales existentes', async () => {
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
    vi.mocked(profileService.getSyncConfig).mockResolvedValue('');

    // 2. Datos remotos en Cloud Firestore
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

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        syncMeta: JSON.stringify(remoteSyncMeta),
        profiles: JSON.stringify(localProfiles),
        history: JSON.stringify(remoteHistory),
        favorites: JSON.stringify(remoteFavorites),
        settings: '{}',
        settingsDesktop: '{}',
        settingsMobile: '{}',
      }),
    } as any);

    vi.mocked(setDoc).mockResolvedValueOnce(undefined as any);

    // 3. Ejecutar sincronización
    await useSyncStore.getState().syncNow();

    // 4. Verificar que se persistió en SQLite la fusión de ambos conjuntos de datos
    expect(storageService.batchUpsertHistory).toHaveBeenCalled();
    const historyCallArg = vi.mocked(storageService.batchUpsertHistory).mock.calls[0][0];
    const animeTitlesInHistory = historyCallArg.map((h) => h.animeTitle).sort();
    expect(animeTitlesInHistory).toEqual(['Naruto', 'One Piece']);

    expect(storageService.batchAddFavorites).toHaveBeenCalled();
    const favoritesCallArg = vi.mocked(storageService.batchAddFavorites).mock.calls[0][0];
    const titlesInFavorites = favoritesCallArg.map((f) => f.title).sort();
    expect(titlesInFavorites).toEqual(['Naruto', 'One Piece']);

    // 5. Verificar que se subió la versión fusionada de vuelta a Firestore
    expect(setDoc).toHaveBeenCalledTimes(1);

    // 6. Estado final exitoso
    expect(useSyncStore.getState().syncStatus).toBe('success');
    expect(useSyncStore.getState().isSyncing).toBe(false);
  });

  it('descarga e importa automáticamente datos de Firestore en un dispositivo nuevo con base de datos local vacía (0 escrituras)', async () => {
    // 1. Base local vacía (instalación limpia)
    vi.mocked(profileService.getAllProfiles).mockResolvedValue([
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
    ]);
    vi.mocked(storageService.getAllHistory).mockResolvedValue([]);
    vi.mocked(storageService.getAllFavoritesForSync).mockResolvedValue([]);
    vi.mocked(profileService.getTombstones).mockResolvedValue([]);
    vi.mocked(storageService.getAllSettings).mockResolvedValue({});
    vi.mocked(profileService.getSyncConfig).mockResolvedValue('');

    // 2. Datos remotos en Firestore
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

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        syncMeta: JSON.stringify({
          schemaVersion: 2,
          appVersion: '0.2.2',
          lastModifiedAt: '2026-09-02T12:00:00Z',
          fileHashes: { profiles: 'h1', history: 'h2', favorites: 'h3', settings: 'h4' },
          deletedFavorites: [],
          deletedProfiles: [],
          deletedHistory: [],
        }),
        profiles: '[]',
        history: JSON.stringify(remoteHistory),
        favorites: JSON.stringify(remoteFavorites),
        settings: '{}',
        settingsDesktop: '{}',
        settingsMobile: '{}',
      }),
    } as any);

    // 3. Ejecutar sincronización en dispositivo nuevo
    await useSyncStore.getState().syncNow();

    // 4. Se importaron los datos a la base local sin llamar a setDoc (0 escrituras en Firestore)
    expect(storageService.batchUpsertHistory).toHaveBeenCalledWith(remoteHistory);
    expect(storageService.batchAddFavorites).toHaveBeenCalledWith(remoteFavorites);
    expect(setDoc).not.toHaveBeenCalled();

    expect(useSyncStore.getState().syncStatus).toBe('success');
  });
});
