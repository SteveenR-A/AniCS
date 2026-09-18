import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { useThemeStore, THEMES } from '../useThemeStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@/config/features', () => ({
  FEATURE_FLAGS: {
    SHOW_SUBSCRIPTION: false, // Permitir probar temas sin restricción VIP
  },
}));

describe('useThemeStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useThemeStore.setState({ currentTheme: 'dark' });
  });

  it('initializes with dark theme', () => {
    expect(useThemeStore.getState().currentTheme).toBe('dark');
  });

  it('THEMES list contains dark and custom themes', () => {
    expect(THEMES.length).toBeGreaterThan(5);
    const dark = THEMES.find((t) => t.id === 'dark');
    expect(dark).toBeDefined();
    expect(dark?.name).toContain('Dark');
  });

  it('setTheme updates theme, localStorage, and invokes set_setting', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await useThemeStore.getState().setTheme('nord');

    expect(useThemeStore.getState().currentTheme).toBe('nord');
    expect(localStorage.getItem('anics_theme')).toBe('nord');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nord');
    expect(invoke).toHaveBeenCalledWith('set_setting', { key: 'app_theme', value: 'nord' });
  });

  it('loadTheme loads theme from database if available', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('dracula');

    await useThemeStore.getState().loadTheme();

    expect(useThemeStore.getState().currentTheme).toBe('dracula');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dracula');
  });

  it('loadTheme falls back to localStorage if db empty', async () => {
    localStorage.setItem('anics_theme', 'tokyo');
    vi.mocked(invoke).mockResolvedValueOnce(null);

    await useThemeStore.getState().loadTheme();

    expect(useThemeStore.getState().currentTheme).toBe('tokyo');
  });
});
