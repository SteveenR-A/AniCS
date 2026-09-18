import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSubscriptionStore, SUBSCRIPTION_PLANS } from '../useSubscriptionStore';

vi.mock('@/config/features', () => ({
  FEATURE_FLAGS: {
    SHOW_SUBSCRIPTION: true,
  },
}));

vi.mock('@/services/firebase/firebaseConfig', () => ({
  firestoreDb: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn().mockImplementation((_db, ...parts) => ({ path: parts.join('/') })),
  setDoc: vi.fn().mockResolvedValue(undefined),
}));

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSubscriptionStore.setState({
      isVip: false,
      activePlan: null,
      subscribedAt: null,
      expiresAt: null,
      isModalOpen: false,
    });
  });

  it('contains monthly and annual plans', () => {
    expect(SUBSCRIPTION_PLANS).toHaveLength(2);
    expect(SUBSCRIPTION_PLANS.find(p => p.id === 'monthly')).toBeDefined();
    expect(SUBSCRIPTION_PLANS.find(p => p.id === 'annual')).toBeDefined();
  });

  it('opens and closes modal', () => {
    useSubscriptionStore.getState().openModal();
    expect(useSubscriptionStore.getState().isModalOpen).toBe(true);

    useSubscriptionStore.getState().closeModal();
    expect(useSubscriptionStore.getState().isModalOpen).toBe(false);
  });

  it('sets VIP status correctly', () => {
    useSubscriptionStore.getState().setVipStatus(true, 'annual', '2027-01-01');

    expect(useSubscriptionStore.getState().isVip).toBe(true);
    expect(useSubscriptionStore.getState().activePlan).toBe('annual');
    expect(useSubscriptionStore.getState().expiresAt).toBe('2027-01-01');

    useSubscriptionStore.getState().setVipStatus(false);
    expect(useSubscriptionStore.getState().isVip).toBe(false);
    expect(useSubscriptionStore.getState().activePlan).toBeNull();
  });

  it('activates and cancels subscription', async () => {
    await useSubscriptionStore.getState().activateSubscription('monthly', 'test-uid');

    expect(useSubscriptionStore.getState().isVip).toBe(true);
    expect(useSubscriptionStore.getState().activePlan).toBe('monthly');
    expect(useSubscriptionStore.getState().isModalOpen).toBe(false);

    await useSubscriptionStore.getState().cancelSubscription('test-uid');
    expect(useSubscriptionStore.getState().isVip).toBe(false);
    expect(useSubscriptionStore.getState().activePlan).toBeNull();
  });
});
