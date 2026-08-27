import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, CheckCircle2, Calendar, ShieldCheck, Tag } from 'lucide-react';
import changelogData from '@/data/changelog.json';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangelogModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 640, maxHeight: '85vh',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(236,72,153,0.05))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={20} color="white" />
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  Notas de Parche y Novedades
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Historial de cambios y mejoras de AniCS
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)', border: 'none',
                borderRadius: '50%', width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body con scroll */}
          <div style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 28,
          }}>
            {changelogData.map((entry, index) => (
              <div key={entry.version} style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
              }}>
                {/* Encabezado de la versión */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      background: index === 0 ? 'var(--accent-primary)' : 'var(--bg-surface)',
                      color: 'white', fontSize: 12, fontWeight: 700,
                      padding: '3px 10px', borderRadius: 'var(--radius-full)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Tag size={12} /> v{entry.version}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>
                      {entry.title}
                    </span>
                  </div>

                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} /> {entry.date}
                  </span>
                </div>

                {/* Lista de cambios */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {entry.highlights.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <CheckCircle2 size={16} color="var(--accent-primary)" style={{ flexShrink: 0, marginTop: 3 }} />
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--bg-surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12 }}>
              <ShieldCheck size={14} color="var(--accent-success)" />
              <span>AniCS v0.1.0 · Actualizado</span>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                border: 'none', borderRadius: 'var(--radius-md)', padding: '8px 20px',
                color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Entendido
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
