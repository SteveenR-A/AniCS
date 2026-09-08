import { create } from 'zustand';
import type {
  CloudSyncConfig,
  CloudSyncPayload,
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
  deleteProfile,
  getTombstones,
  cleanupOldTombstones,
} from '@/services/profileService';
import {
  getAllHistory,
  getAllFavoritesForSync,
  getAllSettings,
  setSetting,
  batchUpsertHistory,
  batchAddFavorites,
  removeFavorite,
} from '@/services/storageService';
import {
  CURRENT_SCHEMA_VERSION,
  fetchFirestoreData,
  saveFirestoreData,
  clearAllFirestoreData,
  mergeSyncData,
  exportPayloadToJsonString,
  importPayloadFromJsonString,
  NeedPinForDecryptionError,
  computePayloadHashes,
  areHashesEqual,
  isLocalDataEmpty,
  getCurrentDevicePlatform,
  getCalibratedTimestamp,
  isLocalFileHistory,
} from '@/services/syncService';
import {
  loginWithGoogle as fbLoginGoogle,
  loginWithGoogleBrowser,
  loginWithEmail as fbLoginEmail,
  registerWithEmail as fbRegisterEmail,
  logoutFirebase as fbLogout,
  subscribeToAuthChanges,
  getCurrentFirebaseUser,
} from '@/services/firebase/authService';
import { AniCSAnalytics } from '@/services/firebase/analyticsService';
import {
  deriveKeyFromPin,
  generateRandomSalt,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from '@/services/cryptoService';
import { CURRENT_VERSION } from '@/services/updateService';
import { FEATURE_FLAGS } from '@/config/features';

interface SyncState {
  config: CloudSyncConfig;
  isSyncing: boolean;
  syncStatus: 'idle' | 'success' | 'error' | 'not_modified';
  lastError: string | null;
  isSyncPausedByLocalClear: boolean;

  // Manejo de PIN y CryptoKey en RAM
  isPinModalOpen: boolean;
  pinModalMode: 'unlock' | 'setup' | 'disable';
  pinResolve: ((pin: string | null) => void) | null;
  sessionDerivedKey: CryptoKey | null;

  // Acciones de autenticación Firebase
  initSync: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  clearToken: () => Promise<void>;

  // Acciones de sincronización
  pauseSyncByLocalClear: () => Promise<void>;
  resumeSync: () => Promise<void>;
  updateConfig: (partial: Partial<CloudSyncConfig>) => Promise<void>;
  requestPin: (mode: 'unlock' | 'setup' | 'disable') => Promise<string | null>;
  submitPin: (pin: string) => void;
  cancelPin: () => void;
  syncNow: () => Promise<void>;
  triggerDebouncedSync: () => void;
  exportBackupFile: () => Promise<void>;
  importBackupFile: (jsonString: string) => Promise<void>;
  enableEncryption: (pin: string) => Promise<void>;
  disableEncryption: () => Promise<void>;
  clearCloudData: () => Promise<void>;
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
  if (!config.autoSync || !config.userId) {
    return;
  }

  // Sincronizar automáticamente cada 15 minutos en segundo plano
  periodicSyncInterval = setInterval(() => {
    const state = get();
    if (state.config.autoSync && state.config.userId && !state.isSyncing && !state.isSyncPausedByLocalClear) {
      state.syncNow().catch((e) => console.warn('Background periodic sync skipped:', e));
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

  const maxClearTimeByProfile = new Map<string, number>();
  const maxAnimeTimeByKey = new Map<string, number>();
  const maxEpisodeTimeByKey = new Map<string, number>();

  for (const dt of deletedHistory) {
    const dTime = new Date(dt.deletedAt).getTime() + graceMarginMs;
    if (dt.type === 'clear' && dt.profileId) {
      const existing = maxClearTimeByProfile.get(dt.profileId) || 0;
      if (dTime > existing) maxClearTimeByProfile.set(dt.profileId, dTime);
    } else if (dt.type === 'anime' && dt.key) {
      const existing = maxAnimeTimeByKey.get(dt.key) || 0;
      if (dTime > existing) maxAnimeTimeByKey.set(dt.key, dTime);
    } else if (dt.type === 'episode' && dt.key) {
      const existing = maxEpisodeTimeByKey.get(dt.key) || 0;
      if (dTime > existing) maxEpisodeTimeByKey.set(dt.key, dTime);
    }
  }

  for (const h of currentHistory) {
    const wTime = new Date(h.watchedAt).getTime();
    const profileId = h.profileId || 'default';

    const clearTime = maxClearTimeByProfile.get(profileId);
    if (clearTime && wTime <= clearTime) {
      idsToDelete.push(h.id);
      continue;
    }

    const { makeHistoryAnimeKey, makeHistoryCanonicalKey } = await import('@/services/syncService');
    const animeKey = makeHistoryAnimeKey(h);
    const animeTime = maxAnimeTimeByKey.get(animeKey);
    if (animeTime && wTime <= animeTime) {
      idsToDelete.push(h.id);
      continue;
    }

    const epKey = makeHistoryCanonicalKey(h);
    const epTime = maxEpisodeTimeByKey.get(epKey);
    if (epTime && wTime <= epTime) {
      idsToDelete.push(h.id);
      continue;
    }
  }

  if (idsToDelete.length > 0) {
    const { removeHistoryBatch } = await import('@/services/storageService');
    await removeHistoryBatch(idsToDelete);
  }
}

async function handleUserAuthSubscription(user: any) {
  if (!user || !FEATURE_FLAGS.SHOW_SUBSCRIPTION) return;

  try {
    const { useSubscriptionStore } = await import('@/stores/useSubscriptionStore');
    const { useAccountStore } = await import('@/stores/useAccountStore');

    // Consultar estado de suscripción directamente desde Firestore
    const { doc, getDoc } = await import('firebase/firestore');
    const { firestoreDb } = await import('@/services/firebase/firebaseConfig');
    if (firestoreDb && doc && getDoc) {
      const subDocRef = doc(firestoreDb, `users/${user.uid}/subscription/info`);
      const snap = await getDoc(subDocRef);
      if (snap.exists()) {
        const data = snap.data();
        const isVip = Boolean(data?.isVip);
        const plan = data?.plan || (isVip ? 'annual' : null);
        const expiresAt = data?.expiresAt || null;
        useSubscriptionStore.getState().setVipStatus(isVip, plan, expiresAt);
        useAccountStore.getState().addOrUpdateAccount({
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          isVip,
          plan,
        });
        return;
      }
    }

    // Default si no existe subscripción en Firestore
    useSubscriptionStore.getState().setVipStatus(false, null);
    useAccountStore.getState().addOrUpdateAccount({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      isVip: false,
      plan: null,
    });
  } catch (err) {
    console.warn('[AniCS Sync] Error resolviendo suscripción de usuario:', err);
  }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  config: {
    userId: '',
    userEmail: '',
    userDisplayName: '',
    userPhotoUrl: '',
    autoSync: true,
    encryptionEnabled: false,
    lastSyncAt: '',
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
      const configMap = await getAllSyncConfig();
      const autoSync = configMap['auto_sync'] !== '0';
      const encryptionEnabled = configMap['encryption_enabled'] === '1';
      const lastSyncAt = configMap['last_sync_at'] || '';
      const isPaused = configMap['sync_paused_by_clear'] === '1';

      // Restaurar usuario actual si ya había sesión abierta
      const initialUser = getCurrentFirebaseUser();

      set({
        config: {
          userId: initialUser?.uid || '',
          userEmail: initialUser?.email || '',
          userDisplayName: initialUser?.displayName || '',
          userPhotoUrl: initialUser?.photoURL || '',
          autoSync,
          encryptionEnabled,
          lastSyncAt,
        },
        isSyncPausedByLocalClear: isPaused,
      });

async function handleUserAuthSubscription(user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }) {
  try {
    const { useAccountStore } = await import('@/stores/useAccountStore');
    const { useSubscriptionStore } = await import('@/stores/useSubscriptionStore');

    let isVip = false;
    let plan: 'monthly' | 'annual' | null = null;

    const firestoreSub = await useAccountStore.getState().checkFirestoreSubscription(user.uid);
    if (firestoreSub) {
      isVip = firestoreSub.isVip;
      plan = firestoreSub.plan;
    }

    useSubscriptionStore.getState().setVipStatus(isVip, plan);

    useAccountStore.getState().addOrUpdateAccount({
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      photoUrl: user.photoURL || undefined,
      isVip,
      plan,
    });
  } catch (err) {
    console.warn('[AniCS Sync] Error sincronizando cuenta y suscripción:', err);
  }
}

      // Escuchar cambios de autenticación reactivos
      subscribeToAuthChanges(async (user) => {
        const state = get();
        if (user) {
          set({
            config: {
              ...state.config,
              userId: user.uid,
              userEmail: user.email || '',
              userDisplayName: user.displayName || '',
              userPhotoUrl: user.photoURL || '',
            },
          });
          setupPeriodicSync(get);
          await handleUserAuthSubscription(user);

          // Si autoSync está habilitado y no está en pausa, sincronizar al iniciar sesión
          if (state.config.autoSync && !state.isSyncPausedByLocalClear && !state.isSyncing) {
            get().syncNow().catch((e) => console.warn('[AniCS Sync] Error en sincronización inicial:', e));
          }
        } else {
          set({
            config: {
              ...state.config,
              userId: '',
              userEmail: '',
              userDisplayName: '',
              userPhotoUrl: '',
            },
          });
          if (periodicSyncInterval) {
            clearInterval(periodicSyncInterval);
            periodicSyncInterval = null;
          }
        }
      });

      setupPeriodicSync(get);
    } catch (e) {
      console.error('[AniCS Sync] Error en initSync:', e);
    }
  },

  loginWithGoogle: async () => {
    set({ isSyncing: true, lastError: null });
    try {
      let user;
      try {
        user = await loginWithGoogleBrowser();
      } catch (browserErr) {
        console.warn('[AniCS Auth] Browser OAuth fallback a popup:', browserErr);
        user = await fbLoginGoogle();
      }

      set((state) => ({
        config: {
          ...state.config,
          userId: user.uid,
          userEmail: user.email || '',
          userDisplayName: user.displayName || '',
          userPhotoUrl: user.photoURL || '',
        },
        isSyncing: false,
      }));
      await handleUserAuthSubscription(user);
      setupPeriodicSync(get);
      await get().syncNow().catch((e) => console.warn('[AniCS Sync] Error en sincronización post-auth Google:', e));
    } catch (error: any) {
      set({ isSyncing: false, syncStatus: 'error', lastError: error.message || 'Error al iniciar sesión con Google' });
      throw error;
    }
  },

  loginWithEmail: async (email: string, pass: string) => {
    set({ isSyncing: true, lastError: null });
    try {
      const user = await fbLoginEmail(email, pass);
      set((state) => ({
        config: {
          ...state.config,
          userId: user.uid,
          userEmail: user.email || '',
          userDisplayName: user.displayName || '',
          userPhotoUrl: user.photoURL || '',
        },
        isSyncing: false,
      }));
      await handleUserAuthSubscription(user);
      setupPeriodicSync(get);
      await get().syncNow().catch((e) => console.warn('[AniCS Sync] Error en sincronización post-auth Email:', e));
    } catch (error: any) {
      set({ isSyncing: false, syncStatus: 'error', lastError: error.message || 'Error al iniciar sesión' });
      throw error;
    }
  },

  registerWithEmail: async (email: string, pass: string) => {
    set({ isSyncing: true, lastError: null });
    try {
      const user = await fbRegisterEmail(email, pass);
      set((state) => ({
        config: {
          ...state.config,
          userId: user.uid,
          userEmail: user.email || '',
          userDisplayName: user.displayName || '',
          userPhotoUrl: user.photoURL || '',
        },
        isSyncing: false,
      }));
      await handleUserAuthSubscription(user);
      setupPeriodicSync(get);
      await get().syncNow().catch((e) => console.warn('[AniCS Sync] Error en sincronización post-registro:', e));
    } catch (error: any) {
      set({ isSyncing: false, syncStatus: 'error', lastError: error.message || 'Error al registrar usuario' });
      throw error;
    }
  },

  logout: async () => {
    try {
      await fbLogout();
      if (periodicSyncInterval) {
        clearInterval(periodicSyncInterval);
        periodicSyncInterval = null;
      }
      try {
        const { useSubscriptionStore } = await import('@/stores/useSubscriptionStore');
        useSubscriptionStore.getState().setVipStatus(false, null);
      } catch {}
      set((state) => ({
        config: {
          ...state.config,
          userId: '',
          userEmail: '',
          userDisplayName: '',
          userPhotoUrl: '',
        },
        syncStatus: 'idle',
        lastError: null,
      }));
    } catch (error: any) {
      set({ lastError: error.message || 'Error al cerrar sesión' });
      throw error;
    }
  },

  clearToken: async () => {
    await get().logout();
  },

  pauseSyncByLocalClear: async () => {
    set({ isSyncPausedByLocalClear: true });
    await setSyncConfig('sync_paused_by_clear', '1');
  },

  resumeSync: async () => {
    set({ isSyncPausedByLocalClear: false });
    await setSyncConfig('sync_paused_by_clear', '0');
    setupPeriodicSync(get);
  },

  updateConfig: async (partial: Partial<CloudSyncConfig>) => {
    const updated = { ...get().config, ...partial };
    set({ config: updated });

    if (partial.autoSync !== undefined) {
      await setSyncConfig('auto_sync', partial.autoSync ? '1' : '0');
      setupPeriodicSync(get);
    }
    if (partial.encryptionEnabled !== undefined) {
      await setSyncConfig('encryption_enabled', partial.encryptionEnabled ? '1' : '0');
    }
    if (partial.lastSyncAt !== undefined) {
      await setSyncConfig('last_sync_at', partial.lastSyncAt);
    }
  },

  requestPin: (mode: 'unlock' | 'setup' | 'disable') => {
    return new Promise<string | null>((resolve) => {
      set({
        isPinModalOpen: true,
        pinModalMode: mode,
        pinResolve: resolve,
      });
    });
  },

  submitPin: (pin: string) => {
    const { pinResolve } = get();
    if (pinResolve) {
      pinResolve(pin);
    }
    set({
      isPinModalOpen: false,
      pinResolve: null,
    });
  },

  cancelPin: () => {
    const { pinResolve } = get();
    if (pinResolve) {
      pinResolve(null);
    }
    set({
      isPinModalOpen: false,
      pinResolve: null,
    });
  },

  syncNow: async () => {
    const { config, isSyncing, sessionDerivedKey } = get();
    if (isSyncing) return;

    if (!config.userId) {
      set({ syncStatus: 'idle', lastError: null });
      return;
    }

    if (FEATURE_FLAGS.SHOW_SUBSCRIPTION) {
      try {
        const { useSubscriptionStore } = await import('@/stores/useSubscriptionStore');
        if (!useSubscriptionStore.getState().isVip) {
          set({ isSyncing: false, syncStatus: 'idle' });
          return;
        }
      } catch {}
    }

    set({ isSyncing: true, lastError: null });


    try {
      let currentKey = sessionDerivedKey;
      let saltB64 = await getSecureSecret('pbkdf2_salt');

      if (config.encryptionEnabled && !currentKey) {
        if (!saltB64) {
          saltB64 = uint8ArrayToBase64(generateRandomSalt());
          await saveSecureSecret('pbkdf2_salt', saltB64);
        }
        const pin = await get().requestPin('unlock');
        if (!pin) {
          set({ isSyncing: false, syncStatus: 'error', lastError: 'PIN requerido para sincronizar con cifrado' });
          return;
        }
        const saltBytes = base64ToUint8Array(saltB64);
        currentKey = await deriveKeyFromPin(pin, saltBytes);
        set({ sessionDerivedKey: currentKey });
      }

      // Obtener datos locales desde SQLite
      const [rawProfiles, rawHistory, rawFavorites, rawTombstones, rawSettings] = await Promise.all([
        getAllProfiles(),
        getAllHistory(),
        getAllFavoritesForSync(),
        getTombstones(),
        getAllSettings(),
      ]);

      const profiles = Array.isArray(rawProfiles) ? rawProfiles : [];
      const history = Array.isArray(rawHistory) ? rawHistory : [];
      const favorites = Array.isArray(rawFavorites) ? rawFavorites : [];
      const tombstones = Array.isArray(rawTombstones) ? rawTombstones : [];
      const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};

      const onlineHistory = history.filter((h) => !isLocalFileHistory(h));

      const localHashes = await computePayloadHashes({
        profiles,
        history: onlineHistory,
        favorites,
        settings,
      });

      const currentPlatform = getCurrentDevicePlatform();
      const isAndroid = currentPlatform === 'android';

      const localPayload: CloudSyncPayload = {
        syncMeta: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          appVersion: CURRENT_VERSION,
          lastModifiedAt: getCalibratedTimestamp(),
          lastModifiedDevice: currentPlatform,
          pbkdf2Salt: config.encryptionEnabled ? (saltB64 || undefined) : undefined,
          fileHashes: localHashes,
          devices: {
            ...cachedRemoteDevices,
            [isAndroid ? 'android' : 'windows']: {
              lastSyncAt: getCalibratedTimestamp(),
              appVersion: CURRENT_VERSION,
            },
          },
          deletedFavorites: tombstones
            .filter((t: TombstoneItem) => t.entityType === 'favorite')
            .map((t: TombstoneItem) => ({
              url: t.entityId,
              profileId: t.profileId,
              deletedAt: t.deletedAt,
            })),
          deletedProfiles: tombstones
            .filter((t: TombstoneItem) => t.entityType === 'profile')
            .map((t: TombstoneItem) => ({
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

      let lastHashesJson = '';
      try {
        lastHashesJson = (await getSyncConfig('last_synced_hashes')) || '';
      } catch {}
      let lastSyncedHashes: Record<string, string> | null = null;
      if (lastHashesJson) {
        try {
          lastSyncedHashes = JSON.parse(lastHashesJson);
        } catch {}
      }
      const hasLocalPendingChanges = !lastSyncedHashes || !areHashesEqual(localHashes, lastSyncedHashes);
      const isLocalEmpty = isLocalDataEmpty({ profiles, history: onlineHistory, favorites });

      // Consultar datos remotos en Firestore
      let fetchResult;
      try {
        fetchResult = await fetchFirestoreData(config.userId, config, currentKey);
      } catch (e: any) {
        if (e instanceof NeedPinForDecryptionError || e?.message === 'NEED_PIN_FOR_DECRYPTION') {
          const salt = (e instanceof NeedPinForDecryptionError && e.salt) || saltB64;
          const pin = await get().requestPin('unlock');
          if (!pin) {
            set({ isSyncing: false, syncStatus: 'error', lastError: 'Se requiere el PIN para descifrar los datos en la nube' });
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

          fetchResult = await fetchFirestoreData(config.userId, get().config, currentKey);
        } else {
          throw e;
        }
      }

      if (fetchResult && fetchResult.payload) {
        const remotePayload = fetchResult.payload;
        const remoteHashes = remotePayload.syncMeta.fileHashes;

        cachedRemoteSettingsDesktop = remotePayload.settingsDesktop || {};
        cachedRemoteSettingsMobile = remotePayload.settingsMobile || {};
        cachedRemoteDevices = remotePayload.syncMeta?.devices || {};

        // Caso 1: Los datos locales y remotos son idénticos -> No-op
        if (areHashesEqual(localHashes, remoteHashes)) {
          await setSyncConfig('last_synced_hashes', JSON.stringify(localHashes));
          await get().updateConfig({ lastSyncAt: getCalibratedTimestamp() });
          set({ isSyncing: false, syncStatus: 'not_modified' });
          return;
        }

        // Caso 2: El dispositivo local está vacío o no tenía cambios pendientes -> Solo descargar e importar
        if (isLocalEmpty || !hasLocalPendingChanges) {
          for (const p of remotePayload.profiles) {
            await upsertProfile(p);
          }
          for (const del of remotePayload.syncMeta?.deletedProfiles || []) {
            if (del.profileId && del.profileId !== 'default') {
              try {
                await deleteProfile(del.profileId);
              } catch (delErr) {
                console.warn('[AniCS Sync] Error eliminando perfil local remoto:', delErr);
              }
            }
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

          const platformSettings = isAndroid ? remotePayload.settingsMobile : remotePayload.settingsDesktop;
          const settingsToApply = platformSettings && Object.keys(platformSettings).length > 0 ? platformSettings : remotePayload.settings;

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

          await setSyncConfig('last_synced_hashes', JSON.stringify(remoteHashes));
          await get().updateConfig({ lastSyncAt: getCalibratedTimestamp() });

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

        // Caso 3: Ambos dispositivos tienen cambios concurrentes -> Fusionar y guardar en Firestore
        const mergedPayload = mergeSyncData(localPayload, remotePayload);

        for (const p of mergedPayload.profiles) {
          await upsertProfile(p);
        }
        for (const del of mergedPayload.syncMeta?.deletedProfiles || []) {
          if (del.profileId && del.profileId !== 'default') {
            try {
              await deleteProfile(del.profileId);
            } catch (delErr) {
              console.warn('[AniCS Sync] Error eliminando perfil local remoto:', delErr);
            }
          }
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

        const platformSettings = isAndroid ? mergedPayload.settingsMobile : mergedPayload.settingsDesktop;
        const settingsToApply = platformSettings && Object.keys(platformSettings).length > 0 ? platformSettings : mergedPayload.settings;

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

        const uploadResult = await saveFirestoreData(config.userId, get().config, mergedPayload, currentKey, saltB64 || undefined);
        await setSyncConfig('last_synced_hashes', JSON.stringify(uploadResult.hashes));
        await get().updateConfig({ lastSyncAt: getCalibratedTimestamp() });

        try {
          const { useProfileStore } = await import('@/stores/useProfileStore');
          await useProfileStore.getState().loadProfiles();
        } catch {}

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('anics:sync-completed'));
        }

        AniCSAnalytics.logSyncSuccess(getCurrentDevicePlatform(), {
          history: history.length,
          favorites: favorites.length,
        });
        set({ isSyncing: false, syncStatus: 'success' });
        return;
      }

      // Caso 4: No existe respaldo remoto previo -> Subir estado local como primer respaldo
      const uploadResult = await saveFirestoreData(config.userId, get().config, localPayload, currentKey, saltB64 || undefined);
      await setSyncConfig('last_synced_hashes', JSON.stringify(uploadResult.hashes));
      await get().updateConfig({ lastSyncAt: getCalibratedTimestamp() });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('anics:sync-completed'));
      }

      AniCSAnalytics.logSyncSuccess(getCurrentDevicePlatform(), {
        history: history.length,
        favorites: favorites.length,
      });
      set({ isSyncing: false, syncStatus: 'success' });
    } catch (error: any) {
      console.error('[AniCS Sync] Error en syncNow:', error);
      AniCSAnalytics.logSyncError(getCurrentDevicePlatform(), error.message || 'unknown_error');
      set({
        isSyncing: false,
        syncStatus: 'error',
        lastError: error.message || 'Error desconocido durante la sincronización',
      });
    }
  },

  triggerDebouncedSync: () => {
    const { config, isSyncing, isSyncPausedByLocalClear } = get();
    if (!config.autoSync || !config.userId || isSyncing || isSyncPausedByLocalClear) {
      return;
    }

    if (autoSyncTimeout) {
      clearTimeout(autoSyncTimeout);
    }

    autoSyncTimeout = setTimeout(() => {
      get().syncNow().catch((e) => console.warn('[AniCS Sync] Debounced sync falló:', e));
    }, 30_000);
  },

  exportBackupFile: async () => {
    const [profiles, history, favorites, settings] = await Promise.all([
      getAllProfiles(),
      getAllHistory(),
      getAllFavoritesForSync(),
      getAllSettings(),
    ]);

    const onlineHistory = history.filter((h) => !isLocalFileHistory(h));
    const hashes = await computePayloadHashes({ profiles, history: onlineHistory, favorites, settings });

    const payload: CloudSyncPayload = {
      syncMeta: {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: CURRENT_VERSION,
        lastModifiedAt: getCalibratedTimestamp(),
        lastModifiedDevice: getCurrentDevicePlatform(),
        fileHashes: hashes,
        deletedFavorites: [],
        deletedProfiles: [],
        deletedHistory: [],
      },
      profiles,
      history: onlineHistory,
      favorites,
      settings,
    };

    const jsonStr = exportPayloadToJsonString(payload);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anics-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importBackupFile: async (jsonString: string) => {
    try {
      const imported = importPayloadFromJsonString(jsonString);
      for (const p of imported.profiles) {
        await upsertProfile(p);
      }
      if (imported.history.length > 0) {
        await batchUpsertHistory(imported.history);
      }
      if (imported.favorites.length > 0) {
        await batchAddFavorites(imported.favorites);
      }
      if (imported.settings) {
        for (const [k, v] of Object.entries(imported.settings)) {
          await setSetting(k, v);
        }
      }

      try {
        const { useProfileStore } = await import('@/stores/useProfileStore');
        await useProfileStore.getState().loadProfiles();
      } catch {}

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('anics:sync-completed'));
      }

      set({ syncStatus: 'success', lastError: null });
    } catch (e: any) {
      set({ syncStatus: 'error', lastError: e.message || 'Error al importar archivo de respaldo' });
      throw e;
    }
  },

  enableEncryption: async (pin: string) => {
    const saltB64 = uint8ArrayToBase64(generateRandomSalt());
    await saveSecureSecret('pbkdf2_salt', saltB64);
    const saltBytes = base64ToUint8Array(saltB64);
    const derivedKey = await deriveKeyFromPin(pin, saltBytes);

    set({ sessionDerivedKey: derivedKey });
    await get().updateConfig({ encryptionEnabled: true });
    await get().syncNow();
  },

  disableEncryption: async () => {
    await deleteSecureSecret('pbkdf2_salt');
    set({ sessionDerivedKey: null });
    await get().updateConfig({ encryptionEnabled: false });
    await get().syncNow();
  },

  clearCloudData: async () => {
    const { config } = get();
    if (!config.userId) return;
    set({ isSyncing: true, lastError: null });
    try {
      await clearAllFirestoreData(config.userId);
      await setSyncConfig('last_synced_hashes', '');
      await get().updateConfig({ lastSyncAt: '' });
      set({ isSyncing: false, syncStatus: 'idle', lastError: null });
    } catch (e: any) {
      set({ isSyncing: false, syncStatus: 'error', lastError: e?.message || 'Error al vaciar datos en la nube' });
      throw e;
    }
  },
}));
