import type {
  GistFilesPayload,
  GistSyncConfig,
  SyncMeta,
  UserProfile,
  HistoryEntry,
  AnimeResult,
  TombstoneItem,
  HistoryTombstone,
} from '@/types';
import {
  computeSha256,
  encryptText,
  decryptText,
} from '@/services/cryptoService';
import { normalizeAnimeTitleKey } from '@/services/storageService';

export const CURRENT_SCHEMA_VERSION = 2;
export const GIST_APP_NAME = 'AniCS Cloud Sync (Secret)';
export const MAX_CLOUD_HISTORY_ENTRIES = 1500;

export class SyncSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncSchemaError';
  }
}

export class GistNotFoundError extends Error {
  constructor(message = 'Gist no encontrado en GitHub (404)') {
    super(message);
    this.name = 'GistNotFoundError';
  }
}

// ─── Calibración de Reloj (*Clock Skew*) ───

let serverClockSkewMs = 0;

export function setServerClockSkew(serverDateStr?: string | null): number {
  if (!serverDateStr) return serverClockSkewMs;
  try {
    const serverTime = new Date(serverDateStr).getTime();
    if (!isNaN(serverTime)) {
      serverClockSkewMs = serverTime - Date.now();
      if (Math.abs(serverClockSkewMs) > 60_000) {
        console.warn(`[AniCS Sync] Clock skew detectado con GitHub: ${Math.round(serverClockSkewMs / 1000)}s`);
      }
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

// ─── Búsqueda Automática de Gist Existente ───

export async function findExistingGist(
  token: string
): Promise<{ gistId: string; description: string } | null> {
  if (!token) return null;
  try {
    const response = await fetch('https://api.github.com/gists?per_page=100', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) return null;

    setServerClockSkew(response.headers.get('date'));

    const gists = await response.json();
    if (!Array.isArray(gists)) return null;

    for (const g of gists) {
      if (g.description === GIST_APP_NAME || (g.files && g.files['sync_meta.json'])) {
        return { gistId: g.id, description: g.description || GIST_APP_NAME };
      }
    }
    return null;
  } catch (e) {
    console.warn('[AniCS Sync] Error buscando Gist existente:', e);
    return null;
  }
}

// ─── Migraciones de Esquema ───

export function migratePayload(payload: any): GistFilesPayload {
  const schemaVer = payload?.syncMeta?.schemaVersion ?? 1;

  if (schemaVer > CURRENT_SCHEMA_VERSION) {
    throw new SyncSchemaError(
      `El Gist utiliza el esquema v${schemaVer}, pero esta versión de AniCS solo soporta hasta v${CURRENT_SCHEMA_VERSION}. Por favor actualiza la app.`
    );
  }

  let migrated = { ...payload };

  // Migración v1 -> v2: Sanitización de títulos y re-normalización de claves duplicadas en Gist
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

  return migrated as GistFilesPayload;
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
  // 1. Indexar lápidas con sus marcas de tiempo (ms)
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
    const graceMarginMs = 5000; // 5 segundos de tolerancia para clock skew

    // A. Borrado total de historial para el perfil
    const pid = e.profileId || 'default';
    const clearTime = clearTombstones.get(pid);
    if (clearTime && wTime <= clearTime + graceMarginMs) {
      return true;
    }

    // B. Borrado de toda la serie
    const animeKey = makeHistoryAnimeKey(e);
    const animeTime = animeTombstones.get(animeKey);
    if (animeTime && wTime <= animeTime + graceMarginMs) {
      return true;
    }

    // C. Borrado de episodio individual
    const epKey = makeHistoryCanonicalKey(e);
    const epTime = episodeTombstones.get(epKey);
    if (epTime && wTime <= epTime + graceMarginMs) {
      return true;
    }

    return false;
  };

  const map = new Map<string, HistoryEntry>();

  // 2. Procesar locales no suprimidos
  for (const item of local) {
    if (!isSuppressedByTombstone(item)) {
      map.set(makeHistoryCanonicalKey(item), item);
    }
  }

  // 3. Procesar remotos no suprimidos con resolución estricta de conflicto
  for (const rItem of remote) {
    if (isSuppressedByTombstone(rItem)) continue;

    const key = makeHistoryCanonicalKey(rItem);
    const lItem = map.get(key);
    if (!lItem) {
      map.set(key, rItem);
    } else {
      const rTime = new Date(rItem.watchedAt).getTime();
      const lTime = new Date(lItem.watchedAt).getTime();

      // Regla de conflicto estricta:
      // Prioridad 1: watchedAt más reciente gana SIEMPRE (representa la última sesión real)
      if (rTime !== lTime) {
        map.set(key, rTime > lTime ? rItem : lItem);
      } else {
        // Prioridad 2: Desempate por mayor watchProgress
        map.set(key, (rItem.watchProgress || 0) >= (lItem.watchProgress || 0) ? rItem : lItem);
      }
    }
  }

  // 4. Ordenar por watchedAt DESC (más recientes primero)
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime()
  );
}

// Compatibilidad hacia atrás
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

  // Procesar locales
  for (const fav of local) {
    const pid = (fav as any).profileId || 'default';
    const key = `${fav.url.toLowerCase().trim()}::${pid}`;
    const deletedTime = tombstoneMap.get(key);
    if (!deletedTime) {
      result.set(key, fav);
    }
  }

  // Procesar remotos
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

export function mergeProfiles(local: UserProfile[], remote: UserProfile[]): UserProfile[] {
  const map = new Map<string, UserProfile>();

  for (const p of local) {
    map.set(p.id, p);
  }

  for (const p of remote) {
    if (!map.has(p.id)) {
      map.set(p.id, { ...p, isActive: false });
    }
  }

  return Array.from(map.values());
}

/**
 * Detecta si una entrada de historial corresponde a un archivo reproducido localmente en disco
 * (ej. rutas de Windows C:\... o rutas de Android /storage/...), las cuales no deben sincronizarse
 * en la nube para no mezclar ni romper rutas de archivos entre distintas plataformas.
 */
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

export function mergeSyncData(local: GistFilesPayload, remote: GistFilesPayload): GistFilesPayload {
  // Validar versión y migrar si procede
  const migratedRemote = migratePayload(remote);

  // Unificar tombstones y podar > 30 días
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Tombstones de favoritos
  const allFavTombstonesMap = new Map<string, { url: string; profileId: string; deletedAt: string }>();
  for (const t of [...(local.syncMeta.deletedFavorites || []), ...(migratedRemote.syncMeta.deletedFavorites || [])]) {
    const key = `${t.url.toLowerCase()}::${t.profileId}`;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allFavTombstonesMap.set(key, t);
    }
  }
  const mergedFavTombstones = Array.from(allFavTombstonesMap.values());

  // Tombstones de historial
  const allHistoryTombstonesMap = new Map<string, HistoryTombstone>();
  for (const t of [...(local.syncMeta.deletedHistory || []), ...(migratedRemote.syncMeta.deletedHistory || [])]) {
    const key = `${t.type}::${t.key}::${t.profileId}`;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allHistoryTombstonesMap.set(key, t);
    }
  }
  const mergedHistoryTombstones = Array.from(allHistoryTombstonesMap.values());

  const mergedHistory = mergeHistoryWithTombstones(local.history, migratedRemote.history, mergedHistoryTombstones);
  // Ventana deslizante para la nube: últimos 1,500 episodios
  const cloudHistory = mergedHistory.slice(0, MAX_CLOUD_HISTORY_ENTRIES);

  const mergedFavorites = mergeFavoritesWithTombstones(local.favorites, migratedRemote.favorites, mergedFavTombstones);
  const mergedProfiles = mergeProfiles(local.profiles, migratedRemote.profiles);

  // Separación de configuraciones por plataforma
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
      appVersion: local.syncMeta.appVersion || '0.2.1',
      lastModifiedAt: getCalibratedTimestamp(),
      lastModifiedDevice: local.syncMeta.lastModifiedDevice || currentPlatform,
      pbkdf2Salt: local.syncMeta.pbkdf2Salt || migratedRemote.syncMeta.pbkdf2Salt,
      fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
      deletedFavorites: mergedFavTombstones,
      deletedProfiles: [],
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

