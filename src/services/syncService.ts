import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { firestoreDb } from '@/services/firebase/firebaseConfig';
import type {
  CloudSyncPayload,
  CloudSyncConfig,
  SyncMeta,
  UserProfile,
  HistoryEntry,
  AnimeResult,
  HistoryTombstone,
} from '@/types';
import {
  computeSha256,
  encryptText,
  decryptText,
} from '@/services/cryptoService';
import { normalizeAnimeTitleKey } from '@/services/storageService';
import { CURRENT_VERSION } from '@/services/updateService';

export const CURRENT_SCHEMA_VERSION = 2;
export const MAX_CLOUD_HISTORY_ENTRIES = 1500;

export class SyncSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncSchemaError';
  }
}

export class NeedPinForDecryptionError extends Error {
  public salt: string;
  constructor(salt: string) {
    super('NEED_PIN_FOR_DECRYPTION');
    this.name = 'NeedPinForDecryptionError';
    this.salt = salt;
  }
}

// ─── Utilidades de Tiempo y Plataforma ───

let serverClockSkewMs = 0;

export function setServerClockSkew(serverDateStr?: string | null): number {
  if (!serverDateStr) return serverClockSkewMs;
  try {
    const serverTime = new Date(serverDateStr).getTime();
    if (!isNaN(serverTime)) {
      serverClockSkewMs = serverTime - Date.now();
    }
  } catch {}
  return serverClockSkewMs;
}

export function getServerClockSkewMs(): number {
  return serverClockSkewMs;
}

export function getCalibratedDate(): Date {
  return new Date(Date.now() + serverClockSkewMs);
}

export function getCalibratedTimestamp(): string {
  return getCalibratedDate().toISOString();
}

export function getCurrentDevicePlatform(): 'windows' | 'android' | 'web' {
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
    return 'android';
  }
  if (typeof window !== 'undefined' && ((window as any).AndroidBridge || window.innerWidth < 768)) {
    return 'android';
  }
  return 'windows';
}

// ─── Migraciones de Esquema ───

export function migratePayload(payload: any): CloudSyncPayload {
  const schemaVer = payload?.syncMeta?.schemaVersion ?? 1;

  if (schemaVer > CURRENT_SCHEMA_VERSION) {
    throw new SyncSchemaError(
      `El respaldo en la nube utiliza el esquema v${schemaVer}, pero esta versión de AniCS solo soporta hasta v${CURRENT_SCHEMA_VERSION}. Por favor actualiza la app.`
    );
  }

  let migrated = { ...payload };

  // Migración v1 -> v2: Sanitización de títulos y re-normalización de claves duplicadas
  if (schemaVer < 2) {
    if (Array.isArray(migrated.history)) {
      const sanitizedMap = new Map<string, HistoryEntry>();
      for (const h of migrated.history) {
        const cleanTitle = (h.animeTitle || '')
          .replace(/\uFFFD/g, 'e')
          .trim();
        const cleanEntry: HistoryEntry = {
          ...h,
          animeTitle: cleanTitle,
        };
        const key = makeHistoryCanonicalKey(cleanEntry);
        const existing = sanitizedMap.get(key);
        if (!existing) {
          sanitizedMap.set(key, cleanEntry);
        } else {
          const rTime = new Date(cleanEntry.watchedAt).getTime();
          const lTime = new Date(existing.watchedAt).getTime();
          if (rTime > lTime) {
            sanitizedMap.set(key, cleanEntry);
          } else if (rTime === lTime && (cleanEntry.watchProgress || 0) > (existing.watchProgress || 0)) {
            sanitizedMap.set(key, cleanEntry);
          }
        }
      }
      migrated.history = Array.from(sanitizedMap.values());
    }

    if (!migrated.syncMeta) {
      migrated.syncMeta = {} as any;
    }
    if (!Array.isArray(migrated.syncMeta.deletedHistory)) {
      migrated.syncMeta.deletedHistory = [];
    }
    migrated.syncMeta.schemaVersion = CURRENT_SCHEMA_VERSION;
  }

  return migrated as CloudSyncPayload;
}

// ─── Algoritmo de Claves Canónicas (*Canonical Keys*) ───

export function makeHistoryCanonicalKey(e: HistoryEntry): string {
  const pid = e.profileId || 'default';
  const norm = normalizeAnimeTitleKey(e.animeTitle) || e.animeUrl.toLowerCase().trim();
  const epNum = e.episodeNumber;
  return `${norm}::ep${epNum}::${pid}`;
}

