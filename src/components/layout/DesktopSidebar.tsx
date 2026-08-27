import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Search, Calendar, Flame, Download, Clock,
  BookMarked, Settings, ChevronLeft, ChevronRight, Tv2
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';

const navItems = [
  { to: '/',          icon: Home,       label: 'Inicio'       },
  { to: '/search',    icon: Search,     label: 'Buscar Anime' },
  { to: '/schedule',  icon: Calendar,   label: 'Horarios'     },
  { to: '/top',       icon: Flame,      label: 'Top Animes'   },
  { to: '/downloads', icon: Download,   label: 'Descargas'    },
  { to: '/history',   icon: Clock,      label: 'Historial'    },
  { to: '/favorites', icon: BookMarked, label: 'Favoritos'    },
];

/** Mapea el ID interno de la fuente a un label legible corto */
function sourceLabel(id: string): string {
  if (id === 'jkanime') return 'Anime';
  if (id === 'mundodonghua') return 'Donghua';
  return id;
}

/** Letra/emoji para el icono compacto de fuente en sidebar colapsada */
function sourceGlyph(id: string): string {
  if (id === 'jkanime') return 'A';
  if (id === 'mundodonghua') return 'D';
  return id.slice(0, 1).toUpperCase();
}

export function DesktopSidebar() {
  // Persiste el estado colapsado en localStorage entre sesiones
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  const { sources, activeSource, setActiveSource } = useAnimeStore();

  return (
    <motion.nav
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? '20px 0' : '20px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border-subtle)',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
        data-tauri-drag-region
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Tv2 size={20} color="white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              style={{
                fontWeight: 800, fontSize: 20, letterSpacing: '-0.04em',
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                whiteSpace: 'nowrap',
              }}
            >
              AniCS
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: '12px 8px', overflow: 'hidden auto' }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              marginBottom: 4,
              textDecoration: 'none',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              boxShadow: isActive ? 'inset 3px 0 0 var(--accent-primary)' : 'none',
              transition: 'all var(--transition-fast)',
              overflow: 'hidden',
              justifyContent: collapsed ? 'center' : 'flex-start',
            })}
          >
            {({ isActive }) => (
              <>
                <Icon size={20} color={isActive ? 'var(--accent-primary)' : undefined} style={{ flexShrink: 0 }} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ fontSize: 14, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}

        {/* Source Switcher */}
        {sources.length > 1 && (
          <div style={{ marginTop: 16, padding: collapsed ? '0' : '0 4px' }}>
            {/* Label solo en modo expandido */}
            {!collapsed && (
              <p style={{
                fontSize: 11, color: 'var(--text-muted)', fontWeight: 600,
                letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8,
                paddingLeft: 4,
              }}>
                Fuente
              </p>
            )}

            {sources.map((s) => {
              const isActive = activeSource === s.id;
              return collapsed ? (
                /* Modo colapsado: botón compacto con inicial y tooltip */
                <button
                  key={s.id}
                  onClick={() => setActiveSource(s.id)}
                  title={`Cambiar a ${sourceLabel(s.id)}`}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '8px 0', borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                    border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent',
                    cursor: 'pointer', marginBottom: 4,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: isActive
                      ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                      : 'var(--bg-elevated)',
                    color: isActive ? 'white' : 'var(--text-muted)',
                    fontSize: 12, fontWeight: 800,
                  }}>
                    {sourceGlyph(s.id)}
                  </span>
                </button>
              ) : (
                /* Modo expandido: botón con nombre legible */
                <button
                  key={s.id}
                  onClick={() => setActiveSource(s.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 10px', borderRadius: 'var(--radius-sm)',
                    background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                    border: isActive ? '1px solid var(--border-accent)' : '1px solid transparent',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 400,
                    transition: 'all var(--transition-fast)', marginBottom: 4,
                  }}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }} />
                  {sourceLabel(s.id)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Settings + Collapse toggle */}
      <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
        <NavLink
          to="/settings"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
            borderRadius: 'var(--radius-md)', textDecoration: 'none',
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: isActive ? 'var(--bg-elevated)' : 'transparent',
            transition: 'all var(--transition-fast)',
            justifyContent: collapsed ? 'center' : 'flex-start',
          })}
        >
          <Settings size={20} style={{ flexShrink: 0 }} />
          {!collapsed && <span style={{ fontSize: 14 }}>Ajustes</span>}
        </NavLink>

        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 12, padding: '10px 12px', borderRadius: 'var(--radius-md)',
            background: 'transparent', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 14, transition: 'all var(--transition-fast)',
          }}
        >
          {collapsed
            ? <ChevronRight size={18} />
            : <><ChevronLeft size={18} /><span>Colapsar</span></>
          }
        </button>
      </div>
    </motion.nav>
  );
}
