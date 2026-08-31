import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { DetailsPage } from '@/pages/DetailsPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { TopAnimePage } from '@/pages/TopAnimePage';
import { HistoryPage, FavoritesPage, DownloadsPage } from '@/pages/OtherPages';
import { SettingsPage } from '@/pages/SettingsPage';
import { ChangelogModal } from '@/components/ChangelogModal';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useThemeStore } from '@/stores/useThemeStore';
import { checkForAppUpdates, CURRENT_VERSION } from '@/services/updateService';

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/top" element={<TopAnimePage />} />
        <Route path="/details/:url" element={<DetailsPage />} />
        <Route path="/details" element={<DetailsPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      {/* El reproductor ocupa pantalla completa, fuera del AppShell */}
      <Route path="/player" element={<PlayerPage />} />
    </Routes>
  );
}

export default function App() {
  const { loadSources } = useAnimeStore();
  const { init: initDownloads, cleanup: cleanupDownloads } = useDownloadStore();
  const { loadTheme } = useThemeStore();
  const [showPatchNotes, setShowPatchNotes] = useState(false);

  useEffect(() => {
    // Cargar tema visual guardado
    loadTheme();

    // Cargar fuentes de extracción al iniciar
    loadSources();

    // Hidratar descargas de SQLite y activar listeners
    initDownloads();

    // Comprobar si es la primera vez que se abre esta versión para mostrar notas de parche
    try {
      const lastSeenVersion = localStorage.getItem('anics_last_seen_version');
      if (lastSeenVersion !== CURRENT_VERSION) {
        setShowPatchNotes(true);
      }
    } catch {}

    // Solicitar permisos de notificación al inicio (Android necesita POST_NOTIFICATIONS desde API 33)
    (async () => {
      try {
        const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
        const granted = await isPermissionGranted();
        if (!granted) {
          await requestPermission();
        }
      } catch {
        // En desktop o si falla, ignorar silenciosamente
      }
    })();

    // Comprobación de nuevas versiones en segundo plano tras inicializar la UI
    const timer = setTimeout(() => {
      checkForAppUpdates(true);
    }, 3000);

    return () => {
      clearTimeout(timer);
      cleanupDownloads();
    };
  }, [loadTheme, loadSources, initDownloads, cleanupDownloads]);

  const handleClosePatchNotes = () => {
    try {
      localStorage.setItem('anics_last_seen_version', CURRENT_VERSION);
    } catch {}
    setShowPatchNotes(false);
  };

  return (
    <BrowserRouter>
      <AppRoutes />
      <ChangelogModal isOpen={showPatchNotes} onClose={handleClosePatchNotes} />
    </BrowserRouter>
  );
}
