import { useResponsive } from '@/hooks/useResponsive';
import {
  DesktopHistoryPage,
  DesktopFavoritesPage,
  DesktopDownloadsPage,
} from './desktop/DesktopOtherPages';
import {
  MobileHistoryPage,
  MobileFavoritesPage,
  MobileDownloadsPage,
} from './mobile/MobileOtherPages';

export function HistoryPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileHistoryPage /> : <DesktopHistoryPage />;
}

export function FavoritesPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileFavoritesPage /> : <DesktopFavoritesPage />;
}

export function DownloadsPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileDownloadsPage /> : <DesktopDownloadsPage />;
}
