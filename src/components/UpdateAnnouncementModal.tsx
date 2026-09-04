import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowRight, Download, Clock } from 'lucide-react';
import type { GitHubRelease } from '@/services/updateService';
import { CURRENT_VERSION } from '@/services/updateService';

interface UpdateAnnouncementModalProps {
  isOpen: boolean;
  release: GitHubRelease | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function UpdateAnnouncementModal({
  isOpen,
  release,
  onClose,
  onUpdate,
}: UpdateAnnouncementModalProps) {
  if (!isOpen || !release) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 540,
            maxHeight: '88vh',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header con gradiente premium */}
          <div
            style={{
              padding: '20px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.1))',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-glow)',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={22} color="white" />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    margin: 0,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  ¡Nueva Versión Disponible!
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                    }}
                  >
                    v{CURRENT_VERSION}
                  </span>
                  <ArrowRight size={11} color="var(--text-muted)" />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: 'var(--accent-primary)',
                      background: 'rgba(59, 130, 246, 0.15)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {release.tag_name}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body: Novedades / Release Notes */}
          <div
            style={{
              padding: '20px 22px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Hay una nueva actualización lista para instalar con mejoras de rendimiento, correcciones y nuevas funciones.
            </div>

            {release.body && (
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '14px 16px',
                  maxHeight: 220,
                  overflowY: 'auto',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'inherit',
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: 'var(--accent-primary)',
                    marginBottom: 6,
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Novedades de {release.tag_name}:
                </div>
                {release.body}
              </div>
            )}
          </div>

          {/* Footer: Acciones */}
          <div
            style={{
              padding: '14px 22px 18px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 10,
              background: 'var(--bg-surface)',
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-md)',
                padding: '9px 16px',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Clock size={14} /> Más tarde
            </button>

            <button
              onClick={onUpdate}
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '9px 20px',
                color: 'white',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: 'var(--shadow-glow)',
              }}
            >
              <Download size={14} /> Actualizar ahora
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
