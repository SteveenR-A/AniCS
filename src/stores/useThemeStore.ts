import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  tag?: string;
  primaryColor: string;
  secondaryColor: string;
  surfaceColor: string;
  baseColor: string;
  isDark: boolean;
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Dark (Por Defecto)',
    description: 'Modo oscuro moderno con acentos índigo y rosa neón',
    primaryColor: '#6366f1',
    secondaryColor: '#ec4899',
    surfaceColor: '#111318',
    baseColor: '#0a0b0f',
    isDark: true,
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox Dark',
    tag: 'Clásico del ricing',
    description: 'Tonos cálidos terrosos. Diseñado para no cansar la vista en sesiones largas.',
    primaryColor: '#d79921',
    secondaryColor: '#cc241d',
    surfaceColor: '#282828',
    baseColor: '#1d2021',
    isDark: true,
  },
  {
    id: 'rosepine',
    name: 'Rosé Pine',
    tag: 'Popular en Hyprland',
    description: 'Púrpura profundo con acentos durazno y lavanda. Elegante y minimalista.',
    primaryColor: '#ebbcba',
    secondaryColor: '#c4a7e7',
    surfaceColor: '#1f1d2e',
    baseColor: '#191724',
    isDark: true,
  },
  {
    id: 'everforest',
    name: 'Everforest',
    tag: 'Inspirado en naturaleza',
    description: 'Verde bosque oscuro con toques cálidos. Muy relajante visualmente.',
    primaryColor: '#a7c080',
    secondaryColor: '#e69875',
    surfaceColor: '#2d353b',
    baseColor: '#232a2e',
    isDark: true,
  },
  {
    id: 'oxocarbon',
    name: 'Oxocarbon',
    tag: 'Ideal para OLED',
    description: 'Minimalismo extremo. Negro casi puro con azules IBM y magenta. Excelente para OLED.',
    primaryColor: '#78a9ff',
    secondaryColor: '#ee5396',
    surfaceColor: '#262626',
    baseColor: '#161616',
    isDark: true,
  },
  {
    id: 'kanagawa',
    name: 'Kanagawa',
    tag: 'Estética japonesa',
    description: 'Inspirado en la pintura japonesa "La gran ola". Azules índigo y rojos suaves.',
    primaryColor: '#7e9cd8',
    secondaryColor: '#e46876',
    surfaceColor: '#2a2a37',
    baseColor: '#1f1f28',
    isDark: true,
  },
  {
    id: 'mellow',
    name: 'Mellow',
    tag: 'Underrated',
    description: 'Pastel oscuro con verdes sage y lilas apagados. Calmado y diferente a todos los actuales.',
    primaryColor: '#caa6df',
    secondaryColor: '#a9b665',
    surfaceColor: '#1b1b23',
    baseColor: '#16161d',
    isDark: true,
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin Mocha',
    description: 'Paleta pastel cálida con acentos mauve y flamingo',
    primaryColor: '#cba6f7',
    secondaryColor: '#f5c2e7',
    surfaceColor: '#1e1e2e',
    baseColor: '#181825',
    isDark: true,
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'El clásico tema gótico con morados, rosas y verde vampiro',
    primaryColor: '#bd93f9',
    secondaryColor: '#ff79c6',
    surfaceColor: '#282a36',
    baseColor: '#21222c',
    isDark: true,
  },
  {
    id: 'tokyonight',
    name: 'Tokyo Night',
    description: 'Ambiente nocturno inspirado en las luces de Tokio',
    primaryColor: '#7aa2f7',
    secondaryColor: '#bb9af7',
    surfaceColor: '#1a1b26',
    baseColor: '#16161e',
    isDark: true,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    description: 'Alto contraste futurista con amarillo radioactivo y cian',
    primaryColor: '#fee715',
    secondaryColor: '#00f0ff',
    surfaceColor: '#0f1017',
    baseColor: '#08080c',
    isDark: true,
  },
  {
    id: 'nord',
    name: 'Nord (Ártico)',
    description: 'Diseño nórdico glacial con tonos azul ártico y escarcha',
    primaryColor: '#88c0d0',
    secondaryColor: '#81a1c1',
    surfaceColor: '#2e3440',
    baseColor: '#242933',
    isDark: true,
  },
  {
    id: 'light',
    name: 'Claro (Light Modern)',
    description: 'Tema limpio y luminoso para entornos diurnos',
    primaryColor: '#4f46e5',
    secondaryColor: '#db2777',
    surfaceColor: '#ffffff',
    baseColor: '#f1f5f9',
    isDark: false,
  },
];

interface ThemeStore {
  currentTheme: string;
  setTheme: (themeId: string) => Promise<void>;
  loadTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  currentTheme: 'dark',

  setTheme: async (themeId: string) => {
    // Aplicar atributo al HTML
    document.documentElement.setAttribute('data-theme', themeId);
    localStorage.setItem('anics_theme', themeId);

    // Guardar en la base de datos persistente
    try {
      await invoke('set_setting', { key: 'app_theme', value: themeId });
    } catch {
      // Si falla Tauri en web preview, continúa con localStorage
    }

    set({ currentTheme: themeId });
  },

  loadTheme: async () => {
    let savedTheme = localStorage.getItem('anics_theme');

    try {
      const dbTheme: string | null = await invoke('get_setting', { key: 'app_theme' });
      if (dbTheme) savedTheme = dbTheme;
    } catch {
      // Fallback
    }

    const themeToApply = savedTheme || 'dark';
    document.documentElement.setAttribute('data-theme', themeToApply);
    set({ currentTheme: themeToApply });
  },
}));
