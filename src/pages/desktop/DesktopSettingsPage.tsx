import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, Tv, RefreshCw, Check, Undo2,
  FolderOpen, ExternalLink, Sparkles, ShieldCheck, Palette, HardDrive, Trash2, Database, Activity, Cloud, User,
  Film, Clock, Crown, Plus, Layers, Lock, ArrowRightLeft, ShieldAlert
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { ProfileSelectorModal, getProfileAvatarIcon } from '@/components/ProfileSelectorModal';
import { GistSyncModal } from '@/components/GistSyncModal';
import { SubscriptionModal } from '@/components/SubscriptionModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSubscriptionStore, SUBSCRIPTION_PLANS } from '@/stores/useSubscriptionStore';
import { useAccountStore } from '@/stores/useAccountStore';
import { FEATURE_FLAGS } from '@/config/features';
import { getProfileStats } from '@/services/profileService';
import { getCacheStats, clearImageCache } from '@/services/downloadService';
import { getDatabaseStats, optimizeDatabase, resetDatabase, clearHistory, type DatabaseStats } from '@/services/storageService';
import { clearMemoryCache } from '@/components/CachedImage';
import { DEFAULT_JKANIME, DEFAULT_MUNDODONGHUA, DEFAULT_OTAKUSTV } from '@/services/animeService';
import { CURRENT_VERSION } from '@/services/updateService';
import type { ProfileStats } from '@/types';

declare const __APP_COMMIT_HASH__: string;

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

