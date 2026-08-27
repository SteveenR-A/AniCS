import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { SearchPage } from '@/pages/SearchPage';
import { DetailsPage } from '@/pages/DetailsPage';
import { PlayerPage } from '@/pages/PlayerPage';
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
        <Route path="/details/:url" element={<DetailsPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/downloads" element={<DownloadsPage />} />
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

    // Suscribirse a eventos de descarga globales
    const unsubProgress = onDownloadProgress((progress) => {
      updateProgress(progress);
    });

    const unsubCompleted = onDownloadCompleted((result) => {
      console.log('Download completed:', result);
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
