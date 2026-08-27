import { useResponsive } from '@/hooks/useResponsive';
import { DesktopSchedulePage } from './desktop/DesktopSchedulePage';
import { MobileSchedulePage } from './mobile/MobileSchedulePage';

export function SchedulePage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileSchedulePage /> : <DesktopSchedulePage />;
}
