import { useResponsive } from '@/hooks/useResponsive';
import { DesktopDetailsPage } from './desktop/DesktopDetailsPage';
import { MobileDetailsPage } from './mobile/MobileDetailsPage';

export function DetailsPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileDetailsPage /> : <DesktopDetailsPage />;
}
