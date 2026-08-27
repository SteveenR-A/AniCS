import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Download, Tv, RefreshCw, Check, Undo2,
  FolderOpen, AlertCircle, Info, ExternalLink, Sparkles, ShieldCheck, Palette, HardDrive, Trash2
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ChangelogModal } from '@/components/ChangelogModal';
import { useThemeStore, THEMES } from '@/stores/useThemeStore';
import { getCacheStats, clearImageCache } from '@/services/downloadService';

const DEFAULT_JKANIME = 'https://jkanime.net';
const DEFAULT_MUNDODONGHUA = 'https://www.mundodonghua.com';
const CURRENT_VERSION = '0.1.0';

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

export function SettingsPage() {
  const { currentTheme, setTheme } = useThemeStore();

  // URLs de fuentes
  const [jkanimeUrl, setJkanimeUrl] = useState(DEFAULT_JKANIME);
  const [donghuaUrl, setDonghuaUrl] = useState(DEFAULT_MUNDODONGHUA);

  // Descargas
  const [downloadDir, setDownloadDir] = useState('');
  const [maxConcurrent, setMaxConcurrent] = useState('3');

  // Reproductor
  const [playerType, setPlayerType] = useState('internal');
  const [externalPlayerPath, setExternalPlayerPath] = useState('');

  // Actualizaciones GitHub
  const [updateRepo, setUpdateRepo] = useState('SteveenR-A/AniCS');
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubRelease | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Estado guardado y modal
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);

  // Estadísticas de Caché
  const [cacheStats, setCacheStats] = useState<{ totalFormatted: string; fileCount: number } | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const loadCache = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch (e) {
      console.error('Failed to get cache stats', e);
    }
  };

  useEffect(() => {
    loadCache();
  }, []);

  useEffect(() => {
    // Cargar configuraciones guardadas
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
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Ajustes</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            Personaliza el comportamiento, fuentes y descargas de AniCS
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px',
            color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
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
              padding: '10px 16px', borderRadius: 'var(--radius-md)',
              background: 'rgba(16,185,129,0.15)', border: '1px solid var(--accent-success)',
              color: 'var(--accent-success)', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
            }}
          >
            <Check size={16} /> {saveStatus}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ─── 0. Apariencia y Temas Visuales ─────────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
              <Palette size={18} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Tema y Apariencia Visual</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Selecciona la paleta de colores de la interfaz
              </p>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
                    transition: 'all var(--transition-fast)',
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

                  {/* Swatches de color */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.baseColor, border: '1px solid rgba(255,255,255,0.2)' }} title="Fondo base" />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.surfaceColor, border: '1px solid rgba(255,255,255,0.2)' }} title="Superficie" />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.primaryColor }} title="Color primario" />
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: theme.secondaryColor }} title="Color secundario" />
                  </div>

                  <p style={{ fontSize: 11, color: theme.isDark ? '#94a3b8' : '#64748b', lineHeight: 1.3 }}>
                    {theme.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* ─── 1. Fuentes de Contenido y URLs ─────────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
                <Globe size={18} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Fuentes de Contenido y Dominios</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Puedes cambiar los enlaces o espejos si el sitio original está bloqueado
                </p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleResetUrls}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', padding: '6px 12px',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
              }}
            >
              <Undo2 size={14} /> Restablecer Web Original
            </motion.button>
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

        {/* ─── 2. Descargas y Resolución de Video ──────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-secondary-glow)' }}>
              <Download size={18} color="var(--accent-secondary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Descargas y Calidad de Video</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Configuración del motor de descarga multihilo
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
                  placeholder="Por defecto: Carpeta Descargas/AniCS"
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
                    borderRadius: 'var(--radius-md)', padding: '10px 14px',
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
                Descargas Simultáneas Máximas
              </label>
              <select
                value={maxConcurrent}
                onChange={(e) => setMaxConcurrent(e.target.value)}
                style={{
                  width: 140, background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-moderate)', borderRadius: 'var(--radius-md)',
                  padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, outline: 'none',
                }}
              >
                <option value="1">1 episodio</option>
                <option value="2">2 episodios</option>
                <option value="3">3 episodios</option>
                <option value="4">4 episodios</option>
                <option value="6">6 episodios</option>
                <option value="8">8 episodios</option>
              </select>
            </div>

            {/* Aviso informativo de resolución */}
            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: 'var(--radius-md)', padding: '12px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <Info size={18} color="var(--accent-warning)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--accent-warning)' }}>Sobre la resolución de video:</strong>{' '}
                La resolución (720p, 1080p, etc.) no se puede forzar manualmente en todos los servidores porque depende directamente de las calidades que entregue el servidor donde se aloja el contenido (HLS master playlist o MP4 directo). AniCS selecciona automáticamente la máxima calidad disponible.
              </div>
            </div>
          </div>
        </div>

        {/* ─── 3. Reproductor ─────────────────────────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
              <Tv size={18} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Reproductor de Video</h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Modo de reproducción preferido
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
                Tipo de Reproductor
              </label>
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { id: 'internal', label: 'Reproductor Integrado (Recomendado)' },
                  { id: 'external', label: 'Reproductor Externo (MPV / VLC)' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlayerType(p.id)}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
                      background: playerType === p.id ? 'var(--accent-primary-glow)' : 'var(--bg-elevated)',
                      border: playerType === p.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: playerType === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: playerType === p.id ? 600 : 400, fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
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

        {/* ─── 4. Almacenamiento y Caché de Imágenes ─────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.15)' }}>
                <HardDrive size={18} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Almacenamiento & Caché de Imágenes</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Las portadas se guardan en tu disco para no volver a descargarse al navegar
                </p>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-elevated)', padding: '14px 18px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {cacheStats ? `${cacheStats.fileCount} imágenes en caché (${cacheStats.totalFormatted})` : 'Calculando tamaño...'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                Caché persistente en disco local para acelerar la navegación offline
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
                borderRadius: 'var(--radius-md)', padding: '8px 16px',
                color: 'var(--accent-error)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} /> {isClearingCache ? 'Limpiando...' : 'Vaciar Caché'}
            </button>
          </div>
        </div>

        {/* ─── 5. Actualizaciones GitHub ───────────────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ padding: 8, borderRadius: 'var(--radius-md)', background: 'var(--accent-primary-glow)' }}>
                <RefreshCw size={18} color="var(--accent-primary)" />
              </div>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700 }}>Actualizaciones (GitHub Releases)</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Comprueba nuevas versiones y notas de parche directamente desde GitHub
                </p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleCheckUpdates}
              disabled={isCheckingUpdate}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)', padding: '8px 16px',
                color: 'var(--text-primary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
              }}
            >
              <RefreshCw size={15} style={{ animation: isCheckingUpdate ? 'spin-slow 1s linear infinite' : 'none' }} />
              {isCheckingUpdate ? 'Comprobando...' : 'Buscar Actualizaciones'}
            </motion.button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Versión instalada: <strong style={{ color: 'var(--text-primary)' }}>v{CURRENT_VERSION}</strong></span>
              <span style={{ color: 'var(--text-secondary)' }}>Repositorio: <strong style={{ color: 'var(--text-primary)' }}>{updateRepo}</strong></span>
            </div>

            {updateError && (
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                background: 'rgba(239,68,68,0.1)', border: '1px solid var(--accent-error)',
                color: 'var(--accent-error)', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <AlertCircle size={16} /> {updateError}
              </div>
            )}

            {updateInfo && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)', padding: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} color="var(--accent-primary)" />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {updateInfo.name || updateInfo.tag_name}
                    </span>
                    {isNewVersionAvailable(updateInfo.tag_name) ? (
                      <span style={{
                        background: 'var(--accent-success)', color: 'white',
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      }}>
                        Nueva versión disponible
                      </span>
                    ) : (
                      <span style={{
                        background: 'var(--bg-surface)', color: 'var(--text-muted)',
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      }}>
                        Estás al día
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => openUrl(updateInfo.html_url)}
                    style={{
                      background: 'none', border: 'none', color: 'var(--accent-primary)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                    }}
                  >
                    Ver en GitHub <ExternalLink size={12} />
                  </button>
                </div>

                {updateInfo.body && (
                  <p style={{
                    fontSize: 12, color: 'var(--text-secondary)',
                    lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
                    background: 'var(--bg-surface)', padding: 8, borderRadius: 6,
                    marginBottom: 10,
                  }}>
                    {updateInfo.body}
                  </p>
                )}

                {updateInfo.assets.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {updateInfo.assets.map((asset) => (
                      <button
                        key={asset.name}
                        onClick={() => openUrl(asset.browser_download_url)}
                        style={{
                          background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                          borderRadius: 6, padding: '6px 12px', color: 'var(--text-primary)',
                          cursor: 'pointer', fontSize: 12, fontWeight: 500,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <Download size={13} color="var(--accent-primary)" />
                        {asset.name} ({(asset.size / (1024 * 1024)).toFixed(1)} MB)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── 5. Acerca de ─────────────────────────────────── */}
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)', padding: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ShieldCheck size={24} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>AniCS — Multiplataforma</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Versión {CURRENT_VERSION} · Tauri v2 + Rust + React + TypeScript
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setShowChangelog(true)}
              style={{
                background: 'var(--accent-primary-glow)', border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-md)', padding: '8px 14px',
                color: 'var(--text-primary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
              }}
            >
              <Sparkles size={14} color="var(--accent-primary)" /> Notas de Parche
            </button>

            <button
              onClick={() => openUrl('https://github.com/SteveenR-A/AniCS')}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)', padding: '8px 14px',
                color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              }}
            >
              <Globe size={14} /> GitHub
            </button>
          </div>
        </div>

      </div>

      {/* Modal de Notas de Parche */}
      <ChangelogModal isOpen={showChangelog} onClose={() => setShowChangelog(false)} />
    </div>
  );
}
