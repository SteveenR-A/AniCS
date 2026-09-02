import { describe, it, expect } from 'vitest';
import {
  mergeHistoryEntries,
  mergeFavoritesWithTombstones,
  mergeProfiles,
  mergeSyncData,
  migratePayload,
  SyncSchemaError,
  CURRENT_SCHEMA_VERSION,
  computePayloadHashes,
  areHashesEqual,
  isLocalDataEmpty,
} from '../syncService';
import type { HistoryEntry, AnimeResult, UserProfile, GistFilesPayload } from '@/types';

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

  it('resuelve historial en el mismo episodio favoreciendo mayor progreso si uno está completado (>=80%)', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.85,
        watchedAt: '2026-08-01T10:00:00Z',
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
        watchProgress: 0.3,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(1);
    expect(merged[0].watchProgress).toBe(0.85);
  });

  it('resuelve historial en el mismo episodio favoreciendo la fecha más reciente si ninguno alcanza el 80%', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.4,
        watchedAt: '2026-08-01T10:00:00Z',
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
        watchProgress: 0.35,
        watchedAt: '2026-08-02T10:00:00Z',
        source: 'jkanime',
        profileId: 'default',
      },
    ];

    const merged = mergeHistoryEntries(local, remote);
    expect(merged.length).toBe(1);
    expect(merged[0].watchProgress).toBe(0.35);
    expect(merged[0].watchedAt).toBe('2026-08-02T10:00:00Z');
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