export function makeHistoryAnimeKey(e: HistoryEntry): string {
  const pid = e.profileId || 'default';
  const norm = normalizeAnimeTitleKey(e.animeTitle) || e.animeUrl.toLowerCase().trim();
  return `${norm}::${pid}`;
}

// ─── Algoritmo de Fusión de Historial con Lápidas Temporales ───

export function mergeHistoryWithTombstones(
  local: HistoryEntry[],
  remote: HistoryEntry[],
  tombstones: HistoryTombstone[] = []
): HistoryEntry[] {
  const episodeTombstones = new Map<string, number>();
  const animeTombstones = new Map<string, number>();
  const clearTombstones = new Map<string, number>();

  for (const t of tombstones) {
    const tTime = new Date(t.deletedAt).getTime();
    if (t.type === 'clear') {
      const existing = clearTombstones.get(t.profileId) || 0;
      if (tTime > existing) clearTombstones.set(t.profileId, tTime);
    } else if (t.type === 'anime') {
      const existing = animeTombstones.get(t.key) || 0;
      if (tTime > existing) animeTombstones.set(t.key, tTime);
    } else {
      const existing = episodeTombstones.get(t.key) || 0;
      if (tTime > existing) episodeTombstones.set(t.key, tTime);
    }
  }

  const isSuppressedByTombstone = (e: HistoryEntry): boolean => {
    const wTime = new Date(e.watchedAt).getTime();
    const graceMarginMs = 5000;

    const pid = e.profileId || 'default';
    const clearTime = clearTombstones.get(pid);
    if (clearTime && wTime <= clearTime + graceMarginMs) {
      return true;
    }

    const animeKey = makeHistoryAnimeKey(e);
    const animeTime = animeTombstones.get(animeKey);
    if (animeTime && wTime <= animeTime + graceMarginMs) {
      return true;
    }

    const epKey = makeHistoryCanonicalKey(e);
    const epTime = episodeTombstones.get(epKey);
    if (epTime && wTime <= epTime + graceMarginMs) {
      return true;
    }

    return false;
  };

  const map = new Map<string, HistoryEntry>();

  for (const item of local) {
    if (!isSuppressedByTombstone(item)) {
      map.set(makeHistoryCanonicalKey(item), item);
    }
  }

  for (const rItem of remote) {
    if (isSuppressedByTombstone(rItem)) continue;

    const key = makeHistoryCanonicalKey(rItem);
    const lItem = map.get(key);
    if (!lItem) {
      map.set(key, rItem);
    } else {
      const rTime = new Date(rItem.watchedAt).getTime();
      const lTime = new Date(lItem.watchedAt).getTime();

      if (rTime !== lTime) {
        map.set(key, rTime > lTime ? rItem : lItem);
      } else {
        map.set(key, (rItem.watchProgress || 0) >= (lItem.watchProgress || 0) ? rItem : lItem);
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
  );
}

export function mergeHistoryEntries(local: HistoryEntry[], remote: HistoryEntry[]): HistoryEntry[] {
  return mergeHistoryWithTombstones(local, remote, []);
}

export function mergeFavoritesWithTombstones(
  local: AnimeResult[],
  remote: AnimeResult[],
  tombstones: Array<{ url: string; profileId: string; deletedAt: string }>
): AnimeResult[] {
  const tombstoneMap = new Map<string, number>();
  for (const t of tombstones) {
    const key = `${t.url.toLowerCase().trim()}::${t.profileId || 'default'}`;
    const time = new Date(t.deletedAt).getTime();
    const existing = tombstoneMap.get(key) || 0;
    if (time > existing) {
      tombstoneMap.set(key, time);
    }
  }

  const result = new Map<string, AnimeResult>();

  for (const fav of local) {
    const pid = (fav as any).profileId || 'default';
    const key = `${fav.url.toLowerCase().trim()}::${pid}`;
    const deletedTime = tombstoneMap.get(key);
    if (!deletedTime) {
      result.set(key, fav);
    }
  }

  for (const fav of remote) {
    const pid = (fav as any).profileId || 'default';
    const key = `${fav.url.toLowerCase().trim()}::${pid}`;
    const deletedTime = tombstoneMap.get(key);
    if (!deletedTime) {
      result.set(key, fav);
    }
  }

  return Array.from(result.values());
}

export function mergeProfiles(
  local: UserProfile[],
  remote: UserProfile[],
  deletedProfiles?: Array<{ profileId: string; deletedAt: string }>
): UserProfile[] {
  const tombstoneSet = new Set<string>();
  if (deletedProfiles) {
    for (const d of deletedProfiles) {
      tombstoneSet.add(d.profileId);
    }
  }

  const map = new Map<string, UserProfile>();

  for (const p of local) {
    if (!tombstoneSet.has(p.id)) {
      map.set(p.id, p);
    }
  }

  for (const p of remote) {
    if (!tombstoneSet.has(p.id) && !map.has(p.id)) {
      map.set(p.id, { ...p, isActive: false });
    }
  }

  return Array.from(map.values());
}

export function isLocalFileHistory(entry: HistoryEntry): boolean {
  if (!entry) return false;
  if (entry.source === 'local') return true;
  const url = entry.animeUrl || '';
  const epUrl = entry.episodeUrl || '';
  const id = entry.id || '';
  return (
    url.startsWith('local://') ||
    epUrl.startsWith('local://') ||
    /^[a-zA-Z]:[\\/]/.test(url) ||
    /^[a-zA-Z]:[\\/]/.test(epUrl) ||
    /^[a-zA-Z]:[\\/]/.test(id) ||
    url.startsWith('/storage/') ||
    url.startsWith('/data/') ||
    epUrl.startsWith('/storage/') ||
    epUrl.startsWith('/data/') ||
    id.startsWith('/storage/') ||
    id.startsWith('/data/')
  );
}

export function mergeSyncData(local: CloudSyncPayload, remote: CloudSyncPayload): CloudSyncPayload {
  const migratedRemote = migratePayload(remote);

  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const allFavTombstonesMap = new Map<string, { url: string; profileId: string; deletedAt: string }>();
  for (const t of [...(local.syncMeta.deletedFavorites || []), ...(migratedRemote.syncMeta.deletedFavorites || [])]) {
    const key = `${t.url.toLowerCase()}::${t.profileId}`;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allFavTombstonesMap.set(key, t);
    }
  }
  const mergedFavTombstones = Array.from(allFavTombstonesMap.values());

  const allHistoryTombstonesMap = new Map<string, HistoryTombstone>();
  for (const t of [...(local.syncMeta.deletedHistory || []), ...(migratedRemote.syncMeta.deletedHistory || [])]) {
    const key = `${t.type}::${t.key}::${t.profileId}`;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allHistoryTombstonesMap.set(key, t);
    }
  }
  const mergedHistoryTombstones = Array.from(allHistoryTombstonesMap.values());

  const allProfileTombstonesMap = new Map<string, { profileId: string; deletedAt: string }>();
  for (const t of [...(local.syncMeta.deletedProfiles || []), ...(migratedRemote.syncMeta.deletedProfiles || [])]) {
    const key = t.profileId;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allProfileTombstonesMap.set(key, t);
    }
  }
  const mergedProfileTombstones = Array.from(allProfileTombstonesMap.values());

  const mergedHistory = mergeHistoryWithTombstones(local.history, migratedRemote.history, mergedHistoryTombstones);
  const cloudHistory = mergedHistory.slice(0, MAX_CLOUD_HISTORY_ENTRIES);

  const mergedFavorites = mergeFavoritesWithTombstones(local.favorites, migratedRemote.favorites, mergedFavTombstones);
  const mergedProfiles = mergeProfiles(local.profiles, migratedRemote.profiles, mergedProfileTombstones);

  const mergedSettingsDesktop = {
    ...(migratedRemote.settingsDesktop || {}),
    ...(local.settingsDesktop || {}),
    ...(local.syncMeta.lastModifiedDevice !== 'android' ? local.settings : {})
  };
  const mergedSettingsMobile = {
    ...(migratedRemote.settingsMobile || {}),
    ...(local.settingsMobile || {}),
    ...(local.syncMeta.lastModifiedDevice === 'android' ? local.settings : {})
  };

  const currentPlatform = getCurrentDevicePlatform();
  const activeSettings = currentPlatform === 'android'
    ? (Object.keys(mergedSettingsMobile).length > 0 ? mergedSettingsMobile : local.settings)
    : (Object.keys(mergedSettingsDesktop).length > 0 ? mergedSettingsDesktop : local.settings);

  return {
    syncMeta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: local.syncMeta.appVersion || CURRENT_VERSION,
      lastModifiedAt: getCalibratedTimestamp(),
      lastModifiedDevice: local.syncMeta.lastModifiedDevice || currentPlatform,
      pbkdf2Salt: local.syncMeta.pbkdf2Salt || migratedRemote.syncMeta.pbkdf2Salt,
      fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
      deletedFavorites: mergedFavTombstones,
      deletedProfiles: mergedProfileTombstones,
      deletedHistory: mergedHistoryTombstones,
      devices: {
        ...(migratedRemote.syncMeta.devices || {}),
        ...(local.syncMeta.devices || {}),
      },
    },
    profiles: mergedProfiles,
    history: cloudHistory,
    favorites: mergedFavorites,
    settings: activeSettings,
    settingsDesktop: mergedSettingsDesktop,
    settingsMobile: mergedSettingsMobile,
  };
}

