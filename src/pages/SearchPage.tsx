import { useResponsive } from '@/hooks/useResponsive';
import { DesktopSearchPage } from './desktop/DesktopSearchPage';
import { MobileSearchPage } from './mobile/MobileSearchPage';

export function SearchPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileSearchPage /> : <DesktopSearchPage />;
}
