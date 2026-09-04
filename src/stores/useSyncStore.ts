import { create } from 'zustand';
import type {
  GistSyncConfig,
  GistFilesPayload,
  SyncMeta,
  UserProfile,
  HistoryEntry,
  AnimeResult,
  TombstoneItem,
  HistoryTombstone,
} from '@/types';
import {
  saveSecureSecret,
  getSecureSecret,
  deleteSecureSecret,
  getSyncConfig,
  setSyncConfig,
  getAllSyncConfig,
  getAllProfiles,
  upsertProfile,
  getTombstones,
  cleanupOldTombstones,
} from '@/services/profileService';
import {
  getAllHistory,
  getAllFavoritesForSync,
  getAllSettings,
  setSetting,
  upsertHistory,
  batchUpsertHistory,
  removeHistoryBatch,
  addFavorite,
  batchAddFavorites,
  removeFavorite,
} from '@/services/storageService';
import {
  CURRENT_SCHEMA_VERSION,
  fetchGistData,
  createOrUpdateGist,
  mergeSyncData,
  exportPayloadToJsonString,
  importPayloadFromJsonString,
  GistNotFoundError,
  NeedPinForDecryptionError,
  computePayloadHashes,
  areHashesEqual,
  isLocalDataEmpty,
  getCurrentDevicePlatform,
  findExistingGist,
  getCalibratedTimestamp,
  makeHistoryCanonicalKey,
  makeHistoryAnimeKey,
  isLocalFileHistory,
} from '@/services/syncService';
import {
  deriveKeyFromPin,
  generateRandomSalt,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '@/services/cryptoService';
import { CURRENT_VERSION } from '@/services/updateService';

interface SyncState {
  config: GistSyncConfig;
  isSyncing: boolean;
  syncStatus: 'idle' | 'success' | 'error' | 'not_modified';
  lastError: string | null;
  isSyncPausedByLocalClear: boolean;

  // Manejo de PIN y CryptoKey en RAM
  isPinModalOpen: boolean;
  pinModalMode: 'unlock' | 'setup' | 'disable';
  pinResolve: ((pin: string | null) => void) | null;
  sessionDerivedKey: CryptoKey | null;

  // Acciones
  initSync: () => Promise<void>;
  saveToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
  linkExistingGist: (gistId: string) => Promise<void>;
  pauseSyncByLocalClear: () => Promise<void>;
  resumeSync: () => Promise<void>;
  updateConfig: (partial: Partial<GistSyncConfig>) => Promise<void>;
  requestPin: (mode: 'unlock' | 'setup' | 'disable') => Promise<string | null>;
  submitPin: (pin: string) => void;
  cancelPin: () => void;
  syncNow: () => Promise<void>;
  triggerDebouncedSync: () => void;
  exportBackupFile: () => Promise<void>;
  importBackupFile: (jsonString: string) => Promise<void>;
  enableEncryption: (pin: string) => Promise<void>;
  disableEncryption: () => Promise<void>;
}

let autoSyncTimeout: any = null;
let periodicSyncInterval: any = null;
let cachedRemoteSettingsDesktop: Record<string, string> = {};
let cachedRemoteSettingsMobile: Record<string, string> = {};
let cachedRemoteDevices: Record<string, { lastSyncAt: string; appVersion: string }> = {};

function setupPeriodicSync(get: () => SyncState) {
  if (periodicSyncInterval) {
    clearInterval(periodicSyncInterval);
    periodicSyncInterval = null;
  }
  const { config } = get();
  // Si no hay token, no hay gist o la sincronización automática está desmarcada, no se programa ningún intervalo
  if (!config.autoSync || !config.githubToken || !config.gistId) {
    return;
  }

  // Sincronizar automáticamente cada 15 minutos en background (solo comprueba ETag 304 ligero)
  periodicSyncInterval = setInterval(() => {
    const state = get();
    if (state.config.autoSync && state.config.githubToken && state.config.gistId && !state.isSyncing && !state.isSyncPausedByLocalClear) {
      state.syncNow().catch(e => console.warn('Background periodic sync skipped:', e));
    }
  }, 15 * 60 * 1000);
}

async function applyDeletedHistoryTombstonesLocally(
  currentHistory: HistoryEntry[],
  deletedHistory?: HistoryTombstone[]
) {
  if (!deletedHistory || deletedHistory.length === 0 || currentHistory.length === 0) return;
  const graceMarginMs = 5000;
  const idsToDelete: string[] = [];

  for (const h of currentHistory) {
    const wTime = new Date(h.watchedAt).getTime();
    for (const dt of deletedHistory) {
      const dTime = new Date(dt.deletedAt).getTime();
      if (dt.type === 'clear' && dt.profileId === (h.profileId || 'default') && wTime <= dTime + graceMarginMs) {
        idsToDelete.push(h.id);
        break;
      }
      if (dt.type === 'anime' && dt.key === makeHistoryAnimeKey(h) && wTime <= dTime + graceMarginMs) {
        idsToDelete.push(h.id);
        break;
      }
      if (dt.type === 'episode' && dt.key === makeHistoryCanonicalKey(h) && wTime <= dTime + graceMarginMs) {
        idsToDelete.push(h.id);
        break;
      }
    }
  }

  if (idsToDelete.length > 0) {
    try {
      await removeHistoryBatch(idsToDelete);
    } catch (e) {
      console.warn('[AniCS Sync] Error eliminando historial suprimido por lápidas:', e);
    }
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  config: {
    githubToken: '',
    gistId: '',
    lastEtag: '',
    autoSync: false,
    encryptionEnabled: false,
    lastSyncAt: '',
    gistUrl: '',
  },
  isSyncing: false,
  syncStatus: 'idle',
  lastError: null,
  isSyncPausedByLocalClear: false,

  isPinModalOpen: false,
  pinModalMode: 'unlock',
  pinResolve: null,
  sessionDerivedKey: null,

  initSync: async () => {
    try {
      const [token, saltB64, configMap] = await Promise.all([
        getSecureSecret('github_token'),
        getSecureSecret('pbkdf2_salt'),
        getAllSyncConfig().catch(() => ({} as Record<string, string>)),
      ]);

      const gistId = configMap['gist_id'] || '';
      const lastEtag = configMap['last_etag'] || '';
      const autoSync = configMap['auto_sync_enabled'] === 'true';
      const encryptionEnabled = configMap['encryption_enabled'] === 'true';
      const lastSyncAt = configMap['last_sync_at'] || '';
      const gistUrl = configMap['gist_url'] || (gistId ? `https://gist.github.com/${gistId}` : '');
      const isPaused = configMap['sync_paused_by_clear'] === 'true';

      set({
        config: {
          githubToken: token || '',
          gistId,
          lastEtag,
          autoSync,
          encryptionEnabled,
          lastSyncAt,
          gistUrl,
        },
        isSyncPausedByLocalClear: isPaused,
      });

      setupPeriodicSync(get);

      // Si autoSync está habilitado y hay token + gistId (y no está en pausa), hacer verificación inicial
      if (token && gistId && autoSync && !isPaused) {
        get().syncNow().catch(e => console.warn('Background initial sync skipped:', e));
      }
    } catch (e) {
      console.warn('Error inicializando sync config:', e);
    }
  },

  saveToken: async (token: string) => {
    const trimmed = token.trim();
    if (trimmed) {
      await saveSecureSecret('github_token', trimmed);
      set(state => ({ config: { ...state.config, githubToken: trimmed } }));

      // Si no tenemos gistId configurado, intentar auto-descubrir uno existente
      if (!get().config.gistId) {
        try {
          const found = await findExistingGist(trimmed);
          if (found) {
            await get().updateConfig({
              gistId: found.gistId,
              gistUrl: `https://gist.github.com/${found.gistId}`,
            });
            console.log(`[AniCS Sync] Gist existente detectado y vinculado: ${found.gistId}`);
            // Descargar y sincronizar datos inmediatamente tras vincular el Gist
            get().syncNow().catch(e => console.warn('[AniCS Sync] Error en sincronización inicial:', e));
          }
        } catch (e) {
          console.warn('[AniCS Sync] Fallo al buscar Gist existente:', e);
        }
      } else {
        // Si ya teníamos gistId configurado, sincronizar con el token actualizado
        get().syncNow().catch(e => console.warn('[AniCS Sync] Error sincronizando con nuevo token:', e));
      }
    } else {
      await deleteSecureSecret('github_token');
      set(state => ({ config: { ...state.config, githubToken: '' } }));
    }
    setupPeriodicSync(get);
  },

  clearToken: async () => {
    if (autoSyncTimeout) {
      clearTimeout(autoSyncTimeout);
      autoSyncTimeout = null;
    }
    if (periodicSyncInterval) {
      clearInterval(periodicSyncInterval);
      periodicSyncInterval = null;
    }
    await deleteSecureSecret('github_token');
    await deleteSecureSecret('pbkdf2_salt');
    await setSyncConfig('gist_id', '');
    await setSyncConfig('last_etag', '');
    set(state => ({
      config: {
        ...state.config,
        githubToken: '',
        gistId: '',
        lastEtag: '',
        gistUrl: '',
      },
      sessionDerivedKey: null,
    }));
  },

  linkExistingGist: async (gistId: string) => {
    const trimmed = gistId.trim();
    await get().updateConfig({
      gistId: trimmed,
      gistUrl: trimmed ? `https://gist.github.com/${trimmed}` : '',
      lastEtag: '',
    });
    await setSyncConfig('last_synced_hashes', '');
    if (trimmed && get().config.githubToken) {
      await get().syncNow();
    }
  },

  pauseSyncByLocalClear: async () => {
    await setSyncConfig('sync_paused_by_clear', 'true');
    await get().updateConfig({ autoSync: false });
    set({ isSyncPausedByLocalClear: true });
  },

  resumeSync: async () => {
    await setSyncConfig('sync_paused_by_clear', 'false');
    await get().updateConfig({ autoSync: true });
    set({ isSyncPausedByLocalClear: false });
    await get().syncNow();
  },

  updateConfig: async (partial: Partial<GistSyncConfig>) => {
    const newConfig = { ...get().config, ...partial };
    if (partial.gistId !== undefined) await setSyncConfig('gist_id', partial.gistId);
    if (partial.lastEtag !== undefined) await setSyncConfig('last_etag', partial.lastEtag);
    if (partial.autoSync !== undefined) await setSyncConfig('auto_sync_enabled', partial.autoSync ? 'true' : 'false');
    if (partial.encryptionEnabled !== undefined) await setSyncConfig('encryption_enabled', partial.encryptionEnabled ? 'true' : 'false');
    if (partial.lastSyncAt !== undefined) await setSyncConfig('last_sync_at', partial.lastSyncAt);
    if (partial.gistUrl !== undefined) await setSyncConfig('gist_url', partial.gistUrl);

    set({ config: newConfig });
    setupPeriodicSync(get);
  },

  requestPin: (mode: 'unlock' | 'setup' | 'disable') => {
    return new Promise<string | null>(resolve => {
      set({
        isPinModalOpen: true,
        pinModalMode: mode,
        pinResolve: resolve,
      });
    });
  },

  submitPin: (pin: string) => {
    const resolve = get().pinResolve;
    set({ isPinModalOpen: false, pinResolve: null });
    if (resolve) resolve(pin);
  },

  cancelPin: () => {
    const resolve = get().pinResolve;
    set({ isPinModalOpen: false, pinResolve: null });
    if (resolve) resolve(null);
  },

  syncNow: async () => {
    const { config, isSyncing, isSyncPausedByLocalClear } = get();
    if (isSyncing) return;
    if (isSyncPausedByLocalClear) {
      console.log('[AniCS Sync] Sincronización en pausa debido a limpieza local previa.');
      return;
    }
    if (!config.githubToken) {
      set({ syncStatus: 'error', lastError: 'No hay token de GitHub configurado' });
      return;
    }

    set({ isSyncing: true, lastError: null, syncStatus: 'idle' });

    try {
      // 1. Obtener o derivar clave de sesión si el cifrado está activado
      let currentKey = get().sessionDerivedKey;
      let saltB64: string | undefined = undefined;

      if (config.encryptionEnabled) {
        saltB64 = (await getSecureSecret('pbkdf2_salt')) || (await getSecureSecret('sync_salt')) || undefined;
        if (!saltB64) {
          const newSalt = generateRandomSalt(16);
          saltB64 = uint8ArrayToBase64(newSalt);
          await saveSecureSecret('pbkdf2_salt', saltB64);
        }

        if (!currentKey) {
          const pin = await get().requestPin('unlock');
          if (!pin) {
            set({ isSyncing: false, syncStatus: 'error', lastError: 'Se requiere el PIN para sincronizar datos cifrados' });
            return;
          }
          const saltBytes = base64ToUint8Array(saltB64);
          currentKey = await deriveKeyFromPin(pin, saltBytes);
          set({ sessionDerivedKey: currentKey });
        }
      }

      // 2. Cargar datos locales de SQLite
      const [profiles, history, favorites, tombstones, settings] = await Promise.all([
        getAllProfiles(),
        getAllHistory(),
        getAllFavoritesForSync(),
        getTombstones(),
        getAllSettings(),
      ]);

      // Filtrar historial local para que solo los animes de streaming online se sincronicen en la nube
      // (los archivos reproducidos localmente en disco como C:\... o /storage/... no deben subirse a la nube)
      const onlineHistory = history.filter(h => !isLocalFileHistory(h));

      // Calcular hashes deterministas del estado local ANTES de la llamada de red
      const localHashes = await computePayloadHashes({
        profiles,
        history: onlineHistory,
        favorites,
        settings,
      });

      const currentPlatform = getCurrentDevicePlatform();
      const isAndroid = currentPlatform === 'android';

      const localPayload: GistFilesPayload = {
        syncMeta: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          appVersion: CURRENT_VERSION,
          lastModifiedAt: getCalibratedTimestamp(),
          lastModifiedDevice: currentPlatform,
          pbkdf2Salt: config.encryptionEnabled ? saltB64 : undefined,
          fileHashes: localHashes,
          devices: {
            ...cachedRemoteDevices,
            [isAndroid ? 'android' : 'windows']: {
              lastSyncAt: getCalibratedTimestamp(),
              appVersion: CURRENT_VERSION,
            },
          },
          deletedFavorites: tombstones.filter((t: TombstoneItem) => t.entityType === 'favorite').map((t: TombstoneItem) => ({
            url: t.entityId,
            profileId: t.profileId,
            deletedAt: t.deletedAt,
          })),
          deletedProfiles: tombstones.filter((t: TombstoneItem) => t.entityType === 'profile').map((t: TombstoneItem) => ({
            profileId: t.profileId,
            deletedAt: t.deletedAt,
          })),
          deletedHistory: tombstones
            .filter((t: TombstoneItem) => t.entityType.startsWith('history_'))
            .map((t: TombstoneItem) => ({
              type: t.entityType.replace('history_', '') as 'episode' | 'anime' | 'clear',
              key: t.entityId,
              profileId: t.profileId,
              deletedAt: t.deletedAt,
            })),
        },
        profiles,
        history: onlineHistory,
        favorites,
        settings,
        settingsDesktop: isAndroid ? cachedRemoteSettingsDesktop : settings,
        settingsMobile: isAndroid ? settings : cachedRemoteSettingsMobile,
      };

      const lastHashesJson = await getSyncConfig('last_synced_hashes').catch(() => '');
      let lastSyncedHashes: Record<string, string> | null = null;
      if (lastHashesJson) {
        try {
          lastSyncedHashes = JSON.parse(lastHashesJson);
        } catch {}
      }
      const hasLocalPendingChanges = !lastSyncedHashes || !areHashesEqual(localHashes, lastSyncedHashes);
      const isLocalEmpty = isLocalDataEmpty({ profiles, history: onlineHistory, favorites });

      // 4. Si ya existe un Gist remoto configurado
      if (config.gistId) {
        let fetchResult;
        try {
          fetchResult = await fetchGistData(config, currentKey);
        } catch (e: any) {
          if (e instanceof NeedPinForDecryptionError || e?.message === 'NEED_PIN_FOR_DECRYPTION') {
            const salt = (e instanceof NeedPinForDecryptionError && e.salt) || saltB64;
            const pin = await get().requestPin('unlock');
            if (!pin) {
              set({ isSyncing: false, syncStatus: 'error', lastError: 'Se requiere el PIN para sincronizar y descifrar los datos remotos' });
              return;
            }
            if (!salt) {
              set({ isSyncing: false, syncStatus: 'error', lastError: 'Salt PBKDF2 ausente en la nube' });
              return;
            }
            const saltBytes = base64ToUint8Array(salt);
            currentKey = await deriveKeyFromPin(pin, saltBytes);
            set({ sessionDerivedKey: currentKey });
            saltB64 = salt;
            await saveSecureSecret('pbkdf2_salt', salt);
            await get().updateConfig({ encryptionEnabled: true });

            // Reintentar la descarga con la clave recién desbloqueada
            fetchResult = await fetchGistData(get().config, currentKey);
          } else if (e instanceof GistNotFoundError) {
            console.warn('Gist no encontrado (404), recreando...');
            await get().updateConfig({ gistId: '', lastEtag: '' });
            fetchResult = null;
          } else {
            throw e;
          }
        }

        if (fetchResult) {
          // Caso A: El Gist remoto no cambió en GitHub (HTTP 304 Not Modified)
          if (fetchResult.notModified) {
            if (!hasLocalPendingChanges) {
              set({ isSyncing: false, syncStatus: 'not_modified' });
              return;
            }
            // Solo local cambió -> Subir cambios locales
            const uploadResult = await createOrUpdateGist(get().config, localPayload, currentKey, saltB64);
            const nowIso = getCalibratedTimestamp();
            await get().updateConfig({
              lastEtag: uploadResult.etag,
              lastSyncAt: nowIso,
              gistUrl: uploadResult.gistUrl || `https://gist.github.com/${uploadResult.gistId}`,
            });
            await setSyncConfig('last_synced_hashes', JSON.stringify(uploadResult.hashes));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('anics:sync-completed'));
            }
            set({ isSyncing: false, syncStatus: 'success' });
            return;
          }

          // Caso B: Se obtuvieron datos remotos desde GitHub (HTTP 200)
          if (fetchResult.payload) {
            const remotePayload = fetchResult.payload;
            const remoteHashes = remotePayload.syncMeta.fileHashes;

            // Almacenar en caché las configuraciones y dispositivos del Gist
            cachedRemoteSettingsDesktop = remotePayload.settingsDesktop || {};
            cachedRemoteSettingsMobile = remotePayload.settingsMobile || {};
            cachedRemoteDevices = remotePayload.syncMeta?.devices || {};

            // Si local es exactamente idéntico al remoto -> Cero escrituras
            if (areHashesEqual(localHashes, remoteHashes)) {
              await setSyncConfig('last_synced_hashes', JSON.stringify(localHashes));
              await get().updateConfig({
                lastEtag: fetchResult.etag,
                lastSyncAt: getCalibratedTimestamp(),
              });
              set({ isSyncing: false, syncStatus: 'not_modified' });
              return;
            }

            // Subcaso B.1: Si la base local está vacía (dispositivo nuevo) o no tenía cambios locales pendientes:
            // Descargar e importar datos remotos a SQLite sin subir nada a GitHub (0 escrituras)
            if (isLocalEmpty || !hasLocalPendingChanges) {
              for (const p of remotePayload.profiles) {
                await upsertProfile(p);
              }
              await applyDeletedHistoryTombstonesLocally(history, remotePayload.syncMeta?.deletedHistory);
              if (remotePayload.history.length > 0) {
                await batchUpsertHistory(remotePayload.history);
              }
              if (remotePayload.favorites.length > 0) {
                await batchAddFavorites(remotePayload.favorites);
              }
              for (const del of remotePayload.syncMeta?.deletedFavorites || []) {
                await removeFavorite(del.url, del.profileId);
              }
              await cleanupOldTombstones(30);

              // Aplicar configuraciones de plataforma a SQLite
              const platformSettings = isAndroid
                ? remotePayload.settingsMobile
                : remotePayload.settingsDesktop;
              const settingsToApply = (platformSettings && Object.keys(platformSettings).length > 0)
                ? platformSettings
                : remotePayload.settings;

              if (settingsToApply && Object.keys(settingsToApply).length > 0) {
                for (const [k, v] of Object.entries(settingsToApply)) {
                  try {
                    // Evitar transferir rutas de disco incompatibles entre Windows y Android
                    if (k === 'download_dir') {
                      if (isAndroid && /^[a-zA-Z]:[\\/]/.test(v)) continue;
                      if (!isAndroid && (v.startsWith('/storage') || v.startsWith('/data'))) continue;
                    }
                    await setSetting(k, v);
                  } catch (e) {
                    console.warn(`[AniCS Sync] No se pudo guardar configuración ${k}:`, e);
                  }
                }
              }

              await setSyncConfig('last_synced_hashes', JSON.stringify(remoteHashes));
              await get().updateConfig({
                lastEtag: fetchResult.etag,
                lastSyncAt: getCalibratedTimestamp(),
              });

              try {
                const { useProfileStore } = await import('@/stores/useProfileStore');
                await useProfileStore.getState().loadProfiles();
              } catch {}

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('anics:sync-completed'));
              }

              set({ isSyncing: false, syncStatus: 'success' });
              return;
            }

            // Subcaso B.2: Ambos dispositivos tienen cambios concurrentes -> Fusionar y subir (1 escritura)
            const mergedPayload = mergeSyncData(localPayload, remotePayload);

            for (const p of mergedPayload.profiles) {
              await upsertProfile(p);
            }
            await applyDeletedHistoryTombstonesLocally(history, mergedPayload.syncMeta?.deletedHistory);
            if (mergedPayload.history.length > 0) {
              await batchUpsertHistory(mergedPayload.history);
            }
            if (mergedPayload.favorites.length > 0) {
              await batchAddFavorites(mergedPayload.favorites);
            }
            for (const del of mergedPayload.syncMeta?.deletedFavorites || []) {
              await removeFavorite(del.url, del.profileId);
            }
            await cleanupOldTombstones(30);

            // Aplicar configuraciones de plataforma en SQLite
            const platformSettings = isAndroid
              ? mergedPayload.settingsMobile
              : mergedPayload.settingsDesktop;
            const settingsToApply = (platformSettings && Object.keys(platformSettings).length > 0)
              ? platformSettings
              : mergedPayload.settings;

            if (settingsToApply && Object.keys(settingsToApply).length > 0) {
              for (const [k, v] of Object.entries(settingsToApply)) {
                try {
                  if (k === 'download_dir') {
                    if (isAndroid && /^[a-zA-Z]:[\\/]/.test(v)) continue;
                    if (!isAndroid && (v.startsWith('/storage') || v.startsWith('/data'))) continue;
                  }
                  await setSetting(k, v);
                } catch (e) {
                  console.warn(`[AniCS Sync] No se pudo guardar configuración ${k}:`, e);
                }
              }
            }

            const uploadResult = await createOrUpdateGist(get().config, mergedPayload, currentKey, saltB64);
            const nowIso = getCalibratedTimestamp();
            await get().updateConfig({
              lastEtag: uploadResult.etag,
              lastSyncAt: nowIso,
              gistUrl: uploadResult.gistUrl || `https://gist.github.com/${uploadResult.gistId}`,
            });
            await setSyncConfig('last_synced_hashes', JSON.stringify(uploadResult.hashes));

            try {
              const { useProfileStore } = await import('@/stores/useProfileStore');
              await useProfileStore.getState().loadProfiles();
            } catch {}

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('anics:sync-completed'));
            }

            set({ isSyncing: false, syncStatus: 'success' });
            return;
          }
        }
      }

      // 5. Si no hay gistId (primer sync o segundo dispositivo configurando el mismo token)
      // Buscar primero si ya existe un Gist AniCS en GitHub para vincularlo automáticamente
      if (config.githubToken) {
        try {
          const found = await findExistingGist(config.githubToken);
          if (found) {
            console.log(`[AniCS Sync] Gist existente detectado en la nube: ${found.gistId}. Vinculando...`);
            await get().updateConfig({
              gistId: found.gistId,
              gistUrl: `https://gist.github.com/${found.gistId}`,
            });
            set({ isSyncing: false });
            return await get().syncNow();
          }
        } catch (e) {
          console.warn('[AniCS Sync] Fallo al buscar Gist existente en syncNow:', e);
        }
      }

      const uploadResult = await createOrUpdateGist(get().config, localPayload, currentKey, saltB64);
      const nowIso = getCalibratedTimestamp();

      await get().updateConfig({
        gistId: uploadResult.gistId,
        lastEtag: uploadResult.etag,
        lastSyncAt: nowIso,
        gistUrl: uploadResult.gistUrl || `https://gist.github.com/${uploadResult.gistId}`,
      });

      await setSyncConfig('last_synced_hashes', JSON.stringify(uploadResult.hashes));

      try {
        const { useProfileStore } = await import('@/stores/useProfileStore');
        await useProfileStore.getState().loadProfiles();
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('anics:sync-completed'));
      }

      set({ isSyncing: false, syncStatus: 'success' });
    } catch (e: any) {
      console.error('Error durante la sincronización:', e);
      const errMsg = typeof e === 'string'
        ? e
        : (e?.message || (typeof e === 'object' ? JSON.stringify(e) : String(e)));
      set({
        isSyncing: false,
        syncStatus: 'error',
        lastError: errMsg || 'Error desconocido al sincronizar',
      });
    }
  },

  triggerDebouncedSync: () => {
    const { config } = get();
    if (!config.autoSync || !config.githubToken || !config.gistId) return;

    if (autoSyncTimeout) {
      clearTimeout(autoSyncTimeout);
    }

    autoSyncTimeout = setTimeout(() => {
      get().syncNow().catch(e => console.warn('Debounced AutoSync failed:', e));
    }, 30_000); // 30 segundos de debounce
  },

  exportBackupFile: async () => {
    const [profiles, history, favorites, tombstones, settings] = await Promise.all([
      getAllProfiles(),
      getAllHistory(),
      getAllFavoritesForSync(),
      getTombstones(),
      getAllSettings(),
    ]);

    const payload: GistFilesPayload = {
      syncMeta: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: CURRENT_VERSION,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedDevice: 'windows',
        fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
        deletedFavorites: tombstones.filter((t: TombstoneItem) => t.entityType === 'favorite').map((t: TombstoneItem) => ({
          url: t.entityId,
          profileId: t.profileId,
          deletedAt: t.deletedAt,
        })),
        deletedProfiles: [],
      },
      profiles,
      history,
      favorites,
      settings,
    };

    const jsonStr = exportPayloadToJsonString(payload);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `anics_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  importBackupFile: async (jsonString: string) => {
    set({ isSyncing: true, lastError: null });
    try {
      const imported = importPayloadFromJsonString(jsonString);

      for (const p of imported.profiles) {
        await upsertProfile(p);
      }
      for (const h of imported.history) {
        await upsertHistory(h);
      }
      for (const f of imported.favorites) {
        await addFavorite(f, f.profileId);
      }

      // Recargar perfiles y emitir evento
      try {
        const { useProfileStore } = await import('@/stores/useProfileStore');
        await useProfileStore.getState().loadProfiles();
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('anics:sync-completed'));
      }

      set({ isSyncing: false, syncStatus: 'success' });
    } catch (e: any) {
      set({ isSyncing: false, syncStatus: 'error', lastError: e?.message || 'Archivo de respaldo inválido' });
      throw e;
    }
  },

  enableEncryption: async (pin: string) => {
    const salt = generateRandomSalt(16);
    const saltB64 = uint8ArrayToBase64(salt);
    const key = await deriveKeyFromPin(pin, salt);

    await saveSecureSecret('pbkdf2_salt', saltB64);
    await get().updateConfig({ encryptionEnabled: true });
    set({ sessionDerivedKey: key });

    // Forzar resync con cifrado
    await get().syncNow();
  },

  disableEncryption: async () => {
    await deleteSecureSecret('pbkdf2_salt');
    await get().updateConfig({ encryptionEnabled: false });
    set({ sessionDerivedKey: null });

    // Forzar resync sin cifrado (JSON plano)
    await get().syncNow();
  },
}));
