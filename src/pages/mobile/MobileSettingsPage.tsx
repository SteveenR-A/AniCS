import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, RefreshCw, Check, Undo2,
  AlertCircle, ExternalLink, Sparkles, ShieldCheck, Palette, HardDrive, Trash2, Database, Activity, Folder
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { getCacheStats, clearImageCache } from '@/services/downloadService';
import { getDatabaseStats, optimizeDatabase, resetDatabase, clearHistory, type DatabaseStats } from '@/services/storageService';
import { clearMemoryCache } from '@/components/CachedImage';

const DEFAULT_JKANIME = 'https://jkanime.net';
const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
const DEFAULT_ANDROID_DOWNLOAD_DIR = '/storage/emulated/0/Anime';
const CURRENT_VERSION = '0.1.7';
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
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: theme.isDark ? '#f8fafc' : '#0f172a' }}>
                      {theme.name}
                    </span>
                    {isSelected && <Check size={12} color={theme.primaryColor} />}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.baseColor }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.primaryColor }} />
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: theme.secondaryColor }} />
                  </div>
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
                  if (!window.confirm('¿Vaciar historial de reproducción?')) return;
                  try {
                    await clearHistory();
                    await loadDb();
                    setSaveStatus('Historial vaciado');
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
                  if (!window.confirm('¿Restablecer toda la base de datos limpia?')) return;
                  setIsResettingDb(true);
                  try {
                    await resetDatabase();
                    clearMemoryCache();
                    await loadDb();
                    setSaveStatus('Base de datos restablecida');
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
    </div>
  );
}
