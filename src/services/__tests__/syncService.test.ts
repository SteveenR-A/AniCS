import { describe, it, expect } from 'vitest';
import {
  mergeHistoryEntries,
  mergeFavoritesWithTombstones,
  mergeProfiles,
  mergeSyncData,
  migratePayload,
  SyncSchemaError,
  CURRENT_SCHEMA_VERSION,
} from '../syncService';
import type { HistoryEntry, AnimeResult, UserProfile, GistFilesPayload } from '@/types';

describe('syncService - Merge Engine & Migrations', () => {
  it('resuelve historial favoreciendo el episodio más avanzado', () => {
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
    expect(merged.length).toBe(1);
    expect(merged[0].episodeNumber).toBe(5);
  });

  it('resuelve historial en el mismo episodio favoreciendo mayor progreso', () => {
    const local: HistoryEntry[] = [
      {
        id: '1',
        animeTitle: 'Frieren',
        animeUrl: 'https://jkanime.net/frieren/',
        thumbnailUrl: '',
        episodeNumber: 10,
        episodeUrl: 'https://jkanime.net/frieren/10/',
        watchProgress: 0.8,
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
    expect(merged[0].watchProgress).toBe(0.8);
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