export function DesktopSettingsPage() {
  const { currentTheme, setTheme } = useThemeStore();
  const { isVip, openModal: openVipModal, activePlan } = useSubscriptionStore();
  const { quickLoginVipDemo, quickLoginFreeDemo, isSwitching: isAccountSwitching } = useAccountStore();

  const [jkanimeUrl, setJkanimeUrl] = useState(DEFAULT_JKANIME);
  const [donghuaUrl, setDonghuaUrl] = useState(DEFAULT_MUNDODONGHUA);
  const [otakustvUrl, setOtakustvUrl] = useState(DEFAULT_OTAKUSTV);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [customSources, setCustomSources] = useState<Array<{ name: string; url: string; type: string }>>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceType, setNewSourceType] = useState('Anime');

  const [downloadDir, setDownloadDir] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState('3');

  const [playerType, setPlayerType] = useState('internal');
  const [externalPlayerPath, setExternalPlayerPath] = useState('');

  const [updateRepo, setUpdateRepo] = useState('SteveenR-A/AniCS');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubRelease | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Descargador de actualización interna en segundo plano estilo VSCode
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const [cacheStats, setCacheStats] = useState<{ totalFormatted: string; fileCount: number } | null>(null);
  const [maxCacheMb, setMaxCacheMb] = useState('300');
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Mantenimiento de Base de Datos y Memoria
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isOptimizingDb, setIsOptimizingDb] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [windowDecorations, setWindowDecorations] = useState<boolean>(true);

  useEffect(() => {
    const unlisten = listen('update-download-progress', (event: any) => {
      const payload = event.payload;
      if (payload) {
        setDownloadProgress(payload.progress);
        const downloadedMb = (payload.downloaded / (1024 * 1024)).toFixed(1);
        const totalMb = payload.total > 0 ? (payload.total / (1024 * 1024)).toFixed(1) : '?';
        setDownloadStatusText(`${payload.progress.toFixed(0)}% (${downloadedMb} MB / ${totalMb} MB)`);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);


  const loadCache = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.error('Failed to get cache stats', e);
    }
  };

  const loadDb = async () => {
    try {
      const stats = await getDatabaseStats();
      setDbStats(stats);
    } catch (e) {
      console.error('Failed to get database stats', e);
    }
  };

  interface StorageLocations {
    downloadDir: string;
    imageCacheDir: string;
    databasePath: string;
    appDataDir: string;
  }

  const [storageLocations, setStorageLocations] = useState<StorageLocations | null>(null);

  const loadLocations = async () => {
    try {
      const locs = await invoke<StorageLocations>('get_storage_locations');
      setStorageLocations(locs);
      if (!downloadDir && locs.downloadDir) {
        setDownloadDir(locs.downloadDir);
      }
    } catch (e) {
      console.error('Failed to get storage locations', e);
    }
  };

  const handleSelectImageCacheDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de caché de imágenes',
      });
      if (selected && typeof selected === 'string') {
        const newPath = await invoke<string>('set_image_cache_dir', { customPath: selected });
        setStorageLocations(prev => prev ? { ...prev, imageCacheDir: newPath } : null);
        loadCache();
        setSaveStatus('Ubicación de caché actualizada');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } catch (e) {
      console.error('Error selecting image cache dir', e);
    }
  };

  const handleResetImageCacheDir = async () => {
    try {
      const defaultPath = await invoke<string>('set_image_cache_dir', { customPath: '' });
      setStorageLocations(prev => prev ? { ...prev, imageCacheDir: defaultPath } : null);
      loadCache();
      setSaveStatus('Caché restaurada a la ubicación por defecto');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error('Error resetting image cache dir', e);
    }
  };

  useEffect(() => {
    loadCache();
    loadDb();
    loadLocations();
    invoke<boolean>('get_window_decorations')
      .then(setWindowDecorations)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings: Record<string, string> = await invoke('get_all_settings');
        if (settings.jkanime_base_url) setJkanimeUrl(settings.jkanime_base_url);
        if (settings.mundodonghua_base_url) setDonghuaUrl(settings.mundodonghua_base_url);
        if (settings.otakustv_base_url) setOtakustvUrl(settings.otakustv_base_url);
        if (settings.download_dir) setDownloadDir(settings.download_dir);
        if (settings.max_concurrent_downloads) setMaxConcurrent(settings.max_concurrent_downloads);
        if (settings.player_type) setPlayerType(settings.player_type);
        if (settings.external_player_path) setExternalPlayerPath(settings.external_player_path);
        if (settings.github_repo) setUpdateRepo(settings.github_repo);
        if (settings.max_image_cache_mb) setMaxCacheMb(settings.max_image_cache_mb);
        if (settings.custom_sources) {
          try {
            const parsed = JSON.parse(settings.custom_sources);
            if (Array.isArray(parsed)) setCustomSources(parsed);
          } catch (e) {
            console.error('Error loading custom sources in Desktop:', e);
          }
        }
      } catch (e) {
        console.error('Error loading settings', e);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await invoke('set_setting', { key: 'jkanime_base_url', value: jkanimeUrl.trim() });
      await invoke('set_setting', { key: 'mundodonghua_base_url', value: donghuaUrl.trim() });
      await invoke('set_setting', { key: 'otakustv_base_url', value: otakustvUrl.trim() });
      await invoke('set_setting', { key: 'download_dir', value: downloadDir.trim() });
      await invoke('set_setting', { key: 'max_concurrent_downloads', value: maxConcurrent });
      await invoke('set_setting', { key: 'player_type', value: playerType });
      await invoke('set_setting', { key: 'external_player_path', value: externalPlayerPath.trim() });
      await invoke('set_setting', { key: 'github_repo', value: updateRepo.trim() });
      await invoke('set_setting', { key: 'max_image_cache_mb', value: maxCacheMb });
      await invoke('set_setting', { key: 'custom_sources', value: JSON.stringify(customSources) });

      setSaveStatus('Ajustes guardados correctamente');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('Error al guardar ajustes');
    }
  };

  const handleResetUrls = async () => {
    setJkanimeUrl(DEFAULT_JKANIME);
    setDonghuaUrl(DEFAULT_MUNDODONGHUA);
    setOtakustvUrl(DEFAULT_OTAKUSTV);
    try {
      await invoke('set_setting', { key: 'jkanime_base_url', value: DEFAULT_JKANIME });
      await invoke('set_setting', { key: 'mundodonghua_base_url', value: DEFAULT_MUNDODONGHUA });
      await invoke('set_setting', { key: 'otakustv_base_url', value: DEFAULT_OTAKUSTV });
      setSaveStatus('URLs de catálogos restauradas por defecto');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error('Error resetting URLs in Desktop', e);
    }
  };

  const handleSelectDownloadDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de descargas de AniCS',
      });
      if (selected && typeof selected === 'string') {
        setDownloadDir(selected);
      }
    } catch (e) {
      console.error('Dialog error', e);
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateInfo(null);
    try {
      const repo = updateRepo.trim() || 'SteveenR-A/AniCS';
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }
      const data: GitHubRelease = await response.json();
      setUpdateInfo(data);
    } catch (e: any) {
      setUpdateError(e?.message ?? 'No se pudo verificar actualizaciones');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const isNewVersionAvailable = (remoteTag: string) => {
    const cleanRemote = remoteTag.replace(/^v/i, '').trim();
    const cleanCurrent = CURRENT_VERSION.replace(/^v/i, '').trim();
    return cleanRemote !== cleanCurrent;
  };

  // Perfiles y Sincronización en la Nube
  const { profiles, activeProfile } = useProfileStore();
  const { config: syncConfig } = useSyncStore();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [activeProfileStats, setActiveProfileStats] = useState<ProfileStats | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const st = await getProfileStats(activeProfile?.id);
        setActiveProfileStats(st);
      } catch {}
    };
    loadStats();
    const handleSync = () => loadStats();
    window.addEventListener('anics:sync-completed', handleSync);
    return () => window.removeEventListener('anics:sync-completed', handleSync);
  }, [activeProfile?.id]);

  const ActiveProfileIcon = activeProfile ? getProfileAvatarIcon(activeProfile.avatar) : User;

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header Desktop */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Ajustes y Preferencias</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            Configuración global de fuentes, descargas, reproductor, perfiles y sincronización
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleSave}
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 22px',
            color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, boxShadow: 'var(--shadow-glow)',
          }}
        >
          <Check size={16} /> Guardar Cambios
        </motion.button>
      </div>

      <AnimatePresence>
        {saveStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              padding: '12px 18px', borderRadius: 'var(--radius-md)',
              background: 'rgba(16,185,129,0.15)', border: '1px solid var(--accent-success)',
              color: 'var(--accent-success)', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24,
            }}
          >
            <Check size={16} /> {saveStatus}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Perfiles de Usuario y Sincronización en la Nube */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.15)' }}>
              <Cloud size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cuentas y Sincronización en la Nube</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Perfiles locales multi-usuario y sincronización en la nube con Cuenta de Google / Firebase
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Perfil Activo */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: activeProfile?.color || '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    boxShadow: `0 4px 12px ${(activeProfile?.color || '#3b82f6')}55`,
                  }}
                >
                  <ActiveProfileIcon size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>
                    {activeProfile?.name || 'Principal'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {profiles.length} {profiles.length === 1 ? 'perfil registrado' : 'perfiles registrados'}
                  </div>
                  {activeProfileStats && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span
                        title="Animes con al menos 1 episodio completado (≥80%)"
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-elevated)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                        }}
                      >
                        <Tv size={11} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.animesCount} {activeProfileStats.animesCount === 1 ? 'anime' : 'animes'}
                      </span>
                      <span
                        title="Episodios completados (≥80%)"
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-elevated)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                        }}
                      >
                        <Film size={11} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.episodesCount} episodios
                      </span>
                      <span
                        title="Horas acumuladas vistas"
                        style={{
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'var(--bg-elevated)',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                        }}
                      >
                        <Clock size={11} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.hoursWatched}h vistas
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 14px',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cambiar Perfil
              </button>
            </div>

            {/* Cloud Sync Status */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    background: syncConfig.userId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    border: syncConfig.userId ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: syncConfig.userId ? '#10b981' : 'var(--accent-primary)',
                  }}
                >
                  <Cloud size={22} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>Sincronización en la Nube</span>
                    {syncConfig.userId && (
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: '8px', background: 'rgba(16,185,129,0.2)', color: '#10b981' }}>
                        Activo
                      </span>
                    )}
                    {FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        background: isVip ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.15)',
                        color: '#fbbf24', padding: '1px 6px', borderRadius: '6px',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                      }}>
                        <Crown size={10} />
                        VIP
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {syncConfig.userId
                      ? (syncConfig.userEmail || (syncConfig.lastSyncAt ? `Sync: ${new Date(syncConfig.lastSyncAt).toLocaleDateString()}` : 'Conectado'))
                      : 'Historial y favoritos multi-dispositivo'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                style={{
                  background: 'var(--accent-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '8px 14px',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {syncConfig.userId ? 'Gestionar Cuenta' : 'Iniciar Sesión'}
              </button>
            </div>

            {/* Barra de Demostración Rápida Multicuentas */}
            {FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  marginTop: '10px',
                  padding: '14px 18px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px dashed var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    <ArrowRightLeft size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      Demostración Multicuentas en Vivo
                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                        QA / Presentación
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Cambia al instante entre la cuenta VIP y la cuenta Gratis para verificar el bloqueo y desbloqueo de funciones Pro.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    disabled={isAccountSwitching || (syncConfig.userEmail === 'vip@anics.app' && isVip)}
                    onClick={() => quickLoginVipDemo()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: (isAccountSwitching || (syncConfig.userEmail === 'vip@anics.app' && isVip)) ? 'default' : 'pointer',
                      background: (syncConfig.userEmail === 'vip@anics.app' && isVip)
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))',
                      border: (syncConfig.userEmail === 'vip@anics.app' && isVip)
                        ? '1px solid #f59e0b'
                        : '1px solid rgba(245, 158, 11, 0.3)',
                      color: '#fbbf24',
                      opacity: (syncConfig.userEmail === 'vip@anics.app' && isVip) ? 0.9 : 1,
                    }}
                  >
                    <Crown size={14} />
                    {syncConfig.userEmail === 'vip@anics.app' && isVip ? 'Activa: VIP (vip@anics.app)' : 'Probar Cuenta VIP'}
                  </button>

                  <button
                    type="button"
                    disabled={isAccountSwitching || (syncConfig.userEmail === 'gratis@anics.app' && !isVip)}
                    onClick={() => quickLoginFreeDemo()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: (isAccountSwitching || (syncConfig.userEmail === 'gratis@anics.app' && !isVip)) ? 'default' : 'pointer',
                      background: (syncConfig.userEmail === 'gratis@anics.app' && !isVip)
                        ? 'rgba(100, 116, 139, 0.25)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: (syncConfig.userEmail === 'gratis@anics.app' && !isVip)
                        ? '1px solid #94a3b8'
                        : '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      opacity: (syncConfig.userEmail === 'gratis@anics.app' && !isVip) ? 0.9 : 1,
                    }}
                  >
                    <User size={14} />
                    {syncConfig.userEmail === 'gratis@anics.app' && !isVip ? 'Activa: Gratis (gratis@anics.app)' : 'Probar Cuenta Gratis'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSyncModalOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Gestionar...
                  </button>
                </div>
              </div>
            )}

            {/* Suscripción Yumework VIP (Tarjetas de Planes / Membresía Activa) */}
            {FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
              <div style={{ gridColumn: '1 / -1', marginTop: '6px' }}>
                {isVip ? (
                  /* Tarjeta de Membresía VIP Activa */
                  <div
                    style={{
                      padding: '20px 24px',
                      borderRadius: 'var(--radius-lg)',
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.08))',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      boxShadow: '0 8px 24px -6px rgba(245, 158, 11, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '20px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div
                        style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 16px rgba(245, 158, 11, 0.4)',
                          flexShrink: 0,
                        }}
                      >
                        <Crown size={26} color="#ffffff" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                            Yumework VIP Pass
                          </span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '3px 9px',
                              borderRadius: '9999px',
                              background: '#f59e0b',
                              color: '#000',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}
                          >
                            Membresía Activa
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#fbbf24' }}>
                          Plan {activePlan === 'annual' ? 'Anual ($35/año)' : 'Mensual ($3.50/mes)'} con todos los beneficios desbloqueados
                        </p>
                        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                          <span>✓ Sincronización en la nube</span>
                          <span>✓ Servidores Magi y Desu</span>
                          <span>✓ Descargas HD 1080p</span>
                          <span>✓ Temas VIP</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={openVipModal}
                      style={{
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid #f59e0b',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 18px',
                        color: '#fbbf24',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Gestionar Suscripción
                    </button>
                  </div>
                ) : (
                  /* Tarjetas de Versión de Pago (Planes de Suscripción) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Crown size={18} color="#f59e0b" />
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', margin: 0 }}>
                            Planes de Suscripción Yumework VIP
                          </h3>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                          Elige el plan ideal para desbloquear descargas offline, servidores de alta velocidad y sincronización en la nube
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                      {SUBSCRIPTION_PLANS.map((plan) => {
                        const isPopular = plan.popular;
                        return (
                          <div
                            key={plan.id}
                            style={{
                              background: isPopular
                                ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(17, 19, 24, 0.95))'
                                : 'var(--bg-surface-2, rgba(255, 255, 255, 0.03))',
                              border: isPopular ? '1.5px solid #f59e0b' : '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-lg)',
                              padding: '18px 20px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              gap: 14,
                              position: 'relative',
                              boxShadow: isPopular ? '0 8px 24px -4px rgba(245, 158, 11, 0.2)' : 'none',
                            }}
                          >
                            {isPopular && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: -10,
                                  right: 18,
                                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                  color: '#000',
                                  fontSize: 10,
                                  fontWeight: 800,
                                  padding: '2px 10px',
                                  borderRadius: 10,
                                  letterSpacing: '0.03em',
                                  textTransform: 'uppercase',
                                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                                }}
                              >
                                Más Popular • 2 Meses Gratis
                              </div>
                            )}

                            <div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: 'white' }}>
                                {plan.name}
                              </div>
                              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 12px', minHeight: 32 }}>
                                {plan.description}
                              </p>

                              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 14 }}>
                                <span style={{ fontSize: 28, fontWeight: 900, color: isPopular ? '#fbbf24' : '#ffffff' }}>
                                  {plan.price}
                                </span>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {plan.period}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {plan.features.map((feat, fIdx) => (
                                  <div key={fIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                                    <Check size={13} color="#10b981" style={{ flexShrink: 0 }} />
                                    <span>{feat}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={openVipModal}
                              style={{
                                marginTop: 8,
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                background: isPopular
                                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                  : 'rgba(245, 158, 11, 0.15)',
                                color: isPopular ? '#000' : '#fbbf24',
                                fontSize: 13,
                                fontWeight: 800,
                                cursor: 'pointer',
                                transition: 'all var(--transition-fast)',
                              }}
                            >
                              Suscribirme ({plan.price})
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Temas */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
              <Palette size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Tema y Paleta de Colores</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Selecciona tu estilo visual favorito para la aplicación
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
            gap: 12,
          }}>
            {THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id;
              const isVipLocked = Boolean(theme.isVipOnly && FEATURE_FLAGS.SHOW_SUBSCRIPTION && !isVip);
              return (
                <motion.div
                  key={theme.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (isVipLocked) {
                      openVipModal();
                    } else {
                      setTheme(theme.id);
                    }
                  }}
                  style={{
                    background: theme.surfaceColor,
                    border: isSelected
                      ? `2px solid ${theme.primaryColor}`
                      : isVipLocked
                      ? '1px dashed rgba(245, 158, 11, 0.4)'
                      : '1px solid var(--border-moderate)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? `0 0 16px ${theme.primaryColor}40` : 'none',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: theme.isDark ? '#f8fafc' : '#0f172a' }}>
                        {theme.name}
                      </span>
                      {theme.isVipOnly && FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            background: isVipLocked ? 'rgba(245, 158, 11, 0.15)' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                            color: isVipLocked ? '#fbbf24' : '#000',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <Crown size={9} />
                          VIP
                        </span>
                      )}
                    </div>
                    {isSelected ? (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: theme.primaryColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={12} color={theme.isDark ? '#000' : '#fff'} />
                      </div>
                    ) : isVipLocked ? (
                      <div title="Tema exclusivo VIP" style={{ color: '#fbbf24', display: 'flex', alignItems: 'center' }}>
                        <Lock size={13} />
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.baseColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.surfaceColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.primaryColor }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.secondaryColor }} />
                  </div>

                  <p style={{ fontSize: 11, color: theme.isDark ? '#94a3b8' : '#64748b', lineHeight: 1.3, margin: 0, flex: 1 }}>
                    {theme.description}
                  </p>

                  {theme.tag && (
                    <div style={{
                      alignSelf: 'flex-start',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: `${theme.primaryColor}20`,
                      border: `1px solid ${theme.primaryColor}40`,
                      color: theme.primaryColor,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                    }}>
                      {theme.tag}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Barra de Título / Decoraciones de Ventana (Especialmente para Hyprland / Tiling WMs) */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(168, 85, 247, 0.15)' }}>
                <Layers size={20} color="var(--accent-secondary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Barra de Título del Sistema</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Decoraciones nativas de la ventana (se recomienda desactivar en Hyprland, Sway o gestores de ventanas tipo Tiling)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                const nextState = !windowDecorations;
                try {
                  await invoke('set_window_decorations', { enabled: nextState });
                  setWindowDecorations(nextState);
                  setSaveStatus(nextState ? 'Barra de título activada' : 'Barra de título desactivada (Modo Hyprland / Sin bordes)');
                  setTimeout(() => setSaveStatus(null), 3000);
                } catch (err) {
                  console.error(err);
                }
              }}
              style={{
                background: windowDecorations ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                border: windowDecorations ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '9px 18px',
                color: windowDecorations ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Check size={15} color={windowDecorations ? 'var(--accent-primary)' : 'transparent'} />
              {windowDecorations ? 'Barra de título visible' : 'Ocultar barra de título (Recomendado Hyprland)'}
            </button>
          </div>
        </div>

        {/* Fuentes y Catálogos de Contenido */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
                <Globe size={20} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Fuentes y Catálogos de Contenido</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Catálogos integrados de streaming y configuración de fuentes
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={handleResetUrls}
                title="Restablecer catálogos predeterminados"
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '6px 14px',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
                }}
              >
                <Undo2 size={14} /> Restablecer Predeterminados
              </button>

              <button
                type="button"
                onClick={() => setShowAddSourceModal(true)}
                style={{
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  padding: '6px 14px',
                  color: 'var(--accent-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Agregar Fuente...
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            {/* Catálogo Principal */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    <Layers size={20} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Catálogo Anime (Principal)</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Emisiones de temporada, episodios recientes y catálogo general
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                  Conectado
                </span>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  URL Servidor / Endpoint:
                </label>
                <input
                  type="text"
                  value={jkanimeUrl}
                  onChange={(e) => setJkanimeUrl(e.target.value)}
                  placeholder="https://jkanime.net"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Catálogo Secundario */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(236, 72, 153, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ec4899',
                    }}
                  >
                    <Layers size={20} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Catálogo Donghua (Secundario)</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Animación asiática, donghuas y series alternativas
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                  Conectado
                </span>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  URL Servidor / Endpoint:
                </label>
                <input
                  type="text"
                  value={donghuaUrl}
                  onChange={(e) => setDonghuaUrl(e.target.value)}
                  placeholder="https://www.mundodonghua.com"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Catálogo de Respaldo */}
            <div
              style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(245, 158, 11, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f59e0b',
                    }}
                  >
                    <Layers size={20} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff' }}>Catálogo Anime (Respaldo)</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                      Servidor espejo OtakusTV para alta disponibilidad y contingencia
                    </p>
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                  Conectado
                </span>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600 }}>
                  URL Servidor / Endpoint:
                </label>
                <input
                  type="text"
                  value={otakustvUrl}
                  onChange={(e) => setOtakustvUrl(e.target.value)}
                  placeholder="https://www.otakustv.net"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Fuentes personalizadas añadidas */}
            {customSources.map((src, idx) => (
              <div
                key={idx}
                style={{
                  gridColumn: '1 / -1',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Globe size={18} color="var(--accent-primary)" />
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#fff' }}>{src.name} ({src.type})</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{src.url}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const updated = customSources.filter((_, i) => i !== idx);
                    setCustomSources(updated);
                    try {
                      await invoke('set_setting', { key: 'custom_sources', value: JSON.stringify(updated) });
                      setSaveStatus('Catálogo eliminado');
                      setTimeout(() => setSaveStatus(null), 3000);
                    } catch (e) {
                      console.error('Error saving custom sources after deletion', e);
                    }
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#f87171',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Descargas */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-secondary-glow)' }}>
              <Download size={20} color="var(--accent-secondary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Descargas Desktop</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Carpeta local en disco y conexiones simultáneas
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                Carpeta de Descargas
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={downloadDir}
                  onChange={(e) => setDownloadDir(e.target.value)}
                  placeholder="Por defecto: Carpeta Videos/AniCS"
                  style={{
                    flex: 1, minWidth: 260, background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                    padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (downloadDir) {
                      try {
                        await openPath(downloadDir);
                      } catch (err) {
                        console.error('Error al abrir carpeta de descargas:', err);
                      }
                    }
                  }}
                  title="Abrir carpeta de descargas en el gestor de archivos"
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                    borderRadius: 'var(--radius-md)', padding: '10px 16px',
                    color: 'var(--text-primary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                  }}
                >
                  <FolderOpen size={16} color="var(--accent-primary)" /> Abrir
                </button>
                <button
                  onClick={handleSelectDownloadDir}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                    borderRadius: 'var(--radius-md)', padding: '10px 16px',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                  }}
                >
                  <FolderOpen size={16} /> Explorar
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                Descargas Simultáneas
              </label>
              <select
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(e.target.value)}
                style={{
                  width: 150, background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              >
                <option value="1">1 episodio</option>
                <option value="2">2 episodios</option>
                <option value="3">3 episodios</option>
                <option value="4">4 episodios</option>
                <option value="6">6 episodios</option>
              </select>
            </div>
          </div>
        </div>

        {/* Reproductor */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
              <Tv size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Reproductor de Video</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Reproducción nativa integrada o externa
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { id: 'internal', label: 'Reproductor Integrado AniCS' },
                { id: 'external', label: 'Reproductor Externo (MPV / VLC)' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPlayerType(p.id)}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 'var(--radius-md)',
                    background: playerType === p.id ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                    border: playerType === p.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    color: playerType === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: playerType === p.id ? 700 : 500, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {playerType === 'external' && (
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                  Ruta ejecutable MPV / VLC
                </label>
                <input
                  type="text"
                  value={externalPlayerPath}
                  onChange={(e) => setExternalPlayerPath(e.target.value)}
                  placeholder={typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows') ? "C:\\Program Files\\mpv\\mpv.exe" : "/usr/bin/mpv (o mpv / vlc)"}
                  style={{
                    width: '100%', background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                    padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Almacenamiento Caché */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.15)' }}>
              <HardDrive size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Caché en Disco e Imágenes</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Imágenes almacenadas localmente para navegación rápida y desconectada
              </p>
            </div>
          </div>

          {/* Banner de ruta física de caché */}
          <div style={{
            background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Ubicación física en disco
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: 2, wordBreak: 'break-all' }}>
                {storageLocations?.imageCacheDir || 'Cargando directorio...'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  if (storageLocations?.imageCacheDir) {
                    try {
                      await openPath(storageLocations.imageCacheDir);
                    } catch (err) {
                      console.error('Error abriendo caché:', err);
                    }
                  }
                }}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '7px 12px',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <FolderOpen size={14} color="var(--accent-primary)" /> Abrir
              </button>
              <button
                type="button"
                onClick={handleSelectImageCacheDir}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '7px 12px',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                Cambiar
              </button>
              <button
                type="button"
                onClick={handleResetImageCacheDir}
                title="Restaurar a la ubicación predeterminada del sistema"
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '7px 10px',
                  color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer',
                }}
              >
                <Undo2 size={13} />
              </button>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-elevated)', padding: '16px 20px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {cacheStats ? `${cacheStats.fileCount} imágenes (${cacheStats.totalFormatted})` : 'Calculando...'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Gestor automático SQLite con caché RAM L1
              </div>
            </div>

            <button
              onClick={async () => {
                setIsClearingCache(true);
                try {
                  const res = await clearImageCache();
                  setSaveStatus(`Caché liberada: ${res.freedFormatted}`);
                  loadCache();
                  setTimeout(() => setSaveStatus(null), 3000);
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsClearingCache(false);
                }
              }}
              disabled={isClearingCache}
              style={{
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)', padding: '9px 18px',
                color: 'var(--accent-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} /> {isClearingCache ? 'Limpiando...' : 'Vaciar Caché'}
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>
              Límite de Almacenamiento en Disco (Poda LRU automática)
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: '100', label: '100 MB' },
                { value: '300', label: '300 MB (Recomendado)' },
                { value: '500', label: '500 MB' },
                { value: '1024', label: '1 GB' },
                { value: '2048', label: '2 GB' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxCacheMb(opt.value)}
                  style={{
                    padding: '8px 16px', borderRadius: 'var(--radius-md)',
                    background: maxCacheMb === opt.value ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                    border: maxCacheMb === opt.value ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    color: maxCacheMb === opt.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: maxCacheMb === opt.value ? 700 : 400, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Base de Datos SQLite y Memoria */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.15)' }}>
              <Database size={20} color="var(--accent-success)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Base de Datos y Rendimiento (SQLite)</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Mantenimiento de integridad, optimización de índices y limpieza segura sin dañar la app
              </p>
            </div>
          </div>

          {/* Banner de ruta física de base de datos */}
          <div style={{
            background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)', marginBottom: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Archivo de Base de Datos SQLite
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: 2, wordBreak: 'break-all' }}>
                {storageLocations?.databasePath || 'Cargando directorio...'}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (storageLocations?.appDataDir) {
                  try {
                    await openPath(storageLocations.appDataDir);
                  } catch (err) {
                    console.error('Error abriendo carpeta de datos:', err);
                  }
                }
              }}
              style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '7px 12px',
                color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <FolderOpen size={14} color="#34d399" /> Abrir carpeta de datos
            </button>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, marginBottom: 18,
          }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tamaño Archivo DB</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                {dbStats ? dbStats.databaseSizeFormatted : 'Cargando...'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Historial Guardado</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                {dbStats ? `${dbStats.historyCount} episodios` : '...'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Animes Favoritos</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>
                {dbStats ? `${dbStats.favoritesCount} animes` : '...'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={async () => {
                setIsOptimizingDb(true);
                try {
                  await optimizeDatabase();
                  clearMemoryCache(); // Liberar memoria RAM
                  await loadDb();
                  setSaveStatus('Base de datos optimizada y desfragmentada (VACUUM)');
                  setTimeout(() => setSaveStatus(null), 3000);
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsOptimizingDb(false);
                }
              }}
              disabled={isOptimizingDb}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '10px 18px',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Sparkles size={15} color="#34d399" />
              {isOptimizingDb ? 'Optimizando...' : 'Optimizar y Compactar (VACUUM)'}
            </button>

            <button
              onClick={async () => {
                const proceed = window.confirm('¿Seguro que deseas vaciar el historial de episodios vistos?');
                if (!proceed) return;

                const clearCloudToo = window.confirm(
                  '¿Deseas eliminar este historial también en tus otros dispositivos y en la nube?\n\n' +
                  '• Aceptar: Borrar en todos los dispositivos (nube y local).\n' +
                  '• Cancelar: Borrar SOLO en este equipo (la sincronización se pausará para proteger la nube).'
                );

                try {
                  await clearHistory();
                  await loadDb();
                  if (clearCloudToo) {
                    useSyncStore.getState().triggerDebouncedSync();
                    setSaveStatus('Historial de reproducción vaciado (nube y local)');
                  } else {
                    await useSyncStore.getState().pauseSyncByLocalClear();
                    setSaveStatus('Historial vaciado en este equipo (sincronización pausada)');
                  }
                  setTimeout(() => setSaveStatus(null), 4000);
                } catch (e) {
                  console.error(e);
                }
              }}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '10px 18px',
                color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Trash2 size={15} color="#f59e0b" /> Limpiar Solo Historial
            </button>

            <button
              onClick={async () => {
                if (!window.confirm('¿Estás seguro de restablecer la base de datos completa? Se limpiará el historial y favoritos de forma local y se desvincularán las credenciales de sincronización.')) return;
                setIsResettingDb(true);
                try {
                  await resetDatabase();
                  await useSyncStore.getState().logout();
                  clearMemoryCache();
                  await loadDb();
                  setSaveStatus('Base de datos restablecida limpiamente');
                  setTimeout(() => setSaveStatus(null), 3000);
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsResettingDb(false);
                }
              }}
              disabled={isResettingDb}
              style={{
                background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)', padding: '10px 18px',
                color: 'var(--accent-error)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Activity size={15} /> {isResettingDb ? 'Restableciendo...' : 'Restablecer Base de Datos'}
            </button>
          </div>
        </div>


        {/* Actualizaciones GitHub */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
                <RefreshCw size={20} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Actualizaciones (GitHub Releases)</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Comprueba nuevas versiones o reinstala parches
                </p>
              </div>
            </div>

            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdate}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '9px 18px',
                color: 'var(--text-primary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
              }}
            >
              <RefreshCw size={15} style={{ animation: isCheckingUpdate ? 'spin-slow 1s linear infinite' : 'none' }} />
              {isCheckingUpdate ? 'Comprobando...' : 'Buscar Actualizaciones'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, marginBottom: 14 }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Versión instalada:{' '}
              <strong style={{ color: 'var(--text-primary)' }}>v{CURRENT_VERSION}</strong>
              {typeof __APP_COMMIT_HASH__ !== 'undefined' && __APP_COMMIT_HASH__ && (
                <span
                  onClick={() => openUrl(`https://github.com/${updateRepo}/commit/${__APP_COMMIT_HASH__}`)}
                  title="Ver commit en GitHub"
                  style={{
                    marginLeft: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                    padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 11,
                    color: 'var(--accent-primary)', cursor: 'pointer',
                  }}
                >
                  #{__APP_COMMIT_HASH__}
                </span>
              )}
            </span>
          </div>

          {updateError && (
            <div style={{
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--border-subtle)',
              color: 'var(--accent-error)', fontSize: 13, marginBottom: 12,
            }}>
              {updateError}
            </div>
          )}

          {updateInfo && (
            <div style={{
              background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)', padding: 18,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-primary)' }}>
                    {updateInfo.name || updateInfo.tag_name}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    background: isNewVersionAvailable(updateInfo.tag_name) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                    color: isNewVersionAvailable(updateInfo.tag_name) ? 'var(--accent-success)' : 'var(--accent-primary)',
                  }}>
                    {isNewVersionAvailable(updateInfo.tag_name) ? 'Nueva versión disponible' : 'Misma versión (Reinstalador)'}
                  </span>
                </div>
                <button
                  onClick={() => openUrl(updateInfo.html_url)}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent-primary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                  }}
                >
                  Ver en GitHub <ExternalLink size={13} />
                </button>
              </div>

              {/* Notas del parche del release */}
              {updateInfo.body && (
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 14,
                  maxHeight: 180, overflowY: 'auto', fontSize: 12, lineHeight: 1.6,
                  color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontFamily: 'inherit',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} color="var(--accent-primary)" /> Novedades y cambios de esta versión:
                  </div>
                  {updateInfo.body}
                </div>
              )}

              {/* Descarga interna en segundo plano estilo VSCode */}
              {downloadingAsset && (
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
                  borderRadius: 'var(--radius-md)', padding: 14, marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-primary)' }}>Descargando actualización en segundo plano...</span>
                    <span style={{ color: 'var(--accent-primary)' }}>{downloadStatusText}</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${downloadProgress}%`, height: '100%',
                      background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                      transition: 'width 0.2s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Solo mostrar el instalador de Windows (.exe) */}
              {updateInfo.assets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {updateInfo.assets
                    .filter(asset => asset.name.toLowerCase().endsWith('.exe'))
                    .map((asset) => (
                      <button
                        key={asset.name}
                        disabled={Boolean(downloadingAsset)}
                        onClick={async () => {
                          setDownloadingAsset(asset.name);
                          setDownloadProgress(0);
                          setDownloadStatusText('Iniciando descarga interna...');
                          try {
                            await invoke('download_and_run_installer', {
                              url: asset.browser_download_url,
                              filename: asset.name,
                            });
                            setDownloadStatusText('¡Instalador iniciado! Se actualizará la aplicación.');
                          } catch (err: any) {
                            console.error('Error al descargar instalador', err);
                            setDownloadStatusText(`Error: ${err?.message || err}`);
                          } finally {
                            setTimeout(() => setDownloadingAsset(null), 6000);
                          }
                        }}
                        style={{
                          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                          border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px',
                          color: 'white', cursor: downloadingAsset ? 'not-allowed' : 'pointer', fontSize: 13,
                          fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                          boxShadow: 'var(--shadow-glow)', opacity: downloadingAsset ? 0.7 : 1,
                        }}
                      >
                        <Download size={16} />
                        <span>{downloadingAsset === asset.name ? 'Descargando e Instalando...' : 'Descargar e Instalar Actualización'}</span>
                        <span style={{ fontSize: 11, opacity: 0.85 }}>
                          ({(asset.size / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Acerca de */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={26} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>AniCS — Edición Desktop</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Versión {CURRENT_VERSION} · Tauri v2 + Rust + React
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowChangelog(true)}
            style={{
              background: 'var(--accent-primary-glow)', border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-md)', padding: '9px 18px',
              color: 'var(--text-primary)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700,
            }}
          >
            <Sparkles size={15} color="var(--accent-primary)" /> Notas de Parche
          </button>
        </div>

        {/* Aviso de Arquitectura Descentralizada y Exención Legal */}
        <div style={{
          marginTop: 12,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
        }}>
          <ShieldAlert size={20} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 13, display: 'block', marginBottom: 4 }}>
              Arquitectura Cliente Descentralizada & Licencia Libre (GNU GPLv3)
            </strong>
            AniCS opera estrictamente como un cliente y reproductor multimedia local agnóstico. La plataforma <strong>no almacena, no aloja ni distribuye ningún archivo o video en servidores propios</strong>. Toda la resolución de flujos e hipervínculos se procesa en tiempo real en el dispositivo del usuario, garantizando total transparencia, respeto a la privacidad y bajo consumo de recursos del sistema.
          </div>
        </div>
      </div>

      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
      <ProfileSelectorModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      <GistSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
      <SubscriptionModal />

      {/* Modal para agregar fuente o catálogo personalizado */}
      <AnimatePresence>
        {showAddSourceModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={() => setShowAddSourceModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '480px',
                background: 'var(--bg-surface, #111318)',
                border: '1px solid var(--border-moderate)',
                borderRadius: '18px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                Agregar Catálogo o Fuente Personalizada
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                Configura un catálogo de contenido personalizado para explorar animes adicionales en AniCS.
              </p>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Nombre del Catálogo
                </label>
                <input
                  type="text"
                  placeholder="ej. Catálogo Alternativo"
                  value={newSourceName}
                  onChange={(e) => setNewSourceName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Tipo de Contenido
                </label>
                <select
                  value={newSourceType}
                  onChange={(e) => setNewSourceType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Anime">Anime</option>
                  <option value="Donghua">Donghua</option>
                  <option value="Series">Series y Películas</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  URL o Endpoint del Catálogo
                </label>
                <input
                  type="text"
                  placeholder="https://catalogo.ejemplo.com"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddSourceModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: '1px solid var(--border-moderate)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (newSourceName.trim() && newSourceUrl.trim()) {
                      let url = newSourceUrl.trim();
                      if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                      }
                      const updated = [...customSources, { name: newSourceName.trim(), url, type: newSourceType }];
                      setCustomSources(updated);
                      try {
                        await invoke('set_setting', { key: 'custom_sources', value: JSON.stringify(updated) });
                        setSaveStatus('Catálogo personalizado guardado');
                      } catch (e) {
                        console.error('Error saving custom source in Desktop', e);
                        setSaveStatus('Error al guardar catálogo');
                      }
                      setNewSourceName('');
                      setNewSourceUrl('');
                      setShowAddSourceModal(false);
                      setTimeout(() => setSaveStatus(null), 3000);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Guardar Catálogo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
