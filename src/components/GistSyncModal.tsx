import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud, RefreshCw, Lock, Unlock, Key, Download, Upload,
  ExternalLink, Check, AlertCircle, Trash2, X, Eye, EyeOff, ShieldCheck
} from 'lucide-react';
import { useSyncStore } from '@/stores/useSyncStore';
import { openUrl } from '@tauri-apps/plugin-opener';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const GistSyncModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    config,
    isSyncing,
    syncStatus,
    lastError,
    saveToken,
    clearToken,
    updateConfig,
    syncNow,
    exportBackupFile,
    importBackupFile,
    enableEncryption,
    disableEncryption,
    requestPin,
  } = useSyncStore();

  const [inputToken, setInputToken] = useState(config.githubToken || '');
  const [showToken, setShowToken] = useState(false);
  const [isEditingToken, setIsEditingToken] = useState(!config.githubToken);
  const [tokenSaveSuccess, setTokenSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveToken(inputToken.trim());
    setIsEditingToken(false);
    setTokenSaveSuccess(true);
    setTimeout(() => setTokenSaveSuccess(false), 2500);
  };

  const handleToggleAutoSync = async () => {
    await updateConfig({ autoSync: !config.autoSync });
  };

  const handleToggleEncryption = async () => {
    if (!config.encryptionEnabled) {
      const pin = await requestPin('setup');
      if (pin) {
        await enableEncryption(pin);
      }
    } else {
      const pin = await requestPin('disable');
      if (pin) {
        await disableEncryption();
      }
    }
  };

  const handleOpenGistUrl = async () => {
    if (config.gistUrl) {
      try {
        await openUrl(config.gistUrl);
      } catch {
        window.open(config.gistUrl, '_blank');
      }
    }
  };

  const handleOpenTokenHelp = async () => {
    const url = 'https://github.com/settings/tokens/new?scopes=gist&description=AniCS_Sync';
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      const text = event.target?.result as string;
      if (text) {
        try {
          await importBackupFile(text);
          alert('¡Respaldo importado correctamente!');
        } catch (err: any) {
          alert(`Error al importar: ${err?.message || 'Archivo no válido'}`);
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-card, #16181f)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '18px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary, #3b82f6)',
                }}
              >
                <Cloud size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>
                  Sincronización en la Nube (GitHub Gist)
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Status Card */}
            <div
              style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>
                  ESTADO DE SINCRONIZACIÓN
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {config.githubToken ? (
                    syncStatus === 'success' || syncStatus === 'not_modified' ? (
                      <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Check size={16} /> Al día
                      </span>
                    ) : syncStatus === 'error' ? (
                      <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={16} /> Error
                      </span>
                    ) : (
                      <span>Listo para sincronizar</span>
                    )
                  ) : (
                    <span style={{ color: '#f59e0b' }}>Sin vincular</span>
                  )}
                </div>
                {config.lastSyncAt && (
                  <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>
                    Último sync: {new Date(config.lastSyncAt).toLocaleString()}
                  </div>
                )}
              </div>

              {config.githubToken && (
                <button
                  disabled={isSyncing}
                  onClick={() => syncNow()}
                  style={{
                    background: 'var(--accent-primary, #3b82f6)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: isSyncing ? 0.7 : 1,
                  }}
                >
                  <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                </button>
              )}
            </div>

            {lastError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: 12,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} />
                <span>{lastError}</span>
              </div>
            )}

            {/* Token Section */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255, 255, 255, 0.8)' }}>
                  GitHub Personal Access Token (PAT)
                </label>
                <button
                  onClick={handleOpenTokenHelp}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-primary, #3b82f6)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  <span>Crear Token (permiso 'gist')</span>
                  <ExternalLink size={12} />
                </button>
              </div>

              {!isEditingToken && config.githubToken ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                >
                  <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.8)', fontFamily: 'monospace' }}>
                    ••••••••••••••••••••••••••••••••
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setIsEditingToken(true)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Cambiar
                    </button>
                    <button
                      onClick={clearToken}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Desvincular
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveToken} style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={inputToken}
                      onChange={e => setInputToken(e.target.value)}
                      placeholder="ghp_xxxxxxxxxxxx..."
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        padding: '10px 38px 10px 12px',
                        color: 'white',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                      }}
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    type="submit"
                    style={{
                      background: 'var(--accent-primary, #3b82f6)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '0 16px',
                      color: 'white',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Guardar
                  </button>
                </form>
              )}
            </div>

            {/* Gist Info & Link */}
            {config.gistId && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
                  Gist ID: <span style={{ fontFamily: 'monospace', color: 'white' }}>{config.gistId}</span>
                </div>
                <button
                  onClick={handleOpenGistUrl}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-primary, #3b82f6)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span>Ver en GitHub</span>
                  <ExternalLink size={13} />
                </button>
              </div>
            )}

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
              {/* AutoSync */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                    Sincronización Automática
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
                    Sincroniza en background 30s después de ver episodios o modificar favoritos.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoSync}
                  onChange={handleToggleAutoSync}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--accent-primary, #3b82f6)' }}
                />
              </div>

              {/* Encryption Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {config.encryptionEnabled ? <Lock size={15} color="#10b981" /> : <Unlock size={15} color="rgba(255,255,255,0.4)" />}
                    <span>Cifrado Extremo a Extremo (PIN)</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', marginTop: 2 }}>
                    Cifra los datos con AES-GCM antes de enviarlos a GitHub.
                  </div>
                </div>
                <button
                  onClick={handleToggleEncryption}
                  style={{
                    background: config.encryptionEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                    border: config.encryptionEnabled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: config.encryptionEnabled ? '#10b981' : 'white',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {config.encryptionEnabled ? 'Activado' : 'Activar'}
                </button>
              </div>
            </div>

            {/* Offline Backup & Restore */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 8 }}>
                Copia de Seguridad Offline
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  onClick={exportBackupFile}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Download size={15} />
                  <span>Exportar .json</span>
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Upload size={15} />
                  <span>Importar .json</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  accept=".json"
                  style={{ display: 'none' }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
