import { Outlet } from 'react-router-dom';
import { useResponsive } from '@/hooks/useResponsive';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileBottomBar } from './MobileBottomBar';

export function AppShell() {
  const { isMobile } = useResponsive();

  return (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-base)',
    }}>
      {/* Sidebar solo en desktop */}
      {!isMobile && <DesktopSidebar />}

      {/* Área de contenido principal */}
      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch' as any,
        }}>
          <Outlet />
        </div>
      </main>

      {/* Bottom bar solo en móvil */}
      {isMobile && <MobileBottomBar />}
    </div>
  );
}
