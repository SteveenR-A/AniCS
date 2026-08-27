import { useResponsive } from '@/hooks/useResponsive';
import { DesktopTopAnimePage } from './desktop/DesktopTopAnimePage';
import { MobileTopAnimePage } from './mobile/MobileTopAnimePage';

export function TopAnimePage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileTopAnimePage /> : <DesktopTopAnimePage />;
}
