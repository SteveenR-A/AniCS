import type {
  GistFilesPayload,
  GistSyncConfig,
  SyncMeta,
  UserProfile,
  HistoryEntry,
  AnimeResult,
  TombstoneItem,
} from '@/types';
import {
  computeSha256,
  encryptText,
  decryptText,
} from '@/services/cryptoService';

export const CURRENT_SCHEMA_VERSION = 1;
export const GIST_APP_NAME = 'AniCS Cloud Sync (Secret)';

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

// ─── Migraciones de Esquema ───

export function migratePayload(payload: any): GistFilesPayload {
  const schemaVer = payload?.syncMeta?.schemaVersion ?? 1;

  if (schemaVer > CURRENT_SCHEMA_VERSION) {
    throw new SyncSchemaError(
      `El Gist utiliza el esquema v${schemaVer}, pero esta versión de AniCS solo soporta hasta v${CURRENT_SCHEMA_VERSION}. Por favor actualiza la app.`
    );
  }

  // Migraciones hacia adelante si en el futuro CURRENT_SCHEMA_VERSION > 1
  let migrated = { ...payload };
  return migrated as GistFilesPayload;
}

// ─── Algoritmo de Fusión Bidireccional (*Merge Engine*) ───

export function mergeHistoryEntries(local: HistoryEntry[], remote: HistoryEntry[]): HistoryEntry[] {
  const map = new HashMapHistory();

  for (const item of local) {
    map.set(item);
  }

  for (const rItem of remote) {
    const lItem = map.get(rItem);
    if (!lItem) {
      map.set(rItem);
    } else {
      // Política de resolución de conflictos por episodio:
      // 1. Si alguno ya alcanzó o superó el 80% (completado), gana el de mayor progreso
      if (rItem.watchProgress >= 0.80 || lItem.watchProgress >= 0.80) {
        map.set(rItem.watchProgress >= lItem.watchProgress ? rItem : lItem);
      } else {
        // 2. Si ninguno está completado, gana el más recientemente visto
        const rTime = new Date(rItem.watchedAt).getTime();
        const lTime = new Date(lItem.watchedAt).getTime();
        map.set(rTime >= lTime ? rItem : lItem);
      }
    }
  }

  return map.values();
}

class HashMapHistory {
  private items = new Map<string, HistoryEntry>();

  private makeKey(e: HistoryEntry): string {
    const pid = e.profileId || 'default';
    const normUrl = e.animeUrl.toLowerCase().trim();
    const epNum = e.episodeNumber;
    return `${normUrl}::ep${epNum}::${pid}`;
  }

  get(e: HistoryEntry): HistoryEntry | undefined {
    return this.items.get(this.makeKey(e));
  }

  set(e: HistoryEntry) {
    this.items.set(this.makeKey(e), e);
  }

  values(): HistoryEntry[] {
    return Array.from(this.items.values());
  }
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
    // Si no fue eliminado, o si no hay registro de borrado posterior
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

export function mergeSyncData(local: GistFilesPayload, remote: GistFilesPayload): GistFilesPayload {
  // Validar versión
  migratePayload(remote);

  // Unificar tombstones y podar > 30 días
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const allTombstonesMap = new Map<string, { url: string; profileId: string; deletedAt: string }>();
  for (const t of [...local.syncMeta.deletedFavorites, ...remote.syncMeta.deletedFavorites]) {
    const key = `${t.url.toLowerCase()}::${t.profileId}`;
    const tTime = new Date(t.deletedAt).getTime();
    if (now - tTime < thirtyDaysMs) {
      allTombstonesMap.set(key, t);
    }
  }
  const mergedTombstones = Array.from(allTombstonesMap.values());

  const mergedHistory = mergeHistoryEntries(local.history, remote.history);
  const mergedFavorites = mergeFavoritesWithTombstones(local.favorites, remote.favorites, mergedTombstones);
  const mergedProfiles = mergeProfiles(local.profiles, remote.profiles);
  const mergedSettings = { ...remote.settings, ...local.settings };

  return {
    syncMeta: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: local.syncMeta.appVersion || '0.1.8',
      lastModifiedAt: new Date().toISOString(),
      lastModifiedDevice: local.syncMeta.lastModifiedDevice || 'windows',
      pbkdf2Salt: local.syncMeta.pbkdf2Salt || remote.syncMeta.pbkdf2Salt,
      fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
      deletedFavorites: mergedTombstones,
      deletedProfiles: [],
    },
    profiles: mergedProfiles,
    history: mergedHistory,
    favorites: mergedFavorites,
    settings: mergedSettings,
  };
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

