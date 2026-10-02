import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import fixtureJson from '../../../docs/android-native/fixtures/sync-v1.json?raw';
import { normalizeAnimeTitleKey } from '../storageService';
import {
  CURRENT_SCHEMA_VERSION, MAX_CLOUD_HISTORY_ENTRIES, SyncSchemaError,
  exportPayloadToJsonString, fetchFirestoreData, importPayloadFromJsonString,
  isLocalFileHistory, makeHistoryAnimeKey, makeHistoryCanonicalKey,
  mergeFavoritesWithTombstones, mergeHistoryWithTombstones, mergeProfiles,
  mergeSyncData, migratePayload, setServerClockSkew,
} from '../syncService';
import type { CloudSyncPayload, HistoryEntry } from '@/types';

vi.mock('@/services/firebase/firebaseConfig', () => ({ firestoreDb: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockReturnValue('fixture-document'),
  getDoc: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(),
}));

const fixtures = JSON.parse(fixtureJson);
// JSON.parse is untyped; give each() object cases instead of its tuple overload.
const cases = (group: string): Array<Record<string, any>> => fixtures[group];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// Compare exported JSON semantics, including omission of undefined properties.
const wire = clone;
const lookup = (table: Record<string, any>, ids: string[]) => ids.map(id => clone(table[id]));
const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fixtures.clock));
  setServerClockSkew(fixtures.clock);
  vi.stubGlobal('navigator', { userAgent: 'Fixture Desktop' });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

afterEach(() => {
  setServerClockSkew(fixtures.clock);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
});

describe('schema migration and canonical keys from shared fixtures', () => {
  it.each(cases('migrations'))('$name', (testCase) => {
    if (testCase.error) {
      expect(() => migratePayload(clone(testCase.input))).toThrow(SyncSchemaError);
      expect(() => importPayloadFromJsonString(JSON.stringify(testCase.input))).toThrow(SyncSchemaError);
    } else {
      expect(wire(migratePayload(clone(testCase.input)))).toEqual(testCase.expected);
      expect(wire(importPayloadFromJsonString(JSON.stringify(testCase.input)))).toEqual(testCase.expected);
    }
  });

  it.each(cases('keyCases'))('$name', (testCase) => {
    expect(normalizeAnimeTitleKey(testCase.entry.animeTitle)).toBe(testCase.normalizedTitle);
    expect(makeHistoryCanonicalKey(testCase.entry)).toBe(testCase.episodeKey);
    expect(makeHistoryAnimeKey(testCase.entry)).toBe(testCase.animeKey);
  });

  it('preserves v2 JSON on offline export/import, including favorite extension fields', () => {
    const v2 = fixtures.migrations[1].input;
    expect(wire(importPayloadFromJsonString(exportPayloadToJsonString(v2)))).toEqual(v2);
    expect(v2.favorites[0].addedAt).toBe('2026-10-02T10:00:00.001Z');
  });
});

