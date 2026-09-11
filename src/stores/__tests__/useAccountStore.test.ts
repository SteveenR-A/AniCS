import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAccountStore } from '../useAccountStore';
import { useSubscriptionStore } from '../useSubscriptionStore';
import { useThemeStore } from '../useThemeStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/config/features', () => ({
  FEATURE_FLAGS: {
    SHOW_SUBSCRIPTION: true,
  },
}));

vi.mock('@/services/firebase/firebaseConfig', () => ({
  firestoreDb: {},
  firebaseAuth: {},
  firebaseApp: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockImplementation((_db, ...parts) => ({ path: parts.join('/') })),
  getDoc: vi.fn().mockImplementation(async (docRef: any) => {
    const path = String(docRef?.path || '');
    const isVip = path.includes('vip') || path.includes('ch4nQB3XSXhy5ZMPZyizfpE5t7m2');
    return {
      exists: () => true,
      data: () => ({ isVip, plan: isVip ? 'annual' : null }),
    };
  }),
  setDoc: vi.fn(),
}));

vi.mock('@/services/firebase/authService', () => ({
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn().mockImplementation(async (email: string) => ({
    uid: email === 'vip@anics.app' ? 'vip_uid' : 'free_uid',
    email,
    displayName: email.split('@')[0],
  })),
  registerWithEmail: vi.fn(),
  logoutFirebase: vi.fn(),
  subscribeToAuthChanges: vi.fn().mockReturnValue(() => {}),
  getCurrentFirebaseUser: vi.fn().mockReturnValue(null),
}));

describe('useAccountStore and Theme VIP Gating', () => {
  beforeEach(async () => {
    // Reset stores
    useSubscriptionStore.getState().setVipStatus(false);
    await useThemeStore.getState().setTheme('dark');
  });

  it('contains seeded demo VIP and Free accounts', () => {
    const accounts = useAccountStore.getState().accounts;
    expect(accounts.some((a) => a.email === 'vip@anics.app' && a.isVip)).toBe(true);
    expect(accounts.some((a) => a.email === 'gratis@anics.app' && !a.isVip)).toBe(true);
  });

  it('restricts non-VIP users to dark and light themes only', async () => {
    const themeStore = useThemeStore.getState();
    expect(useSubscriptionStore.getState().isVip).toBe(false);

    // Can set light theme
    await themeStore.setTheme('light');
    expect(useThemeStore.getState().currentTheme).toBe('light');

    // Cannot set exclusive themes (e.g. dracula, cyberpunk) without VIP
    await themeStore.setTheme('dracula');
    expect(useThemeStore.getState().currentTheme).toBe('light'); // unchanged

    await themeStore.setTheme('cyberpunk');
    expect(useThemeStore.getState().currentTheme).toBe('light'); // unchanged

    // Can set dark theme
    await themeStore.setTheme('dark');
    expect(useThemeStore.getState().currentTheme).toBe('dark');
  });

  it('allows exclusive themes when user is VIP', async () => {
    useSubscriptionStore.getState().setVipStatus(true, 'annual');
    expect(useSubscriptionStore.getState().isVip).toBe(true);

    const themeStore = useThemeStore.getState();
    await themeStore.setTheme('dracula');
    expect(useThemeStore.getState().currentTheme).toBe('dracula');

    await themeStore.setTheme('cyberpunk');
    expect(useThemeStore.getState().currentTheme).toBe('cyberpunk');
  });

  it('reverts exclusive theme to dark when account changes from VIP to Free', async () => {
    // 1. Activate VIP and set exclusive theme
    useSubscriptionStore.getState().setVipStatus(true, 'annual');
    await useThemeStore.getState().setTheme('tokyonight');
    expect(useThemeStore.getState().currentTheme).toBe('tokyonight');

    // 2. Downgrade / revoke VIP
    useSubscriptionStore.getState().setVipStatus(false);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3. Pro privileges locked and theme reverted to dark
    expect(useSubscriptionStore.getState().isVip).toBe(false);
    expect(useThemeStore.getState().currentTheme).toBe('dark');
  });

  it('quickLoginVipDemo activates VIP status and quickLoginFreeDemo locks Pro access', async () => {
    const accountStore = useAccountStore.getState();

    // Switch to VIP demo
    await accountStore.quickLoginVipDemo();
    expect(useSubscriptionStore.getState().isVip).toBe(true);
    expect(useAccountStore.getState().activeAccountEmail).toBe('vip@anics.app');

    // Switch to Free demo
    await accountStore.quickLoginFreeDemo();
    expect(useSubscriptionStore.getState().isVip).toBe(false);
    expect(useAccountStore.getState().activeAccountEmail).toBe('gratis@anics.app');
  });
});
