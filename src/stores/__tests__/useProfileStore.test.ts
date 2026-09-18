import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfileStore } from '../useProfileStore';
import * as profileService from '@/services/profileService';
import type { UserProfile } from '@/types';

vi.mock('@/services/profileService', () => ({
  getAllProfiles: vi.fn(),
  getActiveProfile: vi.fn(),
  upsertProfile: vi.fn(),
  setActiveProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

describe('useProfileStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({ profiles: [], activeProfile: null, isLoading: false, error: null });
  });

  it('loadProfiles fetches profiles and activeProfile', async () => {
    const mockList: UserProfile[] = [
      { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01' },
    ];
    vi.mocked(profileService.getAllProfiles).mockResolvedValueOnce(mockList);
    vi.mocked(profileService.getActiveProfile).mockResolvedValueOnce(mockList[0]);

    await useProfileStore.getState().loadProfiles();

    expect(useProfileStore.getState().profiles).toEqual(mockList);
    expect(useProfileStore.getState().activeProfile).toEqual(mockList[0]);
    expect(useProfileStore.getState().isLoading).toBe(false);
  });

  it('createProfile generates new profile and calls upsertProfile', async () => {
    vi.mocked(profileService.upsertProfile).mockResolvedValueOnce(undefined);
    vi.mocked(profileService.getAllProfiles).mockResolvedValueOnce([]);
    vi.mocked(profileService.getActiveProfile).mockResolvedValueOnce({
      id: 'default',
      name: 'Default',
      avatar: 'user',
      color: '#000',
      isActive: true,
      createdAt: '2026-01-01',
    });

    const created = await useProfileStore.getState().createProfile('Invitado', 'tv', '#ff0000');

    expect(created.name).toBe('Invitado');
    expect(created.avatar).toBe('tv');
    expect(created.color).toBe('#ff0000');
    expect(profileService.upsertProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Invitado' }));
  });

  it('switchProfile calls setActiveProfile and updates activeProfile', async () => {
    const mockList: UserProfile[] = [
      { id: '1', name: 'P1', avatar: 'sparkles', color: '#3b82f6', isActive: false, createdAt: '2026-01-01' },
      { id: '2', name: 'P2', avatar: 'user', color: '#ff0000', isActive: true, createdAt: '2026-01-01' },
    ];
    vi.mocked(profileService.setActiveProfile).mockResolvedValueOnce(undefined);
    vi.mocked(profileService.getAllProfiles).mockResolvedValueOnce(mockList);

    await useProfileStore.getState().switchProfile('2');

    expect(profileService.setActiveProfile).toHaveBeenCalledWith('2');
    expect(useProfileStore.getState().activeProfile?.id).toBe('2');
  });

  it('deleteProfile calls deleteProfile service', async () => {
    vi.mocked(profileService.deleteProfile).mockResolvedValueOnce(undefined);
    vi.mocked(profileService.getAllProfiles).mockResolvedValueOnce([]);
    vi.mocked(profileService.getActiveProfile).mockResolvedValueOnce({
      id: 'default',
      name: 'Default',
      avatar: 'user',
      color: '#000',
      isActive: true,
      createdAt: '2026-01-01',
    });

    await useProfileStore.getState().deleteProfile('2');
    expect(profileService.deleteProfile).toHaveBeenCalledWith('2');
  });
});