// ─── Hashes y Comprobaciones ───

export async function computePayloadHashes(data: {
  profiles: UserProfile[];
  history: HistoryEntry[];
  favorites: AnimeResult[];
  settings: Record<string, string>;
}): Promise<{ profiles: string; history: string; favorites: string; settings: string }> {
  const profilesJson = JSON.stringify(data.profiles);
  const historyJson = JSON.stringify(data.history);
  const favoritesJson = JSON.stringify(data.favorites);
  const settingsJson = JSON.stringify(data.settings);

  return {
    profiles: await computeSha256(profilesJson),
    history: await computeSha256(historyJson),
    favorites: await computeSha256(favoritesJson),
    settings: await computeSha256(settingsJson),
  };
}

export function areHashesEqual(
  h1?: Record<string, string> | null,
  h2?: Record<string, string> | null
): boolean {
  if (!h1 || !h2) return false;
  return (
    h1.profiles === h2.profiles &&
    h1.history === h2.history &&
    h1.favorites === h2.favorites &&
    h1.settings === h2.settings
  );
}

export function isLocalDataEmpty(data: {
  profiles: UserProfile[];
  history: HistoryEntry[];
  favorites: AnimeResult[];
}): boolean {
  const hasFavorites = data.favorites.length > 0;
  const hasHistory = data.history.length > 0;
  const hasCustomProfiles = data.profiles.some(p => p.id !== 'default');
  return !hasFavorites && !hasHistory && !hasCustomProfiles;
}

