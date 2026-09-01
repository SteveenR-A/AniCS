import { create } from 'zustand';
import type { UserProfile } from '@/types';
import {
  getAllProfiles,
  getActiveProfile,
  upsertProfile,
  setActiveProfile as setActiveProfileService,
  deleteProfile as deleteProfileService,
} from '@/services/profileService';

interface ProfileState {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  isLoading: boolean;
  error: string | null;

  loadProfiles: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
  createProfile: (name: string, avatar: string, color: string) => Promise<UserProfile>;
  updateProfile: (profile: UserProfile) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: false,
  error: null,

  loadProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const [list, active] = await Promise.all([
        getAllProfiles(),
        getActiveProfile(),
      ]);
      set({ profiles: list, activeProfile: active, isLoading: false });
    } catch (e: any) {
      console.error('Error loading profiles:', e);
      set({ error: e?.message || 'Error cargando perfiles', isLoading: false });
    }
  },

  switchProfile: async (id: string) => {
    try {
      await setActiveProfileService(id);
      const list = await getAllProfiles();
      const active = list.find(p => p.id === id) || (await getActiveProfile());
      set({ profiles: list, activeProfile: active });
    } catch (e: any) {
      console.error('Error switching profile:', e);
      set({ error: e?.message || 'Error cambiando de perfil' });
    }
  },

  createProfile: async (name: string, avatar: string, color: string) => {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}`;
    const newProfile: UserProfile = {
      id,
      name: name.trim() || 'Nuevo Perfil',
      avatar: avatar || 'sparkles',
      color: color || '#3b82f6',
      isActive: false,
      createdAt: new Date().toISOString(),
    };

    await upsertProfile(newProfile);
    await get().loadProfiles();
    return newProfile;
  },

  updateProfile: async (profile: UserProfile) => {
    await upsertProfile(profile);
    await get().loadProfiles();
  },

  deleteProfile: async (id: string) => {
    await deleteProfileService(id);
    await get().loadProfiles();
  },
}));
