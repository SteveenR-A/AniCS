import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cloud,
  RefreshCw,
  Lock,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  LogOut,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  User as UserIcon,
  HardDrive,
  Trash2,
  Crown,
  ArrowRightLeft,
  Plus,
  ArrowLeft,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useSyncStore } from '@/stores/useSyncStore';
import { useSubscriptionStore } from '@/stores/useSubscriptionStore';
import { useAccountStore } from '@/stores/useAccountStore';
import { FEATURE_FLAGS } from '@/config/features';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const {
    config,
    isSyncing,
    syncStatus,
    lastError,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
    updateConfig,
    syncNow,
    exportBackupFile,
    importBackupFile,
    enableEncryption,
    disableEncryption,
    requestPin,
    clearCloudData,
  } = useSyncStore();

  const { isVip, activePlan, openModal: openVipModal, cancelSubscription } = useSubscriptionStore();
  const isVipLocked = Boolean(FEATURE_FLAGS.SHOW_SUBSCRIPTION && !isVip);

  const {
    accounts,
    isSwitching,
    switchAccount,
    quickLoginVipDemo,
    quickLoginFreeDemo,
    removeAccount,
  } = useAccountStore();

  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isWaitingBrowser, setIsWaitingBrowser] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConfirmCancelSubscription = async () => {
    setIsCancelling(true);
    try {
      await cancelSubscription(config.userId);
      setShowCancelConfirm(false);
      setSyncFeedback({
        message: 'Tu suscripción VIP ha sido cancelada exitosamente. Se aplicaron restricciones estándar.',
        type: 'info',
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    } catch (e: any) {
      setSyncFeedback({
        message: e?.message || 'Error al cancelar la suscripción.',
        type: 'error',
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    } finally {
      setIsCancelling(false);
    }
  };

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsWaitingBrowser(true);
    try {
      await loginWithGoogle();
      setIsAddingNewAccount(false);
      setSyncFeedback({ message: 'Sesión iniciada con Google y cuenta vinculada exitosamente.', type: 'success' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (e: any) {
      setAuthError(e?.message || 'Error al iniciar sesión con Google.');
    } finally {
      setIsWaitingBrowser(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!emailInput.trim() || !passwordInput.trim()) {
      setAuthError('Por favor ingresa tu correo y contraseña.');
      return;
    }
    try {
      if (authTab === 'register') {
        await registerWithEmail(emailInput, passwordInput);
        setSyncFeedback({ message: 'Cuenta creada y vinculada con éxito.', type: 'success' });
      } else {
        await loginWithEmail(emailInput, passwordInput);
        setSyncFeedback({ message: 'Sesión iniciada correctamente.', type: 'success' });
      }
      setIsAddingNewAccount(false);
      setTimeout(() => setSyncFeedback(null), 4000);
      setEmailInput('');
      setPasswordInput('');
    } catch (err: any) {
      setAuthError(err?.message || 'Error en la autenticación.');
    }
  };

  const handleSwitch = async (email: string) => {
    try {
      await switchAccount(email);
      setSyncFeedback({ message: `Cambiado a cuenta: ${email}`, type: 'success' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (err: any) {
      setSyncFeedback({ message: err?.message || 'Error al cambiar cuenta', type: 'error' });
      setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleQuickLoginVip = async () => {
    try {
      await quickLoginVipDemo();
      setIsAddingNewAccount(false);
      setSyncFeedback({ message: 'Sesión iniciada como VIP (vip@anics.app - Yumework VIP Activo).', type: 'success' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (e: any) {
      setAuthError(e?.message || 'Error al iniciar sesión con cuenta VIP.');
    }
  };

  const handleQuickLoginFree = async () => {
    try {
      await quickLoginFreeDemo();
      setIsAddingNewAccount(false);
      setSyncFeedback({ message: 'Sesión iniciada como Gratis (gratis@anics.app - Restricciones estándar activas).', type: 'info' });
      setTimeout(() => setSyncFeedback(null), 4000);
    } catch (e: any) {
      setAuthError(e?.message || 'Error al iniciar sesión con cuenta gratuita.');
    }
  };


  const handleManualSync = async () => {
    if (isVipLocked) {
      openVipModal();
      return;
    }
    try {
      await syncNow();
      const currentStatus = useSyncStore.getState().syncStatus;
      const currentError = useSyncStore.getState().lastError;

      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);

      if (currentStatus === 'success') {
        setSyncFeedback({ message: 'Sincronización completada exitosamente.', type: 'success' });
      } else if (currentStatus === 'not_modified') {
        setSyncFeedback({ message: 'Tu historial y favoritos están al día con la nube.', type: 'info' });
      } else if (currentStatus === 'error') {
        setSyncFeedback({ message: currentError || 'Error al sincronizar con la nube.', type: 'error' });
      }

      feedbackTimer.current = setTimeout(() => {
        setSyncFeedback(null);
      }, 4000);
    } catch (e: any) {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      setSyncFeedback({ message: e?.message || 'Error al sincronizar.', type: 'error' });
      feedbackTimer.current = setTimeout(() => setSyncFeedback(null), 4000);
    }
  };

  const handleToggleAutoSync = async () => {
    if (isVipLocked) {
      openVipModal();
      return;
    }
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

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        try {
          await importBackupFile(content);
          setSyncFeedback({ message: 'Copia de seguridad importada exitosamente.', type: 'success' });
          setTimeout(() => setSyncFeedback(null), 4000);
        } catch (err: any) {
          setSyncFeedback({ message: err?.message || 'Error al importar copia de seguridad.', type: 'error' });
          setTimeout(() => setSyncFeedback(null), 4000);
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isAuthenticated = !!config.userId;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '580px',
            maxHeight: '90vh',
            background: 'var(--bg-surface, #111318)',
            border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
            borderRadius: '20px',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.04))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, var(--accent-primary, #6366f1), #4338ca)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
                  flexShrink: 0,
                }}
              >
                <Cloud size={22} color="white" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--text-primary, #fff)', letterSpacing: '0.01em' }}>
                  Sincronización en la Nube
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--text-secondary, #94a3b8)' }}>
                  Respalda tu progreso, historial y favoritos en todos tus dispositivos
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #94a3b8)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Feedback banner */}
          <AnimatePresence>
            {syncFeedback && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  padding: '12px 24px',
                  fontSize: '13px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  background:
                    syncFeedback.type === 'success'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : syncFeedback.type === 'info'
                        ? 'rgba(59, 130, 246, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                  color:
                    syncFeedback.type === 'success'
                      ? '#34d399'
                      : syncFeedback.type === 'info'
                        ? '#60a5fa'
                        : '#f87171',
                }}
              >
                {syncFeedback.type === 'success' && <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
                {syncFeedback.type === 'info' && <CheckCircle2 size={16} style={{ flexShrink: 0 }} />}
                {syncFeedback.type === 'error' && <AlertCircle size={16} style={{ flexShrink: 0 }} />}
                <span>{syncFeedback.message}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Body */}
          <div
            style={{
              padding: '24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {!isAuthenticated || isAddingNewAccount ? (
              /* Estado NO AUTENTICADO o AÑADIENDO CUENTA */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {isAddingNewAccount && (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewAccount(false)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'transparent',
                      border: 'none',
                      color: '#a5b4fc',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <ArrowLeft size={16} /> Volver a mis cuentas vinculadas
                  </button>
                )}

                {/* Acceso Rápido Demo Multicuenta (Firebase) */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(245, 158, 11, 0.05))',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={16} color="#fbbf24" />
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>
                        Acceso Rápido para Demostración (Firebase)
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted, #94a3b8)' }}>1 clic</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {/* Botón VIP Demo */}
                    <button
                      type="button"
                      onClick={handleQuickLoginVip}
                      disabled={isSwitching}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(217, 119, 6, 0.08))',
                        border: '1.5px solid #f59e0b',
                        textAlign: 'left',
                        cursor: isSwitching ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
                        transition: 'transform 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Crown size={14} /> Cuenta VIP
                        </span>
                        <span style={{ fontSize: '10px', background: '#f59e0b', color: '#000', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                          PRO
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 500 }}>
                        vip@anics.app
                      </span>
                      <span style={{ fontSize: '10px', color: '#34d399', fontWeight: 600, marginTop: '2px' }}>
                        ✓ Servidores, descargas y temas OLED
                      </span>
                    </button>

                    {/* Botón Gratis Demo */}
                    <button
                      type="button"
                      onClick={handleQuickLoginFree}
                      disabled={isSwitching}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        textAlign: 'left',
                        cursor: isSwitching ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '3px',
                        transition: 'transform 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserIcon size={14} /> Cuenta Estándar
                        </span>
                        <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.12)', color: '#cbd5e1', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
                          GRATIS
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#cbd5e1', fontWeight: 500 }}>
                        gratis@anics.app
                      </span>
                      <span style={{ fontSize: '10px', color: '#f87171', fontWeight: 500, marginTop: '2px' }}>
                        ✕ Bloqueo de descargas y temas VIP
                      </span>
                    </button>
                  </div>
                </div>

                {/* Separador elegante */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '2px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, rgba(255, 255, 255, 0.08))' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    o vincula tu cuenta personal
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, rgba(255, 255, 255, 0.08))' }} />
                </div>

                {/* Formulario Correo y Contraseña */}
                <form onSubmit={handleEmailAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #f1f5f9)', marginBottom: '6px' }}>
                      Correo electrónico
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                        <Mail size={18} color="var(--text-secondary, #94a3b8)" />
                      </div>
                      <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        placeholder="tu_correo@ejemplo.com"
                        required
                        style={{
                          width: '100%',
                          height: '46px',
                          paddingLeft: '44px',
                          paddingRight: '16px',
                          borderRadius: '12px',
                          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                          background: 'var(--bg-surface-2, #181b22)',
                          color: '#fff',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary, #f1f5f9)', marginBottom: '6px' }}>
                      Contraseña
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
                        <KeyRound size={18} color="var(--text-secondary, #94a3b8)" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={passwordInput}
                        onChange={(e) => setPasswordInput(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        style={{
                          width: '100%',
                          height: '46px',
                          paddingLeft: '44px',
                          paddingRight: '44px',
                          borderRadius: '12px',
                          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
                          background: 'var(--bg-surface-2, #181b22)',
                          color: '#fff',
                          fontSize: '14px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary, #94a3b8)',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                        }}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSyncing}
                    style={{
                      height: '46px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, var(--accent-primary, #6366f1), #4f46e5)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: isSyncing ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                      transition: 'all 0.2s',
                      opacity: isSyncing ? 0.7 : 1,
                    }}
                  >
                    {isSyncing
                      ? 'Procesando...'
                      : authTab === 'register'
                        ? 'Crear Cuenta y Vincular'
                        : 'Iniciar Sesión'}
                  </button>
                </form>

                {/* Separador elegante */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', margin: '4px 0' }}>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, rgba(255, 255, 255, 0.08))' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    o con google
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle, rgba(255, 255, 255, 0.08))' }} />
                </div>

                {/* Botón de Google */}
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSyncing}
                  style={{
                    height: '46px',
                    width: '100%',
                    borderRadius: '12px',
                    background: '#ffffff',
                    border: 'none',
                    color: '#1f2937',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                    transition: 'transform 0.15s, opacity 0.15s',
                    opacity: isSyncing ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { if (!isSyncing) e.currentTarget.style.transform = 'scale(1.008)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>{isWaitingBrowser ? 'Esperando en el navegador...' : 'Continuar con Google'}</span>
                </button>
              </div>
            ) : (
              /* Estado AUTENTICADO */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {/* Tarjeta de Usuario Activo */}
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '14px',
                    background: 'var(--bg-surface-2, #181b22)',
                    border: '1px solid var(--border-moderate, rgba(255, 255, 255, 0.12))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    {config.userPhotoUrl ? (
                      <img
                        src={config.userPhotoUrl}
                        alt="Avatar"
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          border: '2px solid rgba(99, 102, 241, 0.4)',
                          objectFit: 'cover',
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          background: isVip ? 'rgba(245, 158, 11, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                          border: isVip ? '2px solid rgba(245, 158, 11, 0.5)' : '2px solid rgba(99, 102, 241, 0.4)',
                          color: isVip ? '#fbbf24' : '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '16px',
                          flexShrink: 0,
                        }}
                      >
                        {config.userDisplayName?.[0]?.toUpperCase() || config.userEmail?.[0]?.toUpperCase() || <UserIcon size={20} />}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {config.userDisplayName || 'Usuario AniCS'}
                      </h4>
                      <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {config.userEmail || 'Conectado a la nube'}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
                          <CheckCircle2 size={13} /> Conectado
                        </span>
                        {FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
                          isVip ? (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 800,
                              color: '#fbbf24',
                              background: 'rgba(245, 158, 11, 0.2)',
                              border: '1px solid rgba(245, 158, 11, 0.4)',
                              borderRadius: '6px',
                              padding: '1px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              <Crown size={11} /> VIP Pass Activo
                            </span>
                          ) : (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: 'var(--text-muted, #94a3b8)',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '6px',
                              padding: '1px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}>
                              <UserIcon size={11} /> Cuenta Estándar (Gratis)
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={logout}
                    title="Cerrar sesión"
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-secondary, #94a3b8)',
                      borderRadius: '10px',
                      padding: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                      e.currentTarget.style.color = '#f87171';
                      e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.color = 'var(--text-secondary, #94a3b8)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                  >
                    <LogOut size={18} />
                  </button>
                </div>

                {/* Banner de Sincronización VIP para cuentas Gratuitas */}
                {isVipLocked && (
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.06))',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Crown size={22} color="#fbbf24" style={{ flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24' }}>
                          Sincronización en la Nube con VIP Pass
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.35 }}>
                          Tu cuenta está vinculada. Para activar la sincronización automática en tiempo real de tu historial y favoritos entre PC y Android, suscríbete a Yumework VIP.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openVipModal}
                      style={{
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        color: '#000',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
                      }}
                    >
                      Activar VIP
                    </button>
                  </div>
                )}

                {/* Panel de Membresía VIP Activa y Opción de Cancelación */}
                {FEATURE_FLAGS.SHOW_SUBSCRIPTION && isVip && (
                  <div
                    style={{
                      padding: '16px 18px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(217, 119, 6, 0.05))',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.35)',
                            flexShrink: 0,
                          }}
                        >
                          <Crown size={20} color="#ffffff" />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
                              Yumework VIP Pass
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '6px',
                                background: '#f59e0b',
                                color: '#000',
                                textTransform: 'uppercase',
                              }}
                            >
                              Activo
                            </span>
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#fbbf24' }}>
                            Plan {activePlan === 'annual' ? 'Anual ($35/año)' : 'Mensual ($3.50/mes)'} • Beneficios Pro activos
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(true)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '8px',
                          padding: '7px 12px',
                          color: '#f87171',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                          e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                        }}
                      >
                        <XCircle size={14} /> Cancelar Suscripción
                      </button>
                    </div>

                    {/* Diálogo de Confirmación de Cancelación */}
                    {showCancelConfirm && (
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#fca5a5' }}>
                          ¿Confirmas que deseas cancelar tu suscripción VIP?
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: '#f1f5f9', lineHeight: 1.4 }}>
                          Se revocarán los servidores dedicados (Magi, Desu), descargas ilimitadas y la sincronización automática en la nube. Tus temas exclusivos volverán al tema oscuro predeterminado.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={handleConfirmCancelSubscription}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              background: '#dc2626',
                              border: 'none',
                              color: '#fff',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: isCancelling ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isCancelling ? 'Cancelando...' : 'Sí, cancelar VIP'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCancelConfirm(false)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              color: '#cbd5e1',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Mantener mi suscripción
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Sección de Gestión Multicuenta en este Dispositivo */}
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: '14px',
                    background: 'var(--bg-surface-2, #181b22)',
                    border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ArrowRightLeft size={16} color="var(--accent-primary, #6366f1)" />
                      <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#fff' }}>
                        Cuentas en este Dispositivo (Multicuenta)
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAddingNewAccount(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '8px',
                        padding: '4px 10px',
                        color: '#818cf8',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} /> Vincular otra
                    </button>
                  </div>

                  {/* Lista de cuentas guardadas */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {accounts.map((acc) => {
                      const isCurrent = acc.email.toLowerCase() === (config.userEmail || '').toLowerCase();
                      return (
                        <div
                          key={acc.email}
                          style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            background: isCurrent
                              ? 'rgba(99, 102, 241, 0.1)'
                              : 'rgba(255, 255, 255, 0.03)',
                            border: isCurrent
                              ? '1px solid rgba(99, 102, 241, 0.35)'
                              : '1px solid rgba(255, 255, 255, 0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: acc.isVip
                                  ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                  : 'rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              {acc.isVip ? <Crown size={16} color="#000" /> : <UserIcon size={16} color="#94a3b8" />}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {acc.displayName || acc.email}
                                </span>
                                {acc.isVip ? (
                                  <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                                    VIP
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', color: '#94a3b8' }}>
                                    GRATIS
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {acc.email}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isCurrent ? (
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> En uso
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSwitch(acc.email)}
                                disabled={isSwitching}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  borderRadius: '6px',
                                  padding: '5px 10px',
                                  color: '#fff',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: isSwitching ? 'not-allowed' : 'pointer',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isSwitching ? 'Cambiando...' : 'Cambiar'}
                              </button>
                            )}

                            {!acc.isDemo && !isCurrent && (
                              <button
                                type="button"
                                onClick={() => removeAccount(acc.email)}
                                title="Eliminar de este dispositivo"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  borderRadius: '4px',
                                  display: 'flex',
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Conmutador Rápido Demo VIP / Gratis */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={handleQuickLoginVip}
                      disabled={isSwitching}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.08))',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        color: '#fbbf24',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: isSwitching ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Crown size={13} /> Probar Cuenta VIP (Demo)
                    </button>

                    <button
                      type="button"
                      onClick={handleQuickLoginFree}
                      disabled={isSwitching}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#e2e8f0',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: isSwitching ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <UserIcon size={13} /> Probar Cuenta Gratis (Demo)
                    </button>
                  </div>
                </div>

                {/* Botón Sincronizar Ahora */}
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  style={{
                    height: '48px',
                    width: '100%',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, var(--accent-primary, #6366f1), #4f46e5)',
                    border: 'none',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    cursor: isSyncing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                    transition: 'all 0.2s',
                    opacity: isSyncing ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={18} className={isSyncing ? 'animate-spin' : ''} />
                  <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora'}</span>
                </button>

                {config.lastSyncAt && (
                  <p style={{ margin: 0, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                    Última sincronización: {new Date(config.lastSyncAt).toLocaleString()}
                  </p>
                )}

                {/* Ajustes de sincronización */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))' }}>
                  {/* Sincronización Automática */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: 'var(--bg-surface-2, #181b22)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#fff' }}>Sincronización Automática</p>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>Respalda al marcar episodios o favoritos</p>
                    </div>
                    <button
                      onClick={handleToggleAutoSync}
                      style={{
                        position: 'relative',
                        display: 'inline-flex',
                        height: '24px',
                        width: '44px',
                        alignItems: 'center',
                        borderRadius: '9999px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                        background: config.autoSync ? 'var(--accent-primary, #6366f1)' : '#374151',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          height: '18px',
                          width: '18px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'transform 0.2s',
                          transform: config.autoSync ? 'translateX(22px)' : 'translateX(3px)',
                        }}
                      />
                    </button>
                  </div>

                  {/* Cifrado por PIN */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: 'var(--bg-surface-2, #181b22)',
                      border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {config.encryptionEnabled ? (
                        <ShieldCheck size={20} color="#34d399" style={{ flexShrink: 0 }} />
                      ) : (
                        <Lock size={20} color="var(--text-secondary, #94a3b8)" style={{ flexShrink: 0 }} />
                      )}
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#fff' }}>Cifrado con PIN (E2EE)</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                          {config.encryptionEnabled ? 'Cifrado de extremo a extremo activo' : 'Cifrar datos con un PIN secreto'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleEncryption}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                    >
                      {config.encryptionEnabled ? 'Desactivar' : 'Activar PIN'}
                    </button>
                  </div>

                  {/* Vaciar Datos en la Nube */}
                  <div
                    style={{
                      padding: '14px 18px',
                      borderRadius: '12px',
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Trash2 size={20} color="#f87171" style={{ flexShrink: 0 }} />
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: '#fff' }}>Vaciar datos en la nube</p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                          Elimina el historial, favoritos y perfiles respaldados en tu cuenta
                        </p>
                      </div>
                    </div>
                    {showClearConfirm ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={async () => {
                            try {
                              await clearCloudData();
                              setShowClearConfirm(false);
                              setSyncFeedback({ message: 'Datos eliminados de la nube correctamente.', type: 'success' });
                              setTimeout(() => setSyncFeedback(null), 4000);
                            } catch (err: any) {
                              setSyncFeedback({ message: err?.message || 'Error al vaciar datos en la nube.', type: 'error' });
                              setTimeout(() => setSyncFeedback(null), 4000);
                            }
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            background: '#dc2626',
                            border: 'none',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setShowClearConfirm(false)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: 'none',
                            color: 'var(--text-secondary, #94a3b8)',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowClearConfirm(true)}
                        style={{
                          padding: '8px 14px',
                          borderRadius: '8px',
                          background: 'rgba(239, 68, 68, 0.12)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.22)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; }}
                      >
                        Vaciar Nube
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Respaldo Offline JSON (Siempre accesible en tarjeta limpia) */}
            <div
              style={{
                marginTop: '4px',
                padding: '16px 18px',
                borderRadius: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={16} color="var(--accent-primary, #6366f1)" />
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Copia Local Fuera de Línea (.json)
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button
                  type="button"
                  onClick={exportBackupFile}
                  style={{
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                >
                  <Download size={16} color="var(--text-secondary, #94a3b8)" />
                  Exportar JSON
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; }}
                >
                  <Upload size={16} color="var(--text-secondary, #94a3b8)" />
                  Importar JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={handleFileInputChange}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Alias de retrocompatibilidad
export const GistSyncModal = CloudSyncModal;