describe('history, favorites and profile merge semantics', () => {
  it.each(cases('historyCases'))('$name', (testCase) => {
    expect(mergeHistoryWithTombstones(
      lookup(fixtures.entries, testCase.local), lookup(fixtures.entries, testCase.remote), clone(testCase.tombstones),
    )).toEqual(lookup(fixtures.entries, testCase.expected));
  });

  it.each(cases('favoriteCases'))('$name', (testCase) => {
    expect(mergeFavoritesWithTombstones(
      lookup(fixtures.favorites, testCase.local), lookup(fixtures.favorites, testCase.remote), clone(testCase.tombstones),
    )).toEqual(lookup(fixtures.favorites, testCase.expected));
  });

  it.each(cases('profileCases'))('$name', (testCase) => {
    expect(mergeProfiles(
      lookup(fixtures.profiles, testCase.local), lookup(fixtures.profiles, testCase.remote), clone(testCase.deletedProfiles),
    )).toEqual(testCase.expected);
  });

  it.each(cases('mergeCases'))('$name', (testCase) => {
    vi.stubGlobal('navigator', { userAgent: testCase.platform === 'android' ? 'Fixture Android' : 'Fixture Desktop' });
    expect(wire(mergeSyncData(
      clone(fixtures.payloads[testCase.local]), clone(fixtures.payloads[testCase.remote]),
    ))).toEqual(testCase.expected);
  });

  it('rejects a future remote schema before producing a merged payload', () => {
    const future = fixtures.migrations.find((item: any) => item.error).input;
    expect(() => mergeSyncData(clone(fixtures.payloads.pc), clone(future))).toThrow(SyncSchemaError);
  });

  it('expires tombstones at exactly thirty days for all three entity collections', () => {
    const local: CloudSyncPayload = clone(fixtures.payloads.empty);
    local.syncMeta.deletedHistory = clone(fixtures.retention.local);
    local.syncMeta.deletedFavorites = fixtures.retention.local.map((item: any) => ({
      url: item.key, profileId: item.profileId, deletedAt: item.deletedAt,
    }));
    local.syncMeta.deletedProfiles = fixtures.retention.local.map((item: any) => ({
      profileId: item.key, deletedAt: item.deletedAt,
    }));
    const merged = mergeSyncData(local, clone(fixtures.payloads.empty));
    expect(merged.syncMeta.deletedHistory?.map(item => item.key)).toEqual(fixtures.retention.expectedKeys);
    expect(merged.syncMeta.deletedFavorites.map(item => item.url)).toEqual(fixtures.retention.expectedKeys);
    expect(merged.syncMeta.deletedProfiles.map(item => item.profileId)).toEqual(fixtures.retention.expectedKeys);
  });

  it('retains the 1500 most recent episodes after merging', () => {
    const local: CloudSyncPayload = clone(fixtures.payloads.empty);
    local.history = Array.from({ length: fixtures.historyLimit.inputCount }, (_, index): HistoryEntry => ({
      ...clone(fixtures.entries.local), id: `limit-${index + 1}`, episodeNumber: index + 1,
      episodeUrl: `https://catalog.example/cafe/${index + 1}/`,
      watchedAt: new Date(Date.parse('2026-10-02T08:00:00.000Z') + index * 1000).toISOString(),
    }));
    const result = mergeSyncData(local, clone(fixtures.payloads.empty));
    expect(MAX_CLOUD_HISTORY_ENTRIES).toBe(fixtures.historyLimit.expectedCount);
    expect(result.history).toHaveLength(fixtures.historyLimit.expectedCount);
    expect(result.history[0].episodeNumber).toBe(fixtures.historyLimit.firstEpisode);
    expect(result.history.at(-1)?.episodeNumber).toBe(fixtures.historyLimit.lastEpisode);
  });
});

describe('local history boundaries and mocked Firestore read contract', () => {
  it.each(cases('localHistoryCases'))('$name', (testCase) => {
    expect(isLocalFileHistory(testCase.entry)).toBe(testCase.expected);
  });

  it('does not perform local-file exclusion inside mergeSyncData itself', () => {
    const local = clone(fixtures.payloads.empty);
    local.history = [clone(fixtures.localHistoryCases[0].entry)];
    expect(mergeSyncData(local, clone(fixtures.payloads.empty)).history).toEqual(local.history);
  });

  it.each(['windows', 'android'])('reads JSON string fields and selects %s settings', async (platform) => {
    vi.stubGlobal('navigator', { userAgent: platform === 'android' ? 'Fixture Android' : 'Fixture Desktop' });
    const payload = clone(fixtures.mergeCases[platform === 'android' ? 1 : 0].expected);
    const document = Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, JSON.stringify(value)]));
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => document } as any);
    const result = await fetchFirestoreData('fixture-user', { autoSync: false, encryptionEnabled: false });
    expect(wire(result.payload)).toEqual(payload);
    expect(result.notModified).toBe(false);
    expect(doc).toHaveBeenCalledWith({}, 'users', 'fixture-user', 'sync', 'data');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('distinguishes an absent document from an empty existing payload', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false } as any);
    expect(await fetchFirestoreData('fixture-user', { autoSync: false, encryptionEnabled: false }))
      .toEqual({ payload: null, notModified: false });
  });

  it('rejects missing metadata without writing to Firestore', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => true, data: () => ({ history: '[]' }) } as any);
    await expect(fetchFirestoreData('fixture-user', { autoSync: false, encryptionEnabled: false }))
      .rejects.toThrow('metadatos');
    expect(setDoc).not.toHaveBeenCalled();
  });

  it('pins the fixture clock and current payload schema', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(new Date().toISOString()).toBe(fixtures.clock);
  });
});
