import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mergeHistoryEntries,
  mergeHistoryWithTombstones,
  mergeFavoritesWithTombstones,
  mergeProfiles,
  mergeSyncData,
  migratePayload,
  SyncSchemaError,
  CURRENT_SCHEMA_VERSION,
  computePayloadHashes,
  areHashesEqual,
  isLocalDataEmpty,
  setServerClockSkew,
  getCalibratedTimestamp,
  makeHistoryCanonicalKey,
  MAX_CLOUD_HISTORY_ENTRIES,
  fetchGistData,
  createOrUpdateGist,
  NeedPinForDecryptionError,
  isLocalFileHistory,
} from '../syncService';
import type { HistoryEntry, AnimeResult, UserProfile, GistFilesPayload, HistoryTombstone, GistSyncConfig } from '@/types';

describe('syncService - Merge Engine & Migrations', () => {
  it('preserva múltiples episodios vistos de un mismo anime', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Solo Leveling',
        animeUrl: 'https://jkanime.net/solo-leveling/',
        thumbnailUrl: '',
        episodeNumber: 3,
        episodeUrl: 'https://jkanime.net/solo-leveling/3/',
        watchProgress: 0.9,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const remote: HistoryEntry[] = [
      {
        id: '2',
        animeTitle: 'Solo Leveling',
        animeUrl: 'https://jkanime.net/solo-leveling/',
        thumbnailUrl: '',
        episodeNumber: 5,
        episodeUrl: 'https://jkanime.net/solo-leveling/5/',
        watchProgress: 0.2,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(2);
    expect(merged.map(m => m.episodeNumber).sort()).toEqual([3, 5]);
  });

  it('resuelve conflictos con prioridad estricta en watchedAt más reciente (la última sesión gana siempre)', () => {
    // Escenario: el usuario vio hasta el 85% ayer en el celular, y reinició el episodio hoy en PC al 15%
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.85,
        watchedAt: '2026-08-01T10:00:00Z', // Más antiguo
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const remote: HistoryEntry[] = [
      {
        id: '2',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.15,
        watchedAt: '2026-08-02T10:00:00Z', // Más reciente: gana
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(1);
    expect(merged[0].watchedAt).toBe('2026-08-02T10:00:00Z');
    expect(merged[0].watchProgress).toBe(0.15);
  });

  it('usa watchProgress como desempate únicamente si watchedAt es exactamente igual', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.4,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const remote: HistoryEntry[] = [
      {
        id: '2',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.75,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(1);
    expect(merged[0].watchProgress).toBe(0.75);
  });

  it('aplica lápidas de episodio individual, serie completa y borrado total de perfil', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Ganzo! Bandori-chan',
        animeUrl: 'https://jkanime.net/ganzo-bandori-chan/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/ganzo-bandori-chan/1/',
        watchProgress: 0.5,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
      {
        id: '2',
        animeTitle: 'Naruto Shippuden',
        animeUrl: 'https://jkanime.net/naruto-shippuden/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/naruto-shippuden/1/',
        watchProgress: 0.5,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
      {
        id: '3',
        animeTitle: 'One Piece',
        animeUrl: 'https://jkanime.net/one-piece/',
        thumbnailUrl: '',
        episodeNumber: 100,
        episodeUrl: 'https://jkanime.net/one-piece/100/',
        watchProgress: 0.9,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'hermano',
      },
    ];

    const tombstones: HistoryTombstone[] = [
      // 1. Borrar episodio específico de Bandori
      {
        type: 'episode',
        key: makeHistoryCanonicalKey(local[0]),
        profileId: 'default',
        deletedAt: '2026-08-02T10:00:00Z',
      },
      // 2. Borrar serie completa de Naruto
      {
        type: 'anime',
        key: 'narutoshippuden::default',
        profileId: 'default',
        deletedAt: '2026-08-02T10:00:00Z',
      },
      // 3. Borrado total del perfil 'hermano'
      {
        type: 'clear',
        key: 'hermano',
        profileId: 'hermano',
        deletedAt: '2026-08-02T10:00:00Z',
      },
    ];

    const merged = mergeHistoryWithTombstones(local, [], tombstones);
    expect(merged.length).toBe(0);
  });

  it('permite re-visualización si watchedAt es posterior a la lápida', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Bleach',
        animeUrl: 'https://jkanime.net/bleach/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/bleach/1/',
        watchProgress: 0.2,
        watchedAt: '2026-08-05T10:00:00Z', // Posterior al borrado
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const tombstones: HistoryTombstone[] = [
      {
        type: 'episode',
        key: makeHistoryCanonicalKey(local[0]),
        profileId: 'default',
        deletedAt: '2026-08-02T10:00:00Z', // Borrado previo
      },
    ];

    const merged = mergeHistoryWithTombstones(local, [], tombstones);
    expect(merged.length).toBe(1);
    expect(merged[0].animeTitle).toBe('Bleach');
  });

  it('unifica títulos con caracteres especiales y corruptos (deduplicación canónica)', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Ganzo  Bandori-chan', // Doble espacio
        animeUrl: 'C:/Videos/Ganzo Bandori-chan/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'C:/Videos/Ganzo Bandori-chan/ep1.mp4',
        watchProgress: 0.5,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'local',
        profileId: 'default',
      },
    ];

    const remote: HistoryEntry[] = [
      {
        id: '2',
        animeTitle: 'Ganzo! Bandori-chan', // Signo de exclamación
        animeUrl: 'https://jkanime.net/ganzo-bandori-chan/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/ganzo-bandori-chan/1/',
        watchProgress: 0.8,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    // Deben fusionarse en 1 sola entrada canonical
    expect(merged.length).toBe(1);
    expect(merged[0].episodeNumber).toBe(1);
    expect(merged[0].watchedAt).toBe('2026-08-02T10:00:00Z');
  });

  it('migra payload de schema v1 a v2 deduplicando y limpiando títulos en Gist', () => {
    const v1Payload = {
      syncMeta: {
        schemaVersion: 1,
        appVersion: '0.1.8',
        lastModifiedAt: '2026-08-01T10:00:00Z',
        lastModifiedDevice: 'windows',
        deletedFavorites: [],
        deletedProfiles: [],
      },
      history: [
        {
          id: '1',
          animeTitle: 'Otome Kaijuu Caraméliser',
          animeUrl: 'https://jkanime.net/otome-kaijuu-carameliser/',
          thumbnailUrl: '',
          episodeNumber: 1,
          episodeUrl: 'https://jkanime.net/otome-kaijuu-carameliser/1/',
          watchProgress: 0.3,
          watchedAt: '2026-08-01T10:00:00Z',
          source: 'jkanime',
          profileId: 'default',
        },
        {
          id: '2',
          animeTitle: 'Otome Kaijuu Caram\uFFFDliser', // Corrupto \uFFFD
          animeUrl: 'C:/Anime/Otome Kaijuu/',
          thumbnailUrl: '',
          episodeNumber: 1,
          episodeUrl: 'C:/Anime/Otome Kaijuu/ep1.mp4',
          watchProgress: 0.9,
          watchedAt: '2026-08-02T10:00:00Z',
          source: 'local',
          profileId: 'default',
        },
      ],
      profiles: [],
      favorites: [],
      settings: {},
    };

    const migrated = migratePayload(v1Payload);
    expect(migrated.syncMeta.schemaVersion).toBe(2);
    expect(migrated.syncMeta.deletedHistory).toEqual([]);
    // Ambos episodios 1 deben haberse unificado y limpiado
    expect(migrated.history.length).toBe(1);
    expect(migrated.history[0].watchProgress).toBe(0.9);
    expect(migrated.history[0].animeTitle).not.toContain('\uFFFD');
  });

  it('calibra el reloj ante desviación de tiempo con el servidor', () => {
    const serverDate = new Date(Date.now() + 120_000).toUTCString(); // 2 minutos adelante
    const skew = setServerClockSkew(serverDate);
    expect(Math.abs(skew - 120_000)).toBeLessThan(1000);

    const timestamp = getCalibratedTimestamp();
    const tsTime = new Date(timestamp).getTime();
    expect(tsTime).toBeGreaterThan(Date.now() + 100_000);
  });

  it('mantiene historiales separados para diferentes perfiles del mismo episodio', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Naruto',
        animeUrl: 'https://jkanime.net/naruto/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/naruto/1/',
        watchProgress: 0.9,
        watchedAt: '2026-08-01T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const remote: HistoryEntry[] = [
      {
        id: '2',
        animeTitle: 'Naruto',
        animeUrl: 'https://jkanime.net/naruto/',
        thumbnailUrl: '',
        episodeNumber: 1,
        episodeUrl: 'https://jkanime.net/naruto/1/',
        watchProgress: 0.5,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'hermano_id',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(2);
    expect(merged.find(m => m.profileId === 'default')?.watchProgress).toBe(0.9);
    expect(merged.find(m => m.profileId === 'hermano_id')?.watchProgress).toBe(0.5);
  });

  it('resuelve favoritos respetando tombstones de eliminación', () => {
    const local: AnimeResult[] = [
      { title: 'One Piece', url: 'https://jkanime.net/one-piece/', thumbnailUrl: '', source: 'jkanime' },
      { title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' },
    ];

    const remote: AnimeResult[] = [
      { title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' },
      { title: 'Naruto', url: 'https://jkanime.net/naruto/', thumbnailUrl: '', source: 'jkanime' },
    ];

    // One Piece fue eliminado en otro dispositivo
    const tombstones = [
      { url: 'https://jkanime.net/one-piece/', profileId: 'default', deletedAt: '2026-08-10T12:00:00Z' },
    ];

    const merged = mergeFavoritesWithTombstones(local, remote, tombstones);
    expect(merged.map(m => m.title).sort()).toEqual(['Bleach', 'Naruto']);
    expect(merged.find(m => m.title === 'One Piece')).toBeUndefined();
  });

  it('unifica perfiles manteniendo el activo local', () => {
    const local: UserProfile[] = [
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
    ];

    const remote: UserProfile[] = [
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
      { id: 'p2', name: 'Hermano', avatar: 'swords', color: '#ef4444', isActive: true, createdAt: '2026-02-01' },
    ];

    const merged = mergeProfiles(local, remote);
    expect(merged.length).toBe(2);
    expect(merged.find(p => p.id === 'default')?.isActive).toBe(true);
    expect(merged.find(p => p.id === 'p2')?.isActive).toBe(false);
  });

  it('rechaza schemas más recientes que la versión actual de la app', () => {
    const futurePayload = {
      syncMeta: {
        schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      },
    };

    expect(() => migratePayload(futurePayload)).toThrow(SyncSchemaError);
  });
});

describe('syncService - Deterministic Hashes & Change Detection', () => {
  it('calcula hashes deterministas para el mismo contenido', async () => {
    const data1 = {
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [],
      favorites: [{ title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' }],
      settings: { theme: 'dark' },
    };

    const data2 = {
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [],
      favorites: [{ title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' }],
      settings: { theme: 'dark' },
    };

    const hash1 = await computePayloadHashes(data1);
    const hash2 = await computePayloadHashes(data2);

    expect(hash1.profiles).toBe(hash2.profiles);
    expect(hash1.favorites).toBe(hash2.favorites);
    expect(hash1.history).toBe(hash2.history);
    expect(hash1.settings).toBe(hash2.settings);
    expect(areHashesEqual(hash1, hash2)).toBe(true);
  });

  it('detecta diferencias en los hashes al modificar favoritos o historial', async () => {
    const data1 = {
      profiles: [],
      history: [],
      favorites: [{ title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' }],
      settings: {},
    };

    const data2 = {
      profiles: [],
      history: [],
      favorites: [{ title: 'One Piece', url: 'https://jkanime.net/one-piece/', thumbnailUrl: '', source: 'jkanime' }],
      settings: {},
    };

    const hash1 = await computePayloadHashes(data1);
    const hash2 = await computePayloadHashes(data2);

    expect(hash1.favorites).not.toBe(hash2.favorites);
    expect(areHashesEqual(hash1, hash2)).toBe(false);
  });

  it('identifica correctamente si una base de datos local está vacía', () => {
    expect(isLocalDataEmpty({
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [],
      favorites: [],
    })).toBe(true);

    expect(isLocalDataEmpty({
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [],
      favorites: [{ title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime' }],
    })).toBe(false);
  });
});

describe('syncService - GitHub Gist Client & Multi-device Sync', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockConfig: GistSyncConfig = {
    githubToken: 'ghp_test12345',
    gistId: 'gist_12345',
    autoSync: true,
    encryptionEnabled: false,
    lastSyncAt: '',
  };

  it('descarga correctamente el payload de GitHub Gist', async () => {
    const mockSyncMeta = {
      schemaVersion: 2,
      appVersion: '0.2.2',
      lastModifiedAt: '2026-09-02T12:00:00Z',
      lastModifiedDevice: 'windows',
      fileHashes: { profiles: 'h1', history: 'h2', favorites: 'h3', settings: 'h4' },
      deletedFavorites: [],
      deletedProfiles: [],
      deletedHistory: [],
    };

    const mockProfiles = [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }];
    const mockHistory = [{
      id: 'bleach-1-default',
      animeTitle: 'Bleach',
      animeUrl: 'https://jkanime.net/bleach/',
      thumbnailUrl: '',
      episodeNumber: 1,
      episodeUrl: 'https://jkanime.net/bleach/1/',
      watchProgress: 0.9,
      watchedAt: '2026-09-02T10:00:00Z',
      source: 'jkanime',
      profileId: 'default',
    }];
    const mockFavorites = [{ title: 'Bleach', url: 'https://jkanime.net/bleach/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' }];
    const mockSettings = { theme: 'dark' };

    const mockGistResponse = {
      files: {
        'sync_meta.json': { content: JSON.stringify(mockSyncMeta) },
        'profiles.json': { content: JSON.stringify(mockProfiles) },
        'history.json': { content: JSON.stringify(mockHistory) },
        'favorites.json': { content: JSON.stringify(mockFavorites) },
        'settings.json': { content: JSON.stringify(mockSettings) },
        'settings_desktop.json': { content: JSON.stringify(mockSettings) },
        'settings_mobile.json': { content: '{}' },
      },
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'etag' ? '"etag-123"' : null) },
      json: () => Promise.resolve(mockGistResponse),
      text: () => Promise.resolve(''),
    } as any));

    const result = await fetchGistData(mockConfig);

    expect(result.notModified).toBe(false);
    expect(result.payload).not.toBeNull();
    expect(result.payload?.history.length).toBe(1);
    expect(result.payload?.history[0].animeTitle).toBe('Bleach');
    expect(result.payload?.favorites.length).toBe(1);
    expect(result.payload?.profiles.length).toBe(1);
    expect(result.etag).toBe('"etag-123"');
  });

  it('retorna notModified cuando el Gist responde 304 Not Modified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 304,
      headers: { get: () => null },
      text: () => Promise.resolve(''),
    } as any));

    const result = await fetchGistData(mockConfig);
    expect(result.notModified).toBe(true);
    expect(result.payload).toBeNull();
  });

  it('fusiona sincronización correctamente cuando dos dispositivos en la misma cuenta tienen episodios distintos', () => {
    const pcData: GistFilesPayload = {
      syncMeta: {
        schemaVersion: 2,
        appVersion: '0.2.2',
        lastModifiedAt: '2026-09-02T10:00:00Z',
        lastModifiedDevice: 'windows',
        fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
        deletedFavorites: [],
        deletedProfiles: [],
        deletedHistory: [],
      },
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [
        {
          id: 'naruto-1-default',
          animeTitle: 'Naruto',
          animeUrl: 'https://jkanime.net/naruto/',
          thumbnailUrl: '',
          episodeNumber: 1,
          episodeUrl: 'https://jkanime.net/naruto/1/',
          watchProgress: 1.0,
          watchedAt: '2026-09-01T10:00:00Z',
          source: 'jkanime',
          profileId: 'default',
        },
      ],
      favorites: [{ title: 'Naruto', url: 'https://jkanime.net/naruto/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' }],
      settings: { theme: 'dark' },
    };

    const androidData: GistFilesPayload = {
      syncMeta: {
        schemaVersion: 2,
        appVersion: '0.2.2',
        lastModifiedAt: '2026-09-02T11:00:00Z',
        lastModifiedDevice: 'android',
        fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
        deletedFavorites: [],
        deletedProfiles: [],
        deletedHistory: [],
      },
      profiles: [{ id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' }],
      history: [
        {
          id: 'onepiece-100-default',
          animeTitle: 'One Piece',
          animeUrl: 'https://jkanime.net/one-piece/',
          thumbnailUrl: '',
          episodeNumber: 100,
          episodeUrl: 'https://jkanime.net/one-piece/100/',
          watchProgress: 0.8,
          watchedAt: '2026-09-02T11:00:00Z',
          source: 'jkanime',
          profileId: 'default',
        },
      ],
      favorites: [{ title: 'One Piece', url: 'https://jkanime.net/one-piece/', thumbnailUrl: '', source: 'jkanime', profileId: 'default' }],
      settings: { theme: 'dark' },
    };

    const merged = mergeSyncData(androidData, pcData);

    // Ambos animes deben estar presentes en el historial fusionado
    expect(merged.history.length).toBe(2);
    expect(merged.history.map(h => h.animeTitle).sort()).toEqual(['Naruto', 'One Piece']);

    // Ambos favoritos deben conservarse
    expect(merged.favorites.length).toBe(2);
    expect(merged.favorites.map(f => f.title).sort()).toEqual(['Naruto', 'One Piece']);
  });

  it('identifica correctamente y excluye archivos de video locales en disco para que no se suban', () => {
    const windowsLocalEpisode: HistoryEntry = {
      id: 'C:\\Users\\herna\\Videos\\AniCS\\Azur Lane\\Episodio 1.mp4-1-default',
      animeTitle: 'Azur Lane',
      animeUrl: 'C:\\Users\\herna\\Videos\\AniCS\\Azur Lane',
      thumbnailUrl: '',
      episodeNumber: 1,
      episodeUrl: 'C:\\Users\\herna\\Videos\\AniCS\\Azur Lane\\Episodio 1.mp4',
      watchProgress: 0.5,
      watchedAt: '2026-09-02T10:00:00Z',
      source: 'local',
      profileId: 'default',
    };

    const androidLocalEpisode: HistoryEntry = {
      id: '/storage/emulated/0/Anime/Solo Leveling/Ep 1.mp4-1-default',
      animeTitle: 'Solo Leveling',
      animeUrl: '/storage/emulated/0/Anime/Solo Leveling',
      thumbnailUrl: '',
      episodeNumber: 1,
      episodeUrl: '/storage/emulated/0/Anime/Solo Leveling/Ep 1.mp4',
      watchProgress: 0.8,
      watchedAt: '2026-09-02T10:00:00Z',
      source: 'local',
      profileId: 'default',
    };

    const onlineEpisode: HistoryEntry = {
      id: 'naruto-1-default',
      animeTitle: 'Naruto',
      animeUrl: 'https://jkanime.net/naruto/',
      thumbnailUrl: '',
      episodeNumber: 1,
      episodeUrl: 'https://jkanime.net/naruto/1/',
      watchProgress: 1.0,
      watchedAt: '2026-09-02T10:00:00Z',
      source: 'jkanime',
      profileId: 'default',
    };

    expect(isLocalFileHistory(windowsLocalEpisode)).toBe(true);
    expect(isLocalFileHistory(androidLocalEpisode)).toBe(true);
    expect(isLocalFileHistory(onlineEpisode)).toBe(false);
  });

  it('separa las configuraciones en settings_desktop y settings_mobile al subir a GitHub Gist', async () => {
    let capturedBody: any = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => '"new-etag"' },
        json: () => Promise.resolve({ id: 'gist_12345', html_url: 'https://gist.github.com/test' }),
        text: () => Promise.resolve(''),
      });
    }));

    const testPayload: GistFilesPayload = {
      syncMeta: {
        schemaVersion: 2,
        appVersion: '0.2.1',
        lastModifiedAt: '2026-09-02T10:00:00Z',
        lastModifiedDevice: 'windows',
        fileHashes: { profiles: 'h1', history: 'h2', favorites: 'h3', settings: 'h4' },
        deletedFavorites: [],
        deletedProfiles: [],
        deletedHistory: [],
      },
      profiles: [],
      history: [],
      favorites: [],
      settings: {
        download_dir: 'C:\\Users\\herna\\Videos\\AniCS',
        player_type: 'internal',
      },
      settingsDesktop: {
        download_dir: 'C:\\Users\\herna\\Videos\\AniCS',
      },
      settingsMobile: {
        download_dir: '/storage/emulated/0/Anime',
      },
    };

    await createOrUpdateGist(mockConfig, testPayload);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.files['settings_desktop.json']).toBeDefined();
    expect(capturedBody.files['settings_mobile.json']).toBeDefined();
    expect(capturedBody.files['sync_meta.json']).toBeDefined();

    const desktopSettings = JSON.parse(capturedBody.files['settings_desktop.json'].content);
    expect(desktopSettings.download_dir).toBe('C:\\Users\\herna\\Videos\\AniCS');

    const mobileSettings = JSON.parse(capturedBody.files['settings_mobile.json'].content);
    expect(mobileSettings.download_dir).toBe('/storage/emulated/0/Anime');
  });
});


