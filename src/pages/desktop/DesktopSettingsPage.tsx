import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, Tv, RefreshCw, Check, Undo2,
  FolderOpen, AlertCircle, Info, ExternalLink, Sparkles, ShieldCheck, Palette, HardDrive, Trash2, Database, Activity
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { getCacheStats, clearImageCache } from '@/services/downloadService';
import { getDatabaseStats, optimizeDatabase, resetDatabase, clearHistory, type DatabaseStats } from '@/services/storageService';
import { clearMemoryCache } from '@/components/CachedImage';

const DEFAULT_JKANIME = 'https://jkanime.net';
const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
const CURRENT_VERSION = '0.1.3';
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

  const [jkanimeUrl, setJkanimeUrl] = useState(DEFAULT_JKANIME);
  const [donghuaUrl, setDonghuaUrl] = useState(DEFAULT_MUNDODONGHUA);

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
        if (settings.download_dir) setDownloadDir(settings.download_dir);
        if (settings.max_concurrent_downloads) setMaxConcurrent(settings.max_concurrent_downloads);
        if (settings.player_type) setPlayerType(settings.player_type);
        if (settings.external_player_path) setExternalPlayerPath(settings.external_player_path);
        if (settings.github_repo) setUpdateRepo(settings.github_repo);
        if (settings.max_image_cache_mb) setMaxCacheMb(settings.max_image_cache_mb);
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
      await invoke('set_setting', { key: 'download_dir', value: downloadDir.trim() });
      await invoke('set_setting', { key: 'max_concurrent_downloads', value: maxConcurrent });
      await invoke('set_setting', { key: 'player_type', value: playerType });
      await invoke('set_setting', { key: 'external_player_path', value: externalPlayerPath.trim() });
      await invoke('set_setting', { key: 'github_repo', value: updateRepo.trim() });
      await invoke('set_setting', { key: 'max_image_cache_mb', value: maxCacheMb });

      setSaveStatus('Ajustes guardados correctamente');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (e) {
      console.error(e);
      setSaveStatus('Error al guardar ajustes');
    }
  };

  const handleResetUrls = () => {
    setJkanimeUrl(DEFAULT_JKANIME);
    setDonghuaUrl(DEFAULT_MUNDODONGHUA);
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

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header Desktop */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Ajustes y Preferencias</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>
            Configuración global de fuentes, descargas, reproductor y actualizaciones
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
              return (
                <motion.div
                  key={theme.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setTheme(theme.id)}
                  style={{
                    background: theme.surfaceColor,
                    border: isSelected ? `2px solid ${theme.primaryColor}` : '1px solid var(--border-moderate)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    boxShadow: isSelected ? `0 0 16px ${theme.primaryColor}40` : 'none',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: theme.isDark ? '#f8fafc' : '#0f172a' }}>
                      {theme.name}
                    </span>
                    {isSelected && (
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: theme.primaryColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={12} color={theme.isDark ? '#000' : '#fff'} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.baseColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.surfaceColor, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.primaryColor }} />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.secondaryColor }} />
                  </div>

                  <p style={{ fontSize: 11, color: theme.isDark ? '#94a3b8' : '#64748b', lineHeight: 1.3, margin: 0 }}>
                    {theme.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Fuentes */}
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
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Fuentes y Dominios</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                  Enlaces base a proveedores de contenido
                </p>
              </div>
            </div>

            <button
              onClick={handleResetUrls}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', padding: '6px 14px',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
              }}
            >
              <Undo2 size={14} /> Restablecer Web Original
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                URL Base de JKAnime
              </label>
              <input
                type="text"
                value={jkanimeUrl}
                onChange={(e) => setJkanimeUrl(e.target.value)}
                placeholder="https://jkanime.net"
                style={{
                  width: '100%', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                URL Base de MundoDonghua
              </label>
              <input
                type="text"
                value={donghuaUrl}
                onChange={(e) => setDonghuaUrl(e.target.value)}
                placeholder="https://www.mundodonghua.com"
                style={{
                  width: '100%', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
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
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={downloadDir}
                  onChange={(e) => setDownloadDir(e.target.value)}
                  placeholder="Por defecto: Carpeta Videos/AniCS"
                  style={{
                    flex: 1, background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                    padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                  }}
                />
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
                  placeholder="C:\Program Files\mpv\mpv.exe"
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
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Caché en Disco</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Imágenes almacenadas localmente para navegación rápida
              </p>
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
                if (!window.confirm('¿Seguro que deseas vaciar el historial de episodios vistos?')) return;
                try {
                  await clearHistory();
                  await loadDb();
                  setSaveStatus('Historial de reproducción vaciado');
                  setTimeout(() => setSaveStatus(null), 3000);
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
                if (!window.confirm('⚠️ ¿Estás seguro de restablecer la base de datos completa? Se limpiará el historial y favoritos de forma segura y se recreará la base de datos limpia.')) return;
                setIsResettingDb(true);
                try {
                  await resetDatabase();
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
      </div>

      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
    </div>
  );
}
