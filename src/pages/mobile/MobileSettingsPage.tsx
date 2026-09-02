import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, RefreshCw, Check, Undo2,
  Sparkles, ShieldCheck, Palette, HardDrive, Trash2, Database, Activity, Folder, Cloud, User,
  Film, Clock, Tv
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { ProfileSelectorModal, getProfileAvatarIcon } from '@/components/ProfileSelectorModal';
import { GistSyncModal } from '@/components/GistSyncModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { getProfileStats } from '@/services/profileService';
import { getCacheStats, clearImageCache } from '@/services/downloadService';
import { getDatabaseStats, optimizeDatabase, resetDatabase, clearHistory, type DatabaseStats } from '@/services/storageService';
import { clearMemoryCache } from '@/components/CachedImage';
import { DEFAULT_JKANIME, DEFAULT_MUNDODONGHUA, DEFAULT_ANDROID_DOWNLOAD_DIR } from '@/services/animeService';
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

export function MobileSettingsPage() {
  const { currentTheme, setTheme } = useThemeStore();

  const [jkanimeUrl, setJkanimeUrl] = useState(DEFAULT_JKANIME);
  const [donghuaUrl, setDonghuaUrl] = useState(DEFAULT_MUNDODONGHUA);
  const [downloadDir, setDownloadDir] = useState(DEFAULT_ANDROID_DOWNLOAD_DIR);

  const [maxConcurrent, setMaxConcurrent] = useState('3');
  const [updateRepo] = useState('SteveenR-A/AniCS');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubRelease | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  // Estados de Descarga Interna de APK
  const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string | null>(null);
  const [downloadedApkMap, setDownloadedApkMap] = useState<Record<string, string>>({});

  const [cacheStats, setCacheStats] = useState<{ totalFormatted: string; fileCount: number } | null>(null);
  const [maxCacheMb, setMaxCacheMb] = useState('300');
  const [isClearingCache, setIsClearingCache] = useState(false);

  // Mantenimiento de Base de Datos y Memoria
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [isOptimizingDb, setIsOptimizingDb] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);

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

  useEffect(() => {
    loadCache();
    loadDb();

    // Escuchar progreso en tiempo real de la descarga interna del APK
    const unlisten = listen('update-download-progress', (event: any) => {
      const { progress, downloaded, total } = event.payload || {};
      if (typeof progress === 'number') {
        setDownloadProgress(Math.round(progress));
        const dlMb = (downloaded / (1024 * 1024)).toFixed(1);
        const totMb = (total / (1024 * 1024)).toFixed(1);
        setDownloadStatusText(`${Math.round(progress)}% (${dlMb} MB / ${totMb} MB)`);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings: Record<string, string> = await invoke('get_all_settings');
        if (settings.jkanime_base_url) setJkanimeUrl(settings.jkanime_base_url);
        if (settings.mundodonghua_base_url) setDonghuaUrl(settings.mundodonghua_base_url);
        if (settings.download_dir) {
          setDownloadDir(settings.download_dir);
        } else {
          try {
            const defDir: string = await invoke('get_default_download_dir');
            if (defDir) setDownloadDir(defDir);
          } catch { }
        }
        if (settings.max_concurrent_downloads) setMaxConcurrent(settings.max_concurrent_downloads);
        if (settings.max_image_cache_mb) setMaxCacheMb(settings.max_image_cache_mb);
      } catch (e) {
        console.error('Error loading settings in Mobile', e);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      await invoke('set_setting', { key: 'jkanime_base_url', value: jkanimeUrl.trim() });
      await invoke('set_setting', { key: 'mundodonghua_base_url', value: donghuaUrl.trim() });
      await invoke('set_setting', { key: 'download_dir', value: downloadDir.trim() });
      await invoke('set_setting', { key: 'max_concurrent_downloads', value: maxConcurrent });
      await invoke('set_setting', { key: 'max_image_cache_mb', value: maxCacheMb });

      setSaveStatus('Ajustes guardados');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('Error al guardar');
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(null);
    setUpdateInfo(null);
    setDownloadedApkMap({});
    try {
      const response = await fetch(`https://api.github.com/repos/${updateRepo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
      if (!response.ok) throw new Error(`Error: ${response.status}`);
      const data: GitHubRelease = await response.json();
      setUpdateInfo(data);
    } catch (e: any) {
      setUpdateError(e?.message ?? 'Error al buscar actualizaciones');
    } finally {
      setIsCheckingUpdate(false);
    }
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
    <div style={{ padding: '12px 14px 32px' }}>
      {/* Header Móvil */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Ajustes</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '2px 0 0' }}>
            Preferencias de AniCS en Android
          </p>
        </div>

        <button
          onClick={handleSave}
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            border: 'none', borderRadius: 'var(--radius-full)', padding: '6px 14px',
            color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Check size={14} /> Guardar
        </button>
      </div>

      <AnimatePresence>
        {saveStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: 'rgba(16,185,129,0.15)', border: '1px solid var(--accent-success)',
              color: 'var(--accent-success)', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12,
            }}
          >
            <Check size={14} /> {saveStatus}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Perfiles de Usuario y Sincronización Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Cloud size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Cuentas y Sincronización</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Perfil Activo */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: activeProfile?.color || '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}
                >
                  <ActiveProfileIcon size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                    {activeProfile?.name || 'Principal'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {profiles.length} {profiles.length === 1 ? 'perfil' : 'perfiles'}
                  </div>
                  {activeProfileStats && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span
                        title="Animes con al menos 1 episodio completado (≥80%)"
                        style={{
                          fontSize: 10,
                          color: 'rgba(255, 255, 255, 0.75)',
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontWeight: 600,
                        }}
                      >
                        <Tv size={10} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.animesCount} {activeProfileStats.animesCount === 1 ? 'anime' : 'animes'}
                      </span>
                      <span
                        title="Episodios completados (≥80%)"
                        style={{
                          fontSize: 10,
                          color: 'rgba(255, 255, 255, 0.75)',
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontWeight: 600,
                        }}
                      >
                        <Film size={10} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.episodesCount} eps
                      </span>
                      <span
                        title="Horas acumuladas vistas"
                        style={{
                          fontSize: 10,
                          color: 'rgba(255, 255, 255, 0.75)',
                          background: 'rgba(255, 255, 255, 0.06)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          fontWeight: 600,
                        }}
                      >
                        <Clock size={10} color={activeProfile?.color || 'var(--accent-primary)'} />
                        {activeProfileStats.hoursWatched}h
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
                  padding: '6px 12px',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cambiar
              </button>
            </div>

            {/* GitHub Gist Sync Status */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '10px',
                    background: syncConfig.githubToken ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: syncConfig.githubToken ? '#10b981' : '#f59e0b',
                  }}
                >
                  <Cloud size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                    GitHub Gist Sync
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {syncConfig.githubToken ? 'Vinculado' : 'Sin vincular'}
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
                  padding: '6px 12px',
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {syncConfig.githubToken ? 'Gestionar' : 'Vincular'}
              </button>
            </div>
          </div>
        </div>

        {/* Temas Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Palette size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Tema Visual</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {THEMES.map((theme) => {
              const isSelected = currentTheme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => setTheme(theme.id)}
                  style={{
                    background: theme.surfaceColor,
                    border: isSelected ? `2px solid ${theme.primaryColor}` : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: '10px 12px',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: isSelected ? `0 0 12px ${theme.primaryColor}30` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.isDark ? '#f8fafc' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {theme.name}
                    </span>
                    {isSelected && <Check size={12} color={theme.primaryColor} style={{ flexShrink: 0 }} />}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.baseColor, border: '1px solid rgba(255,255,255,0.15)' }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.surfaceColor, border: '1px solid rgba(255,255,255,0.15)' }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.primaryColor }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.secondaryColor }} />
                  </div>
                  {theme.tag && (
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: theme.primaryColor,
                      background: `${theme.primaryColor}18`,
                      borderRadius: '8px',
                      padding: '1px 6px',
                      alignSelf: 'flex-start',
                      whiteSpace: 'nowrap',
                    }}>
                      {theme.tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Carpeta de Descargas Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Folder size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Carpeta de Descargas</h3>
            </div>

            <button
              onClick={() => setDownloadDir(DEFAULT_ANDROID_DOWNLOAD_DIR)}
              title="Restablecer ruta predeterminada"
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-full)', padding: '3px 8px',
                color: 'var(--text-secondary)', fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              }}
            >
              <Undo2 size={10} /> Restablecer
            </button>
          </div>

          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '0 0 8px', lineHeight: 1.4 }}>
            Ubicación en Android donde se guardan los animes descargados y donde AniCS los detecta para reproducir sin internet:
          </p>

          <input
            type="text"
            value={downloadDir}
            onChange={(e) => setDownloadDir(e.target.value)}
            placeholder="/storage/emulated/0/Anime"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
              color: 'var(--text-primary)', fontSize: 12, outline: 'none',
              fontFamily: 'monospace',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Descargas simultáneas:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['1', '2', '3', '4'].map((val) => (
                <button
                  key={val}
                  onClick={() => setMaxConcurrent(val)}
                  style={{
                    padding: '3px 10px', borderRadius: 'var(--radius-full)',
                    background: maxConcurrent === val ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                    border: 'none', color: maxConcurrent === val ? 'white' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fuentes Online */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Globe size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Fuentes Online</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>JKAnime URL</span>
                {jkanimeUrl !== DEFAULT_JKANIME && (
                  <button
                    onClick={() => setJkanimeUrl(DEFAULT_JKANIME)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Restablecer
                  </button>
                )}
              </div>
              <input
                type="text"
                value={jkanimeUrl}
                onChange={(e) => setJkanimeUrl(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>MundoDonghua URL</span>
                {donghuaUrl !== DEFAULT_MUNDODONGHUA && (
                  <button
                    onClick={() => setDonghuaUrl(DEFAULT_MUNDODONGHUA)}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Restablecer
                  </button>
                )}
              </div>
              <input
                type="text"
                value={donghuaUrl}
                onChange={(e) => setDonghuaUrl(e.target.value)}
                style={{
                  width: '100%', padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  color: 'var(--text-primary)', fontSize: 11, outline: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Almacenamiento Caché Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <HardDrive size={16} color="var(--accent-primary)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Caché de Imágenes en RAM/Disco</h3>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>
              {cacheStats ? `${cacheStats.fileCount} imágenes (${cacheStats.totalFormatted})` : 'Calculando...'}
            </span>

            <button
              onClick={async () => {
                setIsClearingCache(true);
                try {
                  const res = await clearImageCache();
                  setSaveStatus(`Liberado: ${res.freedFormatted}`);
                  loadCache();
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsClearingCache(false);
                }
              }}
              disabled={isClearingCache}
              style={{
                background: 'rgba(239, 68, 68, 0.12)', border: 'none',
                borderRadius: 'var(--radius-md)', padding: '5px 12px',
                color: 'var(--accent-error)', fontSize: 11, fontWeight: 600,
              }}
            >
              <Trash2 size={12} style={{ display: 'inline', marginRight: 4 }} /> Vaciar
            </button>
          </div>

          <div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Límite en disco:
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['100', '300', '500', '1024'].map((val) => (
                <button
                  key={val}
                  onClick={() => setMaxCacheMb(val)}
                  style={{
                    padding: '4px 10px', borderRadius: 'var(--radius-full)',
                    background: maxCacheMb === val ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                    border: 'none', color: maxCacheMb === val ? 'white' : 'var(--text-secondary)',
                    fontSize: 11, fontWeight: 600,
                  }}
                >
                  {val === '1024' ? '1 GB' : `${val} MB`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Base de Datos SQLite y Memoria Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Database size={16} color="var(--accent-success)" />
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Base de Datos SQLite</h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>TAMAÑO DB</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                {dbStats ? dbStats.databaseSizeFormatted : '...'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>HISTORIAL</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                {dbStats ? `${dbStats.historyCount} eps` : '...'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>FAVORITOS</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                {dbStats ? `${dbStats.favoritesCount}` : '...'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={async () => {
                setIsOptimizingDb(true);
                try {
                  await optimizeDatabase();
                  clearMemoryCache();
                  await loadDb();
                  setSaveStatus('DB optimizada (VACUUM)');
                } catch (e) {
                  console.error(e);
                } finally {
                  setIsOptimizingDb(false);
                }
              }}
              disabled={isOptimizingDb}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '8px 12px',
                color: 'var(--text-primary)', fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Sparkles size={14} color="#34d399" />
              {isOptimizingDb ? 'Optimizando...' : 'Optimizar y Compactar (VACUUM)'}
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  const proceed = window.confirm('¿Vaciar historial de reproducción en este perfil?');
                  if (!proceed) return;

                  const clearCloudToo = window.confirm(
                    '¿Deseas eliminar este historial también en tus otros dispositivos y en la nube?\n\n' +
                    '• Aceptar: Borrar en todos los dispositivos (nube y móvil).\n' +
                    '• Cancelar: Borrar SOLO en este móvil (la sincronización se pausará para proteger la nube).'
                  );

                  try {
                    await clearHistory();
                    await loadDb();
                    if (clearCloudToo) {
                      useSyncStore.getState().triggerDebouncedSync();
                      setSaveStatus('Historial vaciado (nube y local)');
                    } else {
                      await useSyncStore.getState().pauseSyncByLocalClear();
                      setSaveStatus('Historial vaciado (sincronización pausada)');
                    }
                    setTimeout(() => setSaveStatus(null), 3000);
                  } catch (e) {
                    console.error(e);
                  }
                }}
                style={{
                  flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 10px',
                  color: 'var(--text-primary)', fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Trash2 size={12} color="#f59e0b" /> Limpiar Historial
              </button>

              <button
                onClick={async () => {
                  if (!window.confirm('¿Restablecer toda la base de datos limpia? Se limpiará el historial y favoritos de forma local y se desvincularán las credenciales.')) return;
                  setIsResettingDb(true);
                  try {
                    await resetDatabase();
                    await useSyncStore.getState().clearToken();
                    clearMemoryCache();
                    await loadDb();
                    setSaveStatus('Base de datos restablecida');
                    setTimeout(() => setSaveStatus(null), 3000);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsResettingDb(false);
                  }
                }}
                disabled={isResettingDb}
                style={{
                  flex: 1, background: 'rgba(239, 68, 68, 0.12)', border: 'none',
                  borderRadius: 'var(--radius-md)', padding: '8px 10px',
                  color: 'var(--accent-error)', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Activity size={12} /> {isResettingDb ? '...' : 'Restablecer DB'}
              </button>
            </div>
          </div>
        </div>


        {/* Actualizaciones APK Móvil */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={16} color="var(--accent-primary)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Actualizar APK</h3>
            </div>

            <button
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdate}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-full)', padding: '4px 10px',
                color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600,
              }}
            >
              {isCheckingUpdate ? 'Buscando...' : 'Comprobar'}
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Versión: <strong>v{CURRENT_VERSION}</strong>
            {typeof __APP_COMMIT_HASH__ !== 'undefined' && __APP_COMMIT_HASH__ && (
              <span style={{ marginLeft: 6, fontFamily: 'monospace' }}>#{__APP_COMMIT_HASH__}</span>
            )}
          </div>

          {updateError && (
            <div style={{
              padding: '8px 10px', borderRadius: 'var(--radius-md)',
              background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--border-subtle)',
              color: 'var(--accent-error)', fontSize: 11, marginBottom: 8,
            }}>
              {updateError}
            </div>
          )}

          {updateInfo && (
            <div style={{ background: 'var(--bg-elevated)', padding: 12, borderRadius: 'var(--radius-md)', marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {updateInfo.name || updateInfo.tag_name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--accent-primary)', fontWeight: 700 }}>
                  {updateInfo.tag_name}
                </span>
              </div>

              {/* Notas del parche */}
              {updateInfo.body && (
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 10,
                  maxHeight: 120, overflowY: 'auto', fontSize: 11, lineHeight: 1.5,
                  color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                    Novedades:
                  </div>
                  {updateInfo.body}
                </div>
              )}

              {/* Barra de progreso de descarga interna de APK */}
              {downloadingAsset && (
                <div style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
                  borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 5 }}>
                    <span style={{ color: 'var(--text-primary)' }}>Descargando APK en la app...</span>
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

              {updateInfo.assets
                .filter(a => a.name.toLowerCase().endsWith('.apk'))
                .map(asset => {
                  const isDownloaded = Boolean(downloadedApkMap[asset.name]);
                  const localApkPath = downloadedApkMap[asset.name];

                  const openBrowserFallback = (url: string) => {
                    if ((window as any).AndroidBridge && typeof (window as any).AndroidBridge.openInBrowser === 'function') {
                      (window as any).AndroidBridge.openInBrowser(url);
                    } else {
                      openUrl(url).catch(err => {
                        console.error('Error abriendo navegador externo:', err);
                      });
                    }
                  };

                  const executeInstall = (path: string) => {
                    if ((window as any).AndroidBridge && (window as any).AndroidBridge.installApk) {
                      try {
                        (window as any).AndroidBridge.installApk(path);
                      } catch (bridgeErr: any) {
                        console.error('Error invocando AndroidBridge.installApk:', bridgeErr);
                        alert(`Error al iniciar instalación nativa: ${bridgeErr?.message || bridgeErr}`);
                      }
                    } else {
                      const bridgeMissingMsg = 'Puente AndroidBridge no disponible. ¿Deseas abrir el instalador con el sistema?';
                      if (window.confirm(bridgeMissingMsg)) {
                        openPath(path).catch((openErr: any) => {
                          console.warn('Error abriendo paquete con openPath:', openErr);
                          alert(`No se pudo abrir el instalador (${openErr?.message || openErr}). Abriendo enlace en navegador...`);
                          openBrowserFallback(asset.browser_download_url);
                        });
                      }
                    }
                  };

                  return (
                    <div key={asset.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <button
                        disabled={Boolean(downloadingAsset)}
                        onClick={async () => {
                          if (isDownloaded && localApkPath) {
                            executeInstall(localApkPath);
                            return;
                          }

                          setDownloadingAsset(asset.name);
                          setDownloadProgress(0);
                          setDownloadStatusText('Iniciando descarga...');
                          try {
                            const savedPath: string = await invoke('download_and_run_installer', {
                              url: asset.browser_download_url,
                              filename: asset.name,
                            });
                            setDownloadedApkMap(prev => ({ ...prev, [asset.name]: savedPath }));
                            setDownloadStatusText('¡Descarga completada!');

                            if (window.confirm('La descarga ha finalizado. ¿Deseas instalar la actualización ahora?')) {
                              executeInstall(savedPath);
                            }
                          } catch (err: any) {
                            console.error('Error durante la descarga o instalación del APK:', err);
                            const errorMessage = err?.message || String(err);
                            setDownloadStatusText(`Error: ${errorMessage}`);
                            alert(`Error al actualizar: ${errorMessage}`);
                          } finally {
                            setTimeout(() => setDownloadingAsset(null), 5000);
                          }
                        }}
                        style={{
                          width: '100%',
                          background: isDownloaded
                            ? 'linear-gradient(135deg, #10b981, #059669)'
                            : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                          border: 'none', borderRadius: 'var(--radius-md)', padding: '11px',
                          color: 'white', fontSize: 12, fontWeight: 700, cursor: downloadingAsset ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          opacity: downloadingAsset ? 0.75 : 1,
                        }}
                      >
                        {isDownloaded ? <Check size={15} /> : <Download size={14} />}
                        {downloadingAsset === asset.name
                          ? 'Descargando actualización...'
                          : isDownloaded
                            ? 'Instalar APK'
                            : `Descargar e Instalar APK (${(asset.size / (1024 * 1024)).toFixed(1)} MB)`}
                      </button>

                      <button
                        onClick={() => openBrowserFallback(asset.browser_download_url)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-muted)',
                          fontSize: 10, cursor: 'pointer', padding: '4px 0', textAlign: 'center',
                          textDecoration: 'underline',
                        }}
                      >
                        Descargar archivo APK desde el navegador (Chrome)
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Acerca de */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={20} color="var(--accent-primary)" />
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, display: 'block' }}>AniCS Móvil</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>v{CURRENT_VERSION}</span>
            </div>
          </div>

          <button
            onClick={() => setShowChangelog(true)}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-full)', padding: '5px 12px',
              color: 'var(--text-primary)', fontSize: 11, fontWeight: 600,
            }}
          >
            <Sparkles size={11} style={{ display: 'inline', marginRight: 4 }} /> Novedades
          </button>
        </div>
      </div>

      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
      <ProfileSelectorModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      <GistSyncModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} />
    </div>
  );
}
