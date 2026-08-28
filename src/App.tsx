import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { DetailsPage } from '@/pages/DetailsPage';
import { PlayerPage } from '@/pages/PlayerPage';
import { SchedulePage } from '@/pages/SchedulePage';
import { TopAnimePage } from '@/pages/TopAnimePage';
import { HistoryPage, FavoritesPage, DownloadsPage } from '@/pages/OtherPages';
import { SettingsPage } from '@/pages/SettingsPage';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { onDownloadProgress, onDownloadCompleted } from '@/services/downloadService';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { useThemeStore } from '@/stores/useThemeStore';

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
  const { updateProgress } = useDownloadStore();
  const { loadTheme } = useThemeStore();

  useEffect(() => {
    // Cargar tema visual guardado
    loadTheme();

    // Cargar fuentes de extracción al iniciar
    loadSources();

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

    // Suscribirse a eventos de descarga globales
    const unsubProgress = onDownloadProgress((progress) => {
      updateProgress(progress);
    });

    const unsubCompleted = onDownloadCompleted((result) => {
      // Marcar la tarea como completada en el store cuando Rust confirma la descarga
      useDownloadStore.getState().updateProgress({
        id: result.id,
        progress: 100,
        speedKbps: 0,
        downloadedBytes: 0,
        totalBytes: undefined,
        status: 'completed',
        error: undefined,
      });
    });

    return () => {
      unsubProgress.then(fn => fn());
      unsubCompleted.then(fn => fn());
    };
  }, []);

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
