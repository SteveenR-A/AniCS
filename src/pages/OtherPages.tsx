import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopHistoryPage = lazy(() => import("./desktop/DesktopOtherPages").then(m => ({ default: m.DesktopHistoryPage })));
const DesktopFavoritesPage = lazy(() => import("./desktop/DesktopOtherPages").then(m => ({ default: m.DesktopFavoritesPage })));
const DesktopDownloadsPage = lazy(() => import("./desktop/DesktopOtherPages").then(m => ({ default: m.DesktopDownloadsPage })));

const MobileHistoryPage = lazy(() => import("./mobile/MobileOtherPages").then(m => ({ default: m.MobileHistoryPage })));
const MobileFavoritesPage = lazy(() => import("./mobile/MobileOtherPages").then(m => ({ default: m.MobileFavoritesPage })));
const MobileDownloadsPage = lazy(() => import("./mobile/MobileOtherPages").then(m => ({ default: m.MobileDownloadsPage })));

export function HistoryPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileHistoryPage /> : <DesktopHistoryPage />}
    </Suspense>
  );
}

export function FavoritesPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileFavoritesPage /> : <DesktopFavoritesPage />}
    </Suspense>
  );
}

export function DownloadsPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileDownloadsPage /> : <DesktopDownloadsPage />}
    </Suspense>
  );
}
