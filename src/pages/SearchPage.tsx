import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopSearchPage = lazy(() => import("./desktop/DesktopSearchPage").then(m => ({ default: m.DesktopSearchPage })));
const MobileSearchPage = lazy(() => import("./mobile/MobileSearchPage").then(m => ({ default: m.MobileSearchPage })));

export function SearchPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileSearchPage /> : <DesktopSearchPage />}
    </Suspense>
  );
}
