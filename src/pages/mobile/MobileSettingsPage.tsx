import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, RefreshCw, Check, Undo2,
  AlertCircle, ExternalLink, Sparkles, ShieldCheck, Palette, HardDrive, Trash2, Database, Activity
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { getCacheStats, clearImageCache } from '@/services/downloadService';
import { getDatabaseStats, optimizeDatabase, resetDatabase, clearHistory, type DatabaseStats } from '@/services/storageService';
import { clearMemoryCache } from '@/components/CachedImage';

const DEFAULT_JKANIME = 'https://jkanime.net';
const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
const CURRENT_VERSION = '0.1.1';
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

  const [maxConcurrent, setMaxConcurrent] = useState('3');
  const [updateRepo] = useState('SteveenR-A/AniCS');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubRelease | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

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
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings: Record<string, string> = await invoke('get_all_settings');
        if (settings.jkanime_base_url) setJkanimeUrl(settings.jkanime_base_url);
        if (settings.mundodonghua_base_url) setDonghuaUrl(settings.mundodonghua_base_url);
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
                  if (!window.confirm('⚠️ ¿Restablecer toda la base de datos limpia?')) return;
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
            <div style={{ background: 'var(--bg-elevated)', padding: 10, borderRadius: 'var(--radius-md)', marginTop: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
                {updateInfo.name || updateInfo.tag_name}
              </span>
              {updateInfo.assets
                .filter(a => a.name.endsWith('.apk'))
                .map(asset => (
                  <button
                    key={asset.name}
                    onClick={() => openUrl(asset.browser_download_url)}
                    style={{
                      width: '100%', background: 'var(--accent-primary)',
                      border: 'none', borderRadius: 'var(--radius-md)', padding: '8px',
                      color: 'white', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Download size={14} /> Descargar APK Android ({(asset.size / (1024 * 1024)).toFixed(1)} MB)
                  </button>
                ))}
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
