import { PageLoading } from '@/components/PageLoading';
import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopHistoryPage = lazy(() => import("./desktop/DesktopHistoryPage").then(m => ({ default: m.DesktopHistoryPage })));
const DesktopFavoritesPage = lazy(() => import("./desktop/DesktopFavoritesPage").then(m => ({ default: m.DesktopFavoritesPage })));
const DesktopDownloadsPage = lazy(() => import("./desktop/DesktopDownloadsPage").then(m => ({ default: m.DesktopDownloadsPage })));

const MobileHistoryPage = lazy(() => import("./mobile/MobileHistoryPage").then(m => ({ default: m.MobileHistoryPage })));
const MobileFavoritesPage = lazy(() => import("./mobile/MobileFavoritesPage").then(m => ({ default: m.MobileFavoritesPage })));
const MobileDownloadsPage = lazy(() => import("./mobile/MobileDownloadsPage").then(m => ({ default: m.MobileDownloadsPage })));

export function HistoryPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={<PageLoading />}>
      {isMobile ? <MobileHistoryPage /> : <DesktopHistoryPage />}
    </Suspense>
  );
}

export function FavoritesPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={<PageLoading />}>
      {isMobile ? <MobileFavoritesPage /> : <DesktopFavoritesPage />}
    </Suspense>
  );
}

export function DownloadsPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={<PageLoading />}>
      {isMobile ? <MobileDownloadsPage /> : <DesktopDownloadsPage />}
    </Suspense>
  );
}
