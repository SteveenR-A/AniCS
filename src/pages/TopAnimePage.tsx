import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopTopAnimePage = lazy(() => import("./desktop/DesktopTopAnimePage").then(m => ({ default: m.DesktopTopAnimePage })));
const MobileTopAnimePage = lazy(() => import("./mobile/MobileTopAnimePage").then(m => ({ default: m.MobileTopAnimePage })));

export function TopAnimePage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileTopAnimePage /> : <DesktopTopAnimePage />}
    </Suspense>
  );
}
