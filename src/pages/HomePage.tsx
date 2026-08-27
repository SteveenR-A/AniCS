import { useResponsive } from '@/hooks/useResponsive';
import { DesktopHomePage } from './desktop/DesktopHomePage';
import { MobileHomePage } from './mobile/MobileHomePage';

export function HomePage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileHomePage /> : <DesktopHomePage />;
}