// ─── Cliente Cloud Firestore ───

export async function fetchFirestoreData(
  userId: string,
  config: CloudSyncConfig,
  sessionDerivedKey?: CryptoKey | null
): Promise<{ payload: CloudSyncPayload | null; notModified: boolean }> {
  if (!userId) {
    throw new Error('Usuario no autenticado en Firebase.');
  }

  const syncDocRef = doc(firestoreDb, 'users', userId, 'sync', 'data');
  const snap = await getDoc(syncDocRef);

  if (!snap.exists()) {
    return { payload: null, notModified: false };
  }

  const docData = snap.data();
  const syncMeta: SyncMeta = typeof docData.syncMeta === 'string'
    ? JSON.parse(docData.syncMeta)
    : docData.syncMeta;

  if (!syncMeta) {
    throw new Error('El documento en la nube no contiene los metadatos de sincronización.');
  }

  const parseField = async <T>(raw: any, fallback: T): Promise<T> => {
    if (!raw) return fallback;
    const str = typeof raw === 'string' ? raw : JSON.stringify(raw);
    if (!str.trim()) return fallback;

    const isEncrypted = !!syncMeta.pbkdf2Salt || config.encryptionEnabled;
    if (isEncrypted) {
      if (!sessionDerivedKey) {
        throw new NeedPinForDecryptionError(syncMeta.pbkdf2Salt || '');
      }
      try {
        const decrypted = await decryptText(str, sessionDerivedKey);
        return JSON.parse(decrypted);
      } catch (err) {
        try {
          return JSON.parse(str);
        } catch {
          throw err;
        }
      }
    } else {
      try {
        return JSON.parse(str);
      } catch (parseErr) {
        if (sessionDerivedKey) {
          try {
            const decrypted = await decryptText(str, sessionDerivedKey);
            return JSON.parse(decrypted);
          } catch {}
        }
        if (syncMeta.pbkdf2Salt) {
          throw new Error('Los datos remotos están cifrados. Activa el cifrado por PIN para sincronizar.');
        }
        return fallback;
      }
    }
  };

  const profiles = await parseField<UserProfile[]>(docData.profiles, []);
  const history = await parseField<HistoryEntry[]>(docData.history, []);
  const favorites = await parseField<AnimeResult[]>(docData.favorites, []);
  const settingsDesktop = await parseField<Record<string, string>>(docData.settingsDesktop, {});
  const settingsMobile = await parseField<Record<string, string>>(docData.settingsMobile, {});
  const legacySettings = await parseField<Record<string, string>>(docData.settings, {});

  const currentPlatform = getCurrentDevicePlatform();
  const activeSettings = currentPlatform === 'android'
    ? (Object.keys(settingsMobile).length > 0 ? settingsMobile : legacySettings)
    : (Object.keys(settingsDesktop).length > 0 ? settingsDesktop : legacySettings);

  const payload: CloudSyncPayload = {
    syncMeta,
    profiles,
    history,
    favorites,
    settings: activeSettings,
    settingsDesktop,
    settingsMobile,
  };

  return { payload, notModified: false };
}

