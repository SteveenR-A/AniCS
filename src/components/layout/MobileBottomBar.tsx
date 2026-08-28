import { NavLink } from 'react-router-dom';
import { Home, Search, Calendar, Flame, Download, Clock } from 'lucide-react';

const navItems = [
  { to: '/',          icon: Home,       label: 'Inicio'    },
  { to: '/search',    icon: Search,     label: 'Buscar'    },
  { to: '/schedule',  icon: Calendar,   label: 'Horarios'  },
  { to: '/top',       icon: Flame,      label: 'Top'       },
  { to: '/downloads', icon: Download,   label: 'Descargas' },
  { to: '/history',   icon: Clock,      label: 'Historial' },
];

export function MobileBottomBar() {
  return (
    <nav style={{
      minHeight: 'calc(var(--bottombar-height) + env(safe-area-inset-bottom, 0px))',
      height: 'auto',
      background: 'var(--bg-surface)',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-around',
      flexShrink: 0,
      paddingTop: 6,
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      zIndex: 100,
    }}>
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            color: isActive ? 'var(--accent-primary)' : 'var(--text-muted)',
            minWidth: 48,
            transition: 'color var(--transition-fast)',
          })}
        >
          {({ isActive }) => (
            <>
              <div style={{
                padding: 6,
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--accent-primary-glow)' : 'transparent',
                transition: 'background var(--transition-fast)',
              }}>
                <Icon size={22} />
              </div>
              <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 400, letterSpacing: '0.02em' }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
