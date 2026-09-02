import { describe, it, expect } from 'vitest';
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
} from '../syncService';
import type { HistoryEntry, AnimeResult, UserProfile, GistFilesPayload, HistoryTombstone } from '@/types';

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