export async function saveFirestoreData(
  userId: string,
  config: CloudSyncConfig,
  payload: CloudSyncPayload,
  sessionDerivedKey?: CryptoKey | null,
  pbkdf2Salt?: string
): Promise<{ hashes: { profiles: string; history: string; favorites: string; settings: string } }> {
  if (!userId) {
    throw new Error('Usuario no autenticado en Firebase para guardar respaldo.');
  }

  const currentPlatform = getCurrentDevicePlatform();
  const isAndroid = currentPlatform === 'android';

  let finalSettingsDesktop = { ...(payload.settingsDesktop || {}) };
  let finalSettingsMobile = { ...(payload.settingsMobile || {}) };

  if (isAndroid) {
    finalSettingsMobile = { ...finalSettingsMobile, ...payload.settings };
  } else {
    finalSettingsDesktop = { ...finalSettingsDesktop, ...payload.settings };
  }

  const profilesJson = JSON.stringify(payload.profiles);
  const historyJson = JSON.stringify(payload.history);
  const favoritesJson = JSON.stringify(payload.favorites);
  const settingsJson = JSON.stringify(payload.settings);
  const settingsDesktopJson = JSON.stringify(finalSettingsDesktop);
  const settingsMobileJson = JSON.stringify(finalSettingsMobile);

  const fileHashes = {
    profiles: payload.syncMeta.fileHashes?.profiles || (await computeSha256(profilesJson)),
    history: payload.syncMeta.fileHashes?.history || (await computeSha256(historyJson)),
    favorites: payload.syncMeta.fileHashes?.favorites || (await computeSha256(favoritesJson)),
    settings: payload.syncMeta.fileHashes?.settings || (await computeSha256(settingsJson)),
  };

  const devices = { ...(payload.syncMeta.devices || {}) };
  devices[isAndroid ? 'android' : 'windows'] = {
    lastSyncAt: getCalibratedTimestamp(),
    appVersion: payload.syncMeta.appVersion || CURRENT_VERSION,
  };
  payload.syncMeta.devices = devices;
  payload.syncMeta.lastModifiedDevice = currentPlatform;
  payload.syncMeta.fileHashes = fileHashes;
  payload.syncMeta.lastModifiedAt = getCalibratedTimestamp();

  let finalProfilesContent = profilesJson;
  let finalHistoryContent = historyJson;
  let finalFavoritesContent = favoritesJson;
  let finalSettingsContent = settingsJson;
  let finalSettingsDesktopContent = settingsDesktopJson;
  let finalSettingsMobileContent = settingsMobileJson;

  if (config.encryptionEnabled && sessionDerivedKey) {
    payload.syncMeta.pbkdf2Salt = pbkdf2Salt || payload.syncMeta.pbkdf2Salt;
    finalProfilesContent = await encryptText(profilesJson, sessionDerivedKey);
    finalHistoryContent = await encryptText(historyJson, sessionDerivedKey);
    finalFavoritesContent = await encryptText(favoritesJson, sessionDerivedKey);
    finalSettingsContent = await encryptText(settingsJson, sessionDerivedKey);
    finalSettingsDesktopContent = await encryptText(settingsDesktopJson, sessionDerivedKey);
    finalSettingsMobileContent = await encryptText(settingsMobileJson, sessionDerivedKey);
  } else {
    payload.syncMeta.pbkdf2Salt = undefined;
  }

  const syncDocRef = doc(firestoreDb, 'users', userId, 'sync', 'data');
  await setDoc(syncDocRef, {
    syncMeta: JSON.stringify(payload.syncMeta),
    profiles: finalProfilesContent,
    history: finalHistoryContent,
    favorites: finalFavoritesContent,
    settings: finalSettingsContent,
    settingsDesktop: finalSettingsDesktopContent,
    settingsMobile: finalSettingsMobileContent,
    updatedAt: getCalibratedTimestamp(),
  });

  return { hashes: fileHashes };
}

// ─── Exportar / Importar Archivo Offline .json ───

export function exportPayloadToJsonString(payload: CloudSyncPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function importPayloadFromJsonString(jsonString: string): CloudSyncPayload {
  const parsed = JSON.parse(jsonString);
  return migratePayload(parsed);
}

/**
 * Elimina por completo el documento de sincronización en Firestore para este usuario
 */
export async function clearAllFirestoreData(userId: string): Promise<void> {
  if (!userId) return;
  const syncDocRef = doc(firestoreDb, 'users', userId, 'sync', 'data');
  await deleteDoc(syncDocRef);
}

