import { create } from 'zustand';
import type {
  GistSyncConfig,
  GistFilesPayload,
  SyncMeta,
  UserProfile,
  HistoryEntry,
  AnimeResult,
  TombstoneItem,
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
  upsertHistory,
  addFavorite,
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
} from '@/services/syncService';
import {
  deriveKeyFromPin,
  generateRandomSalt,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '@/services/cryptoService';

interface SyncState {
  config: GistSyncConfig;
  isSyncing: boolean;
  syncStatus: 'idle' | 'success' | 'error' | 'not_modified';
  lastError: string | null;

  // Manejo de PIN y CryptoKey en RAM
  isPinModalOpen: boolean;
  pinModalMode: 'unlock' | 'setup' | 'disable';
  pinResolve: ((pin: string | null) => void) | null;
  sessionDerivedKey: CryptoKey | null;

  // Acciones
  initSync: () => Promise<void>;
  saveToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
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
    if (state.config.autoSync && state.config.githubToken && state.config.gistId && !state.isSyncing) {
      state.syncNow().catch(e => console.warn('Background periodic sync skipped:', e));
    }
  }, 15 * 60 * 1000);
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
      });

      setupPeriodicSync(get);

      // Si autoSync está habilitado y hay token + gistId, hacer verificación inicial
      if (token && gistId && autoSync) {
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
    } else {
      await deleteSecureSecret('github_token');
    }
    set(state => ({ config: { ...state.config, githubToken: trimmed } }));
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
    const { config, isSyncing } = get();
    if (isSyncing) return;
    if (!config.githubToken) {
      set({ syncStatus: 'error', lastError: 'No hay token de GitHub configurado' });
      return;
    }

    set({ isSyncing: true, lastError: null, syncStatus: 'idle' });

    try {
      // 1. Obtener clave de cifrado si está habilitado y aún no está en RAM
      let currentKey = get().sessionDerivedKey;
      let saltB64: string | undefined = undefined;

      if (config.encryptionEnabled) {
        saltB64 = (await getSecureSecret('pbkdf2_salt')) || undefined;
        if (!saltB64) {
          // Generar nuevo salt si no existía
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

      const localPayload: GistFilesPayload = {
        syncMeta: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          appVersion: '0.1.9',
          lastModifiedAt: new Date().toISOString(),
          lastModifiedDevice: 'windows',
          pbkdf2Salt: config.encryptionEnabled ? saltB64 : undefined,
          fileHashes: { profiles: '', history: '', favorites: '', settings: '' },
          deletedFavorites: tombstones.filter((t: TombstoneItem) => t.entityType === 'favorite').map((t: TombstoneItem) => ({
            url: t.entityId,
            profileId: t.profileId,
            deletedAt: t.deletedAt,
          })),
          deletedProfiles: tombstones.filter((t: TombstoneItem) => t.entityType === 'profile').map((t: TombstoneItem) => ({
            profileId: t.profileId,
            deletedAt: t.deletedAt,
          })),
        },
        profiles,
        history,
        favorites,
        settings,
      };

      // 3. Descargar y combinar con el Gist si ya existe
      let finalPayload = localPayload;

      if (config.gistId) {
        try {
          const fetchResult = await fetchGistData(config, currentKey);

          if (fetchResult.notModified) {
            // El Gist remoto no cambió en GitHub.
            // Si el estado local tiene cambios no subidos, procedemos a subir localPayload;
            // de lo contrario, marcamos como "Al día"
            const localHashes = localPayload.syncMeta.fileHashes;
            const lastHashesJson = await getSyncConfig('last_synced_hashes').catch(() => '');
            let hasLocalChanges = true;
            if (lastHashesJson) {
              try {
                const parsed = JSON.parse(lastHashesJson);
                if (
                  parsed.profiles === localHashes.profiles &&
                  parsed.history === localHashes.history &&
                  parsed.favorites === localHashes.favorites &&
                  parsed.settings === localHashes.settings
                ) {
                  hasLocalChanges = false;
                }
              } catch {}
            }

            if (!hasLocalChanges) {
              set({ isSyncing: false, syncStatus: 'not_modified' });
              return;
            }
          } else if (fetchResult.payload) {
            finalPayload = mergeSyncData(localPayload, fetchResult.payload);

            // Aplicar datos combinados a SQLite local
            for (const p of finalPayload.profiles) {
              await upsertProfile(p);
            }
            for (const h of finalPayload.history) {
              await upsertHistory(h);
            }
            for (const f of finalPayload.favorites) {
              await addFavorite(f, f.profileId);
            }
            // Purgar favoritos eliminados por tombstones
            for (const del of finalPayload.syncMeta.deletedFavorites) {
              await removeFavorite(del.url, del.profileId);
            }
            await cleanupOldTombstones(30);
          }
        } catch (e: any) {
          if (e instanceof GistNotFoundError) {
            console.warn('Gist no encontrado (404), recreando...');
            await get().updateConfig({ gistId: '', lastEtag: '' });
          } else {
            throw e;
          }
        }
      }

      // 4. Subir datos al Gist
      const result = await createOrUpdateGist(get().config, finalPayload, currentKey, saltB64);
      const nowIso = new Date().toISOString();

      await get().updateConfig({
        gistId: result.gistId,
        lastEtag: result.etag,
        lastSyncAt: nowIso,
        gistUrl: result.gistUrl || `https://gist.github.com/${result.gistId}`,
      });

      // Guardar hashes sincronizados para evitar subidas redundantes
      await setSyncConfig('last_synced_hashes', JSON.stringify(finalPayload.syncMeta.fileHashes));

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
        appVersion: '0.1.9',
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
        await addFavorite(f, (f as any).profileId);
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
