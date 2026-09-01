import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, KeyRound, X, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useSyncStore } from '@/stores/useSyncStore';

export const PinDialogModal: React.FC = () => {
  const { isPinModalOpen, pinModalMode, submitPin, cancelPin } = useSyncStore();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPinModalOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = pin.trim();
    if (!trimmed || trimmed.length < 4) {
      setError('El PIN debe tener al menos 4 caracteres');
      return;
    }

    if (pinModalMode === 'setup') {
      if (trimmed !== confirmPin.trim()) {
        setError('Los PINs no coinciden');
        return;
      }
    }

    submitPin(trimmed);
    setPin('');
    setConfirmPin('');
  };

  const handleClose = () => {
    setError(null);
    setPin('');
    setConfirmPin('');
    cancelPin();
  };

  const title =
    pinModalMode === 'setup'
      ? 'Configurar PIN de Cifrado'
      : pinModalMode === 'disable'
      ? 'Confirmar PIN para Desactivar Cifrado'
      : 'Ingresar PIN de Cifrado';

  const subtitle =
    pinModalMode === 'setup'
      ? 'Crea un PIN seguro para cifrar tus datos en la nube con AES-GCM 256 bits.'
      : 'Ingresa tu PIN para descifrar y sincronizar los datos de tu Gist.';

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
            maxWidth: '420px',
            background: 'var(--bg-card, #16181f)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '20px 20px 14px 20px',
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
                <KeyRound size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>
                  {title}
                </h3>
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.5 }}>
              {subtitle}
            </p>

            {error && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '10px 12px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#f87171',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 6 }}>
                  {pinModalMode === 'setup' ? 'Nuevo PIN' : 'PIN'}
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="Mínimo 4 caracteres..."
                    autoFocus
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '10px 40px 10px 12px',
                      color: 'white',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.5)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {pinModalMode === 'setup' && (
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 6 }}>
                    Confirmar PIN
                  </label>
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={confirmPin}
                    onChange={e => setConfirmPin(e.target.value)}
                    placeholder="Repite tu PIN..."
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: 'white',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={handleClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  padding: '9px 16px',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  background: 'var(--accent-primary, #3b82f6)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 20px',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.35)',
                }}
              >
                <ShieldCheck size={16} />
                <span>Confirmar</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
