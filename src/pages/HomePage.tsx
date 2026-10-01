import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopHomePage = lazy(() => import("./desktop/DesktopHomePage").then(m => ({ default: m.DesktopHomePage })));
const MobileHomePage = lazy(() => import("./mobile/MobileHomePage").then(m => ({ default: m.MobileHomePage })));

export function HomePage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileHomePage /> : <DesktopHomePage />}
    </Suspense>
  );
}
