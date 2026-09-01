import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, Search, Calendar, Flame, Download, Clock,
  BookMarked, Settings, ChevronLeft, ChevronRight, Tv2, User
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { ProfileSelectorModal, getProfileAvatarIcon } from '@/components/ProfileSelectorModal';

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
  const { activeProfile } = useProfileStore();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const ProfileIcon = activeProfile ? getProfileAvatarIcon(activeProfile.avatar) : User;

  return (
    <>
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

        {/* Navigation Items */}
        <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-elevated)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 14,
                  transition: 'all var(--transition-fast)',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                })}
              >
                <Icon size={20} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}

          {/* Selector de Fuentes */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
            {!collapsed && (
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '0 12px 8px',
              }}>
                Catálogo
              </div>
            )}
            {sources.map((s) => {
              const isActive = activeSource === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSource(s.id)}
                  title={collapsed ? sourceLabel(s.id) : undefined}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    gap: 10,
                    padding: collapsed ? '8px 0' : '8px 12px',
                    borderRadius: 'var(--radius-md)',
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
                  {!collapsed ? sourceLabel(s.id) : sourceGlyph(s.id)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Profile + Settings + Collapse toggle */}
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          {/* Profile Button */}
          <button
            onClick={() => setIsProfileModalOpen(true)}
            title={activeProfile ? `Perfil: ${activeProfile.name}` : 'Perfil de Usuario'}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              justifyContent: collapsed ? 'center' : 'flex-start',
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: activeProfile?.color || 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                flexShrink: 0,
                boxShadow: `0 2px 6px ${(activeProfile?.color || '#3b82f6')}55`,
              }}
            >
              <ProfileIcon size={14} />
            </div>
            {!collapsed && (
              <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeProfile?.name || 'Perfil'}
              </span>
            )}
          </button>

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

      <ProfileSelectorModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
}
