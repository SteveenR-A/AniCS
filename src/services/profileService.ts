import { invoke } from '@tauri-apps/api/core';
import type { UserProfile, TombstoneItem } from '@/types';

// ─── Detección de Plataforma para Almacenamiento Seguro ───

function androidBridge() {
  return (window as Record<string, any>)['AndroidBridge'] as
    | {
        saveSecureToken?: (key: string, token: string) => void;
        getSecureToken?: (key: string) => string | null | undefined;
        deleteSecureToken?: (key: string) => void;
      }
    | undefined;
}

// ─── Perfiles de Usuario ───

export const getAllProfiles = (): Promise<UserProfile[]> =>
  invoke('get_all_profiles');

export const getActiveProfile = (): Promise<UserProfile> =>
  invoke('get_active_profile');

export const upsertProfile = (profile: UserProfile): Promise<void> =>
  invoke('upsert_profile', { profile });

export const setActiveProfile = (id: string): Promise<void> =>
  invoke('set_active_profile', { id });

export const deleteProfile = (id: string): Promise<void> =>
  invoke('delete_profile', { id });

export const getProfileStats = (profileId?: string): Promise<import('@/types').ProfileStats> =>
  invoke('get_profile_stats', { profileId });

// ─── Almacenamiento Seguro (Token de GitHub y Salt PBKDF2) ───

export const saveSecureSecret = async (key: string, secret: string): Promise<void> => {
  const bridge = androidBridge();
  if (bridge && typeof bridge.saveSecureToken === 'function') {
    bridge.saveSecureToken(key, secret);
    return;
  }
  return invoke('save_secure_token', { key, token: secret });
};

export const getSecureSecret = async (key: string): Promise<string | null> => {
  const bridge = androidBridge();
  if (bridge && typeof bridge.getSecureToken === 'function') {
    const token = bridge.getSecureToken(key);
    return token ?? null;
  }
  const token = await invoke<string | null>('get_secure_token', { key });
  return token ?? null;
};

export const deleteSecureSecret = async (key: string): Promise<void> => {
  const bridge = androidBridge();
  if (bridge && typeof bridge.deleteSecureToken === 'function') {
    bridge.deleteSecureToken(key);
    return;
  }
  return invoke('delete_secure_token', { key });
};

// ─── Sync Config (Metadatos de Sincronización en SQLite) ───

export const getSyncConfig = (key: string): Promise<string | null> =>
  invoke<string | null>('get_sync_config', { key });

export const setSyncConfig = (key: string, value: string): Promise<void> =>
  invoke('set_sync_config', { key, value });

export const getAllSyncConfig = (): Promise<Record<string, string>> =>
  invoke<Record<string, string>>('get_all_sync_config');

// ─── Tombstones (Lápidas de Borrado) ───

export const getTombstones = (): Promise<TombstoneItem[]> =>
  invoke('get_tombstones');

export const addTombstone = (entityType: string, entityId: string, profileId: string): Promise<void> =>
  invoke('add_tombstone', { entityType, entityId, profileId });

export const cleanupOldTombstones = (days = 30): Promise<void> =>
  invoke('cleanup_old_tombstones', { days });
