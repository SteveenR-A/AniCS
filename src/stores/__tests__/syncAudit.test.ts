import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSyncStore } from '../useSyncStore';
import { computePayloadHashes } from '@/services/syncService';

const mock = vi.hoisted(() => ({
  favorites: [] as any[], tombstones: [] as any[], remote: {} as any,
  config: {} as Record<string, string>, added: vi.fn(), saved: vi.fn(),
}));
const profile = { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#fff', isActive: true, createdAt: '2026-01-01' };
const favorite = { title: 'Anime', url: 'https://example.com/anime', source: 'jkanime', thumbnailUrl: '', profileId: 'default' };
vi.mock('@/services/firebase/firebaseConfig', () => ({ firestoreDb: {} }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => mock.remote }), setDoc: (...args: any[]) => mock.saved(...args) }));
vi.mock('@/services/firebase/authService', () => ({}));
vi.mock('@/services/firebase/analyticsService', () => ({ AniCSAnalytics: { logSyncSuccess: vi.fn(), logSyncError: vi.fn() } }));
vi.mock('@/stores/useProfileStore', () => ({ useProfileStore: { getState: () => ({ loadProfiles: async () => {} }) } }));
vi.mock('@/services/cryptoService', () => ({
  computeSha256: async (text: string) => text,
  encryptText: async (text: string) => `encrypted:${text}`,
  decryptText: async () => { throw new Error('not encrypted'); },
  generateRandomSalt: () => new Uint8Array(16), uint8ArrayToBase64: () => 'salt',
  base64ToUint8Array: () => new Uint8Array(16), deriveKeyFromPin: async () => ({}),
}));
vi.mock('@/services/profileService', () => ({
  getAllProfiles: async () => [profile], getTombstones: async () => mock.tombstones,
  getSyncConfig: async (key: string) => mock.config[key] || '',
  setSyncConfig: async (key: string, value: string) => { mock.config[key] = value; },
  getSecureSecret: async () => '', saveSecureSecret: async () => {}, deleteSecureSecret: async () => {},
  cleanupOldTombstones: async () => {}, upsertProfile: async () => {}, deleteProfile: async () => {},
}));
vi.mock('@/services/storageService', () => ({
  getAllHistory: async () => [], getAllFavoritesForSync: async () => mock.favorites,
  getAllSettings: async () => ({}), setSetting: async () => {}, batchUpsertHistory: async () => {},
  batchAddFavorites: (...args: any[]) => mock.added(...args), removeFavorite: async () => {},
  normalizeAnimeTitleKey: (text: string) => text.toLowerCase(),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mock.favorites = [favorite]; mock.tombstones = []; mock.config = {};
  const hashes = await computePayloadHashes({ profiles: [profile], history: [], favorites: [favorite], settings: {} });
  mock.config.last_synced_hashes = JSON.stringify(hashes);
  mock.remote = { syncMeta: JSON.stringify({ schemaVersion: 2, fileHashes: hashes, deletedFavorites: [], deletedProfiles: [], deletedHistory: [] }), profiles: JSON.stringify([profile]), history: '[]', favorites: JSON.stringify([favorite]), settings: '{}' };
  useSyncStore.setState({ config: { userId: 'test', autoSync: false, encryptionEnabled: false, lastSyncAt: '' }, sessionDerivedKey: null, isSyncing: false });
});

describe('audit sync regressions', () => {
  it('uploads ciphertext when encryption is enabled without content changes', async () => {
    await useSyncStore.getState().enableEncryption('1234');
    expect(mock.saved).toHaveBeenCalledOnce();
    expect(mock.saved.mock.calls[0][1].favorites).toMatch(/^encrypted:/);
  });

  it('propagates deletion of the last favorite instead of restoring it', async () => {
    mock.favorites = [];
    mock.tombstones = [{ entityType: 'favorite', entityId: favorite.url, profileId: 'default', deletedAt: new Date().toISOString() }];
    await useSyncStore.getState().syncNow();
    expect(mock.added).not.toHaveBeenCalledWith([favorite]);
    expect(mock.saved).toHaveBeenCalledOnce();
    expect(JSON.parse(mock.saved.mock.calls[0][1].favorites)).toEqual([]);
  });
});
