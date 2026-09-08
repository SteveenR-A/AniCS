import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FEATURE_FLAGS } from '@/config/features';

const memoryStore = new Map<string, string>();
const safeStorage = createJSONStorage(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryStore.get(key) || null,
    setItem: (key: string, value: string) => memoryStore.set(key, value),
    removeItem: (key: string) => memoryStore.delete(key),
  };
});

export interface SubscriptionPlan {
  id: 'monthly' | 'annual';
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly',
    name: 'Yumework VIP Mensual',
    price: '$3.50',
    period: '/ mes',
    description: 'Acceso total y servidores de alta velocidad para estudiantes y fans.',
    features: [
      'Sincronización multi-dispositivo de historial y favoritos en la nube',
      'Servidores ultrarrápidos dedicados (Magi y Desu) sin buffering',
      'Descargas ilimitadas individuales y por lotes en HD (1080p)',
      'Acceso a todos los temas exclusivos (OLED, Kanagawa, Cyberpunk, Tokyo)',
      'Insignia VIP dorada en tu perfil y reproductor',
    ],
  },
  {
    id: 'annual',
    name: 'Yumework VIP Anual',
    price: '$35.00',
    period: '/ año',
    description: 'La mejor experiencia durante todo el año con 2 meses de regalo.',
    popular: true,
    features: [
      'Todo lo incluido en el plan mensual',
      'Sincronización prioritaria en la nube con respaldo continuo',
      '2 meses gratis (Ahorro del 17%)',
      'Insignia Fundador VIP permanente',
      'Acceso prioritario a futuros servidores y temas',
    ],
  },
];

interface SubscriptionState {
  isVip: boolean;
  activePlan: 'monthly' | 'annual' | null;
  subscribedAt: string | null;
  expiresAt: string | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  activateSubscription: (planId: 'monthly' | 'annual', uid?: string) => Promise<void>;
  setVipStatus: (isVip: boolean, plan?: 'monthly' | 'annual' | null, expiresAt?: string | null) => void;
  cancelSubscription: (uid?: string) => Promise<void>;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      isVip: false,
      activePlan: null,
      subscribedAt: null,
      expiresAt: null,
      isModalOpen: false,

      openModal: () => {
        if (FEATURE_FLAGS.SHOW_SUBSCRIPTION) {
          set({ isModalOpen: true });
        }
      },

      closeModal: () => set({ isModalOpen: false }),

      setVipStatus: (isVip: boolean, plan?: 'monthly' | 'annual' | null, expiresAt?: string | null) => {
        set({
          isVip,
          activePlan: isVip ? (plan || 'annual') : null,
          subscribedAt: isVip ? new Date().toISOString() : null,
          expiresAt: isVip ? (expiresAt || null) : null,
        });

        // Si se cambia a cuenta gratuita, revertir cualquier tema VIP al tema 'dark'
        if (!isVip) {
          import('@/stores/useThemeStore').then(({ useThemeStore, THEMES }) => {
            const currentTheme = useThemeStore.getState().currentTheme;
            const themeDef = THEMES.find((t) => t.id === currentTheme);
            if (themeDef?.isVipOnly) {
              useThemeStore.getState().setTheme('dark');
            }
          }).catch(() => {});
        }
      },

      activateSubscription: async (planId: 'monthly' | 'annual', uid?: string) => {
        const now = new Date();
        const expiry = new Date();
        if (planId === 'annual') {
          expiry.setFullYear(expiry.getFullYear() + 1);
        } else {
          expiry.setMonth(expiry.getMonth() + 1);
        }

        set({
          isVip: true,
          activePlan: planId,
          subscribedAt: now.toISOString(),
          expiresAt: expiry.toISOString(),
        });

        if (uid) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestoreDb } = await import('@/services/firebase/firebaseConfig');
            const subDocRef = doc(firestoreDb, 'users', uid, 'subscription', 'info');
            await setDoc(subDocRef, {
              isVip: true,
              plan: planId,
              subscribedAt: now.toISOString(),
              expiresAt: expiry.toISOString(),
            }, { merge: true });
          } catch (e) {
            console.warn('[AniCS Subscription] Error guardando suscripción en Firestore:', e);
          }

          try {
            const { useAccountStore } = await import('@/stores/useAccountStore');
            const accountState = useAccountStore.getState();
            const updated = accountState.accounts.map((a) =>
              a.uid === uid
                ? {
                    ...a,
                    isVip: true,
                    plan: planId,
                    planName: planId === 'annual' ? 'VIP Anual ($35/año)' : 'VIP Mensual ($3.50/mes)',
                  }
                : a
            );
            useAccountStore.setState({ accounts: updated });
          } catch {}
        }
      },

      cancelSubscription: async (uid?: string) => {
        set({
          isVip: false,
          activePlan: null,
          subscribedAt: null,
          expiresAt: null,
        });

        // 1. Revertir temas exclusivos a dark
        try {
          const { useThemeStore, THEMES } = await import('@/stores/useThemeStore');
          const currentTheme = useThemeStore.getState().currentTheme;
          const themeDef = THEMES.find((t) => t.id === currentTheme);
          if (themeDef?.isVipOnly) {
            await useThemeStore.getState().setTheme('dark');
          }
        } catch {}

        // 2. Si el usuario está autenticado en Firestore, actualizar la base de datos
        if (uid) {
          try {
            const { doc, setDoc } = await import('firebase/firestore');
            const { firestoreDb } = await import('@/services/firebase/firebaseConfig');
            const subDocRef = doc(firestoreDb, 'users', uid, 'subscription', 'info');
            await setDoc(subDocRef, {
              isVip: false,
              plan: null,
              cancelledAt: new Date().toISOString(),
            }, { merge: true });
          } catch (e) {
            console.warn('[AniCS Subscription] Error cancelando suscripción en Firestore:', e);
          }
        }

        // 3. Actualizar estado en useAccountStore
        try {
          const { useAccountStore } = await import('@/stores/useAccountStore');
          const accountState = useAccountStore.getState();
          const targetUid = uid || accountState.accounts.find(a => a.email === accountState.activeAccountEmail)?.uid;
          if (targetUid) {
            const updated = accountState.accounts.map((a) =>
              a.uid === targetUid
                ? { ...a, isVip: false, plan: null, planName: 'Plan Estándar (Gratis)' }
                : a
            );
            useAccountStore.setState({ accounts: updated });
          }
        } catch {}
      },
    }),
    {
      name: 'anics-subscription-storage',
      storage: safeStorage,
    }
  )
);


