import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import * as profileService from '../profileService';
import type { UserProfile } from '@/types';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).AndroidBridge;
  });

  it('getAllProfiles calls invoke get_all_profiles', async () => {
    const mockProfiles: UserProfile[] = [
      { id: '1', name: 'User 1', avatar: 'sparkles', color: '#fff', isActive: true, createdAt: '2026-01-01' },
    ];
    vi.mocked(invoke).mockResolvedValueOnce(mockProfiles);

    const result = await profileService.getAllProfiles();
    expect(invoke).toHaveBeenCalledWith('get_all_profiles');
    expect(result).toEqual(mockProfiles);
  });

  it('getActiveProfile calls invoke get_active_profile', async () => {
    const mockProfile: UserProfile = {
      id: 'default',
      name: 'Default',
      avatar: 'sparkles',
      color: '#000',
      isActive: true,
      createdAt: '2026-01-01',
    };
    vi.mocked(invoke).mockResolvedValueOnce(mockProfile);

    const result = await profileService.getActiveProfile();
    expect(invoke).toHaveBeenCalledWith('get_active_profile');
    expect(result).toEqual(mockProfile);
  });

  it('upsertProfile calls invoke upsert_profile', async () => {
    const profile: UserProfile = {
      id: '2',
      name: 'User 2',
      avatar: 'user',
      color: '#333',
      isActive: false,
      createdAt: '2026-01-01',
    };
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await profileService.upsertProfile(profile);
    expect(invoke).toHaveBeenCalledWith('upsert_profile', { profile });
  });

  it('setActiveProfile calls invoke set_active_profile', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await profileService.setActiveProfile('profile-123');
    expect(invoke).toHaveBeenCalledWith('set_active_profile', { id: 'profile-123' });
  });

  it('deleteProfile calls invoke delete_profile', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    await profileService.deleteProfile('profile-123');
    expect(invoke).toHaveBeenCalledWith('delete_profile', { id: 'profile-123' });
  });

  it('getProfileStats calls invoke get_profile_stats', async () => {
    const mockStats = { totalWatched: 10, totalFavorites: 5, totalDownloaded: 2 };
    vi.mocked(invoke).mockResolvedValueOnce(mockStats);
    const result = await profileService.getProfileStats('default');
    expect(invoke).toHaveBeenCalledWith('get_profile_stats', { profileId: 'default' });
    expect(result).toEqual(mockStats);
  });

  describe('Secure Secret (Keyring / AndroidBridge)', () => {
    it('uses AndroidBridge when present for save, get, and delete', async () => {
      const mockSave = vi.fn();
      const mockGet = vi.fn().mockReturnValue('bridge-token');
      const mockDelete = vi.fn();

      (window as any).AndroidBridge = {
        saveSecureToken: mockSave,
        getSecureToken: mockGet,
        deleteSecureToken: mockDelete,
      };

      await profileService.saveSecureSecret('token', 'secret123');
      expect(mockSave).toHaveBeenCalledWith('token', 'secret123');
      expect(invoke).not.toHaveBeenCalledWith('save_secure_token', expect.anything());

      const token = await profileService.getSecureSecret('token');
      expect(mockGet).toHaveBeenCalledWith('token');
      expect(token).toBe('bridge-token');

      await profileService.deleteSecureSecret('token');
      expect(mockDelete).toHaveBeenCalledWith('token');
    });

    it('falls back to invoke when AndroidBridge is absent', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await profileService.saveSecureSecret('token', 'secret123');
      expect(invoke).toHaveBeenCalledWith('save_secure_token', { key: 'token', token: 'secret123' });

      vi.mocked(invoke).mockResolvedValueOnce('desktop-token');
      const token = await profileService.getSecureSecret('token');
      expect(invoke).toHaveBeenCalledWith('get_secure_token', { key: 'token' });
      expect(token).toBe('desktop-token');

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await profileService.deleteSecureSecret('token');
      expect(invoke).toHaveBeenCalledWith('delete_secure_token', { key: 'token' });
    });
  });

  describe('Sync Config & Tombstones', () => {
    it('handles getSyncConfig, setSyncConfig, getAllSyncConfig', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('val');
      const val = await profileService.getSyncConfig('key1');
      expect(invoke).toHaveBeenCalledWith('get_sync_config', { key: 'key1' });
      expect(val).toBe('val');

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await profileService.setSyncConfig('key1', 'new-val');
      expect(invoke).toHaveBeenCalledWith('set_sync_config', { key: 'key1', value: 'new-val' });

      vi.mocked(invoke).mockResolvedValueOnce({ key1: 'new-val' });
      const all = await profileService.getAllSyncConfig();
      expect(all).toEqual({ key1: 'new-val' });
    });

    it('handles getTombstones, addTombstone, cleanupOldTombstones', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);
      const tombstones = await profileService.getTombstones();
      expect(invoke).toHaveBeenCalledWith('get_tombstones');
      expect(tombstones).toEqual([]);

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await profileService.addTombstone('anime', '123', 'default');
      expect(invoke).toHaveBeenCalledWith('add_tombstone', { entityType: 'anime', entityId: '123', profileId: 'default' });

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await profileService.cleanupOldTombstones(15);
      expect(invoke).toHaveBeenCalledWith('cleanup_old_tombstones', { days: 15 });
    });
  });
});