  const getRawContent = (filename: string): string => {
    return files[filename]?.content || '';
  };

  const syncMetaContent = getRawContent('sync_meta.json');
  if (!syncMetaContent) {
    throw new Error('El Gist no contiene el archivo sync_meta.json requerido');
  }

  const syncMeta: SyncMeta = JSON.parse(syncMetaContent);

  // Helper para procesar texto plano o descifrar si aplica
  const parseFileContent = async <T>(filename: string, fallback: T): Promise<T> => {
    const raw = getRawContent(filename);
    if (!raw) return fallback;

    const isEncrypted = !!syncMeta.pbkdf2Salt || config.encryptionEnabled;

    if (isEncrypted) {
      if (!sessionDerivedKey) {
        throw new Error('NEED_PIN_FOR_DECRYPTION');
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
      } catch {
        if (sessionDerivedKey) {
          try {
            const decrypted = await decryptText(raw, sessionDerivedKey);
            return JSON.parse(decrypted);
          } catch {
            // Ignorar
          }
        }
        throw new Error('Los datos remotos están cifrados. Activa el cifrado por PIN con la clave correcta para sincronizar.');
      }
    }
  };

  const profiles = await parseFileContent<UserProfile[]>('profiles.json', []);
  const history = await parseFileContent<HistoryEntry[]>('history.json', []);
  const favorites = await parseFileContent<AnimeResult[]>('favorites.json', []);
  const settings = await parseFileContent<Record<string, string>>('settings.json', {});

  const payload: GistFilesPayload = {
    syncMeta,
    profiles,
    history,
    favorites,
    settings,
  };

  return { payload, notModified: false, etag: newEtag };
}

export async function createOrUpdateGist(
  config: GistSyncConfig,
  payload: GistFilesPayload,
  sessionDerivedKey?: CryptoKey | null,
  pbkdf2Salt?: string
): Promise<{ gistId: string; etag?: string; gistUrl?: string }> {
  if (!config.githubToken) {
    throw new Error('Falta el Token de GitHub para sincronizar');
  }

  // 1. Serializar JSON plano y calcular hashes deterministas
  const profilesJson = JSON.stringify(payload.profiles, null, 2);
  const historyJson = JSON.stringify(payload.history, null, 2);
  const favoritesJson = JSON.stringify(payload.favorites, null, 2);
  const settingsJson = JSON.stringify(payload.settings, null, 2);

  const fileHashes = {
    profiles: await computeSha256(profilesJson),
    history: await computeSha256(historyJson),
    favorites: await computeSha256(favoritesJson),
    settings: await computeSha256(settingsJson),
  };

  payload.syncMeta.fileHashes = fileHashes;
  payload.syncMeta.lastModifiedAt = new Date().toISOString();

  // 2. Cifrar si el cifrado está activado
  let finalProfilesContent = profilesJson;
  let finalHistoryContent = historyJson;
  let finalFavoritesContent = favoritesJson;
  let finalSettingsContent = settingsJson;

  if (config.encryptionEnabled && sessionDerivedKey) {
    payload.syncMeta.pbkdf2Salt = pbkdf2Salt || payload.syncMeta.pbkdf2Salt;
    finalProfilesContent = await encryptText(profilesJson, sessionDerivedKey);
    finalHistoryContent = await encryptText(historyJson, sessionDerivedKey);
    finalFavoritesContent = await encryptText(favoritesJson, sessionDerivedKey);
    finalSettingsContent = await encryptText(settingsJson, sessionDerivedKey);
  } else {
    // Si no hay cifrado, asegurar que pbkdf2Salt sea undefined
    payload.syncMeta.pbkdf2Salt = undefined;
  }

  const syncMetaJson = JSON.stringify(payload.syncMeta, null, 2);

  const gistFilesPayload: Record<string, { content: string }> = {
    'sync_meta.json': { content: syncMetaJson },
    'profiles.json': { content: finalProfilesContent },
    'history.json': { content: finalHistoryContent },
    'favorites.json': { content: finalFavoritesContent },
    'settings.json': { content: finalSettingsContent },
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