export class NeedPinForDecryptionError extends Error {
  public salt: string;
  constructor(salt: string) {
    super('NEED_PIN_FOR_DECRYPTION');
    this.name = 'NeedPinForDecryptionError';
    this.salt = salt;
  }
}

// ─── Cliente REST de GitHub Gist ───

export async function fetchGistData(
  config: GistSyncConfig,
  sessionDerivedKey?: CryptoKey | null
): Promise<{ payload: GistFilesPayload | null; notModified: boolean; etag?: string }> {
  if (!config.githubToken || !config.gistId) {
    throw new Error('Falta el Token de GitHub o el ID del Gist');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (config.lastEtag) {
    headers['If-None-Match'] = config.lastEtag;
  }

  const response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
    method: 'GET',
    headers,
  });

  setServerClockSkew(response.headers.get('date'));

  if (response.status === 304) {
    return { payload: null, notModified: true, etag: config.lastEtag };
  }

  if (response.status === 404) {
    throw new GistNotFoundError();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Error ${response.status} de GitHub: ${errText || response.statusText}`);
  }

  const newEtag = response.headers.get('ETag') || undefined;
  const gistJson = await response.json();
  const files = gistJson.files || {};

  // Descarga segura del contenido del archivo: si GitHub lo truncó o no incluyó el contenido
  // directamente en el JSON (por tamaño o líneas), se consulta el raw_url
  const getRawContent = async (filename: string): Promise<string> => {
    const fileObj = files[filename];
    if (!fileObj) return '';
    if (!fileObj.truncated && typeof fileObj.content === 'string' && fileObj.content.length > 0) {
      return fileObj.content;
    }
    if (fileObj.raw_url) {
      try {
        // gist.githubusercontent.com es un CDN público de contenido plano.
        // Enviar cabecera `Authorization: Bearer` en peticiones CORS desde el WebView provoca que
        // el servidor rechace el preflight con error de red/CORS.
        const isGistRawContentUrl = fileObj.raw_url.includes('gist.githubusercontent.com') || fileObj.raw_url.includes('raw.githubusercontent.com');
        const fetchHeaders: Record<string, string> = {
          'Cache-Control': 'no-cache',
        };
        if (!isGistRawContentUrl && config.githubToken) {
          fetchHeaders['Authorization'] = `Bearer ${config.githubToken}`;
        }
        const rawRes = await fetch(fileObj.raw_url, {
          headers: fetchHeaders,
        });
        if (rawRes.ok) {
          return await rawRes.text();
        }
      } catch (err) {
        console.warn(`[AniCS Sync] Falló descarga directa de raw_url para ${filename}:`, err);
      }
    }
    return fileObj.content || '';
  };

  const syncMetaContent = await getRawContent('sync_meta.json');
  if (!syncMetaContent) {
    throw new Error('El Gist no contiene el archivo sync_meta.json requerido');
  }

  const syncMeta: SyncMeta = JSON.parse(syncMetaContent);

  // Helper para procesar texto plano o descifrar si aplica
  const parseFileContent = async <T>(filename: string, fallback: T): Promise<T> => {
    const raw = await getRawContent(filename);
    if (!raw || !raw.trim()) return fallback;

    const isEncrypted = !!syncMeta.pbkdf2Salt || config.encryptionEnabled;

    if (isEncrypted) {
      if (!sessionDerivedKey) {
        throw new NeedPinForDecryptionError(syncMeta.pbkdf2Salt || '');
      }
      try {
        const decrypted = await decryptText(raw, sessionDerivedKey);
        return JSON.parse(decrypted);
      } catch (err: any) {
        // Fallback si el archivo remoto aún era texto plano no cifrado
        try {
          return JSON.parse(raw);
        } catch {
          throw err;
        }
      }
    } else {
      try {
        return JSON.parse(raw);
      } catch (parseErr) {
        if (sessionDerivedKey) {
          try {
            const decrypted = await decryptText(raw, sessionDerivedKey);
            return JSON.parse(decrypted);
          } catch {
            // Ignorar
          }
        }
        if (syncMeta.pbkdf2Salt) {
          throw new Error('Los datos remotos están cifrados. Activa el cifrado por PIN con la clave correcta para sincronizar.');
        }
        console.warn(`[AniCS Sync] Error procesando JSON de ${filename}:`, parseErr);
        return fallback;
      }
    }
  };

  const profiles = await parseFileContent<UserProfile[]>('profiles.json', []);
  const history = await parseFileContent<HistoryEntry[]>('history.json', []);
  const favorites = await parseFileContent<AnimeResult[]>('favorites.json', []);
  const settingsDesktop = await parseFileContent<Record<string, string>>('settings_desktop.json', {});
  const settingsMobile = await parseFileContent<Record<string, string>>('settings_mobile.json', {});
  const legacySettings = await parseFileContent<Record<string, string>>('settings.json', {});

  const currentPlatform = getCurrentDevicePlatform();
  const activeSettings = currentPlatform === 'android'
    ? (Object.keys(settingsMobile).length > 0 ? settingsMobile : legacySettings)
    : (Object.keys(settingsDesktop).length > 0 ? settingsDesktop : legacySettings);

  const payload: GistFilesPayload = {
    syncMeta,
    profiles,
    history,
    favorites,
    settings: activeSettings,
    settingsDesktop,
    settingsMobile,
  };

  return { payload, notModified: false, etag: newEtag };
}

export function getCurrentDevicePlatform(): 'windows' | 'android' | 'web' {
  if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
    return 'android';
  }
  return 'windows';
}

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

export async function createOrUpdateGist(
  config: GistSyncConfig,
  payload: GistFilesPayload,
  sessionDerivedKey?: CryptoKey | null,
  pbkdf2Salt?: string
): Promise<{ gistId: string; etag?: string; gistUrl?: string; hashes: { profiles: string; history: string; favorites: string; settings: string } }> {
  if (!config.githubToken) {
    throw new Error('Falta el Token de GitHub para sincronizar');
  }

  const currentPlatform = getCurrentDevicePlatform();
  const isAndroid = currentPlatform === 'android';

  // Mantener las configuraciones del otro dispositivo si ya existían en el Gist
  let finalSettingsDesktop = { ...(payload.settingsDesktop || {}) };
  let finalSettingsMobile = { ...(payload.settingsMobile || {}) };

  if (isAndroid) {
    finalSettingsMobile = { ...finalSettingsMobile, ...payload.settings };
  } else {
    finalSettingsDesktop = { ...finalSettingsDesktop, ...payload.settings };
  }

  // 1. Serializar JSON minificado para máxima eficiencia y calcular hashes deterministas
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

  const devices = payload.syncMeta.devices || {};
  devices[isAndroid ? 'android' : 'windows'] = {
    lastSyncAt: getCalibratedTimestamp(),
    appVersion: payload.syncMeta.appVersion || '0.2.1',
  };
  payload.syncMeta.devices = devices;
  payload.syncMeta.lastModifiedDevice = currentPlatform;
  payload.syncMeta.fileHashes = fileHashes;
  payload.syncMeta.lastModifiedAt = getCalibratedTimestamp();

  // 2. Cifrar si el cifrado está activado
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
    // Si no hay cifrado, asegurar que pbkdf2Salt sea undefined
    payload.syncMeta.pbkdf2Salt = undefined;
  }

  const syncMetaJson = JSON.stringify(payload.syncMeta);

  const gistFilesPayload: Record<string, { content: string }> = {
    'sync_meta.json': { content: syncMetaJson },
    'profiles.json': { content: finalProfilesContent },
    'history.json': { content: finalHistoryContent },
    'favorites.json': { content: finalFavoritesContent },
    'settings.json': { content: finalSettingsContent },
    'settings_desktop.json': { content: finalSettingsDesktopContent },
    'settings_mobile.json': { content: finalSettingsMobileContent },
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let response: Response;
  if (config.gistId) {
    // PATCH
    response = await fetch(`https://api.github.com/gists/${config.gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: GIST_APP_NAME,
        files: gistFilesPayload,
      }),
    });
  } else {
    // POST
    response = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        description: GIST_APP_NAME,
        public: false,
        files: gistFilesPayload,
      }),
    });
  }

  setServerClockSkew(response.headers.get('date'));

  if (response.status === 404) {
    throw new GistNotFoundError();
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Error ${response.status} de GitHub: ${errText || response.statusText}`);
  }

  const resJson = await response.json();
  const etag = response.headers.get('ETag') || undefined;

  return {
    gistId: resJson.id,
    etag,
    gistUrl: resJson.html_url,
    hashes: fileHashes,
  };
}

// ─── Exportar / Importar Archivo Offline .json ───

export function exportPayloadToJsonString(payload: GistFilesPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function importPayloadFromJsonString(jsonString: string): GistFilesPayload {
  const parsed = JSON.parse(jsonString);
  return migratePayload(parsed);
}
