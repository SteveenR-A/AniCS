import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useSyncStore } from './useSyncStore';
import { useSubscriptionStore } from './useSubscriptionStore';
import { useThemeStore, THEMES } from './useThemeStore';
import { doc, getDoc } from 'firebase/firestore';
import { firestoreDb } from '@/services/firebase/firebaseConfig';

const accountMemoryStore = new Map<string, string>();
const safeStorage = createJSONStorage(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => accountMemoryStore.get(key) || null,
    setItem: (key: string, value: string) => accountMemoryStore.set(key, value),
    removeItem: (key: string) => accountMemoryStore.delete(key),
  };
});

export interface SavedAccount {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  isVip: boolean;
  plan?: 'monthly' | 'annual' | null;
  planName?: string;
  isDemo?: boolean;
  lastUsedAt: string;
}

export const DEMO_VIP_ACCOUNT: SavedAccount = {
  uid: 'ch4nQB3XSXhy5ZMPZyizfpE5t7m2',
  email: 'vip@anics.app',
  displayName: 'Yumework VIP Pass',
  isVip: true,
  plan: 'annual',
  planName: 'VIP Anual ($35/año)',
  isDemo: true,
  lastUsedAt: new Date().toISOString(),
};

export const DEMO_FREE_ACCOUNT: SavedAccount = {
  uid: 'x3chhGfq9HZ3gum8WlGitmZVhZ93',
  email: 'gratis@anics.app',
  displayName: 'Usuario Estándar',
  isVip: false,
  plan: null,
  planName: 'Plan Estándar (Gratis)',
  isDemo: true,
  lastUsedAt: new Date().toISOString(),
};

interface AccountState {
  accounts: SavedAccount[];
  activeAccountEmail: string | null;
  isSwitching: boolean;
  switchError: string | null;

  switchAccount: (email: string) => Promise<void>;
  quickLoginVipDemo: () => Promise<void>;
  quickLoginFreeDemo: () => Promise<void>;
  addOrUpdateAccount: (account: Partial<SavedAccount> & { email: string; uid: string }) => void;
  removeAccount: (email: string) => Promise<void>;
  checkFirestoreSubscription: (uid: string) => Promise<{ isVip: boolean; plan: 'monthly' | 'annual' | null } | null>;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accounts: [DEMO_VIP_ACCOUNT, DEMO_FREE_ACCOUNT],
      activeAccountEmail: null,
      isSwitching: false,
      switchError: null,

      checkFirestoreSubscription: async (uid: string) => {
        try {
          const subDocRef = doc(firestoreDb, 'users', uid, 'subscription', 'info');
          const snap = await getDoc(subDocRef);
          if (snap.exists()) {
            const data = snap.data();
            return {
              isVip: Boolean(data.isVip),
              plan: data.plan || null,
            };
          }
        } catch (e) {
          console.warn('[AniCS Account] Error consultando suscripción en Firestore:', e);
        }
        return null;
      },

      switchAccount: async (email: string) => {
        const state = get();
        const target = state.accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
        if (!target) {
          throw new Error('Cuenta no encontrada en este dispositivo.');
        }

        set({ isSwitching: true, switchError: null });

        try {
          // 1. Consultar estado dinámico de suscripción en Firestore según el UID real de la cuenta
          let isVip = target.isVip;
          let plan = target.plan;

          const firestoreSub = await get().checkFirestoreSubscription(target.uid);
          if (firestoreSub) {
            isVip = firestoreSub.isVip;
            plan = firestoreSub.plan;
          }

          // 3. Actualizar Zustand de Suscripción inmediatamente (desbloquea o bloquea features)
          useSubscriptionStore.getState().setVipStatus(isVip, plan);

          // 4. Si la cuenta es Gratis y el usuario tenía un tema VIP puesto, revertir a Dark
          if (!isVip) {
            const currentTheme = useThemeStore.getState().currentTheme;
            const themeDef = THEMES.find((t) => t.id === currentTheme);
            if (themeDef?.isVipOnly) {
              await useThemeStore.getState().setTheme('dark');
            }
          }

          // 5. Actualizar la cuenta en la lista local con su timestamp
          const updatedAccounts = state.accounts.map((a) =>
            a.email.toLowerCase() === email.toLowerCase()
              ? { ...a, isVip, plan, lastUsedAt: new Date().toISOString() }
              : a
          );

          set({
            accounts: updatedAccounts,
            activeAccountEmail: target.email,
            isSwitching: false,
          });

          // Notificar globalmente cambio de cuenta
          window.dispatchEvent(
            new CustomEvent('anics:account-switched', {
              detail: { email: target.email, isVip },
            })
          );
        } catch (error: any) {
          console.error('[AniCS Account] Error cambiando de cuenta:', error);
          set({
            isSwitching: false,
            switchError: error?.message || 'Error al cambiar de cuenta',
          });
          throw error;
        }
      },

      quickLoginVipDemo: async () => {
        await get().switchAccount('vip@anics.app');
      },

      quickLoginFreeDemo: async () => {
        await get().switchAccount('gratis@anics.app');
      },

      addOrUpdateAccount: (accountData) => {
        const state = get();
        const existingIndex = state.accounts.findIndex(
          (a) => a.email.toLowerCase() === accountData.email.toLowerCase()
        );

        let updatedAccounts: SavedAccount[];
        if (existingIndex >= 0) {
          updatedAccounts = [...state.accounts];
          updatedAccounts[existingIndex] = {
            ...updatedAccounts[existingIndex],
            ...accountData,
            lastUsedAt: new Date().toISOString(),
          };
        } else {
          const newAcc: SavedAccount = {
            uid: accountData.uid,
            email: accountData.email,
            displayName: accountData.displayName || accountData.email.split('@')[0],
            photoUrl: accountData.photoUrl,
            isVip: Boolean(accountData.isVip),
            plan: accountData.plan || null,
            planName: accountData.planName || (accountData.isVip ? 'Yumework VIP' : 'Estándar Gratis'),
            lastUsedAt: new Date().toISOString(),
          };
          updatedAccounts = [...state.accounts, newAcc];
        }

        set({
          accounts: updatedAccounts,
          activeAccountEmail: accountData.email,
        });
      },

      removeAccount: async (email: string) => {
        const state = get();
        const filtered = state.accounts.filter(
          (a) => a.email.toLowerCase() !== email.toLowerCase()
        );

        if (state.activeAccountEmail?.toLowerCase() === email.toLowerCase()) {
          await useSyncStore.getState().logout();
          useSubscriptionStore.getState().setVipStatus(false, null);
          set({
            accounts: filtered,
            activeAccountEmail: null,
          });
        } else {
          set({ accounts: filtered });
        }
      },
    }),
    {
      name: 'anics-saved-accounts',
      storage: safeStorage,
    }
  )
);

