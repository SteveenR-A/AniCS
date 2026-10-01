import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopSchedulePage = lazy(() => import("./desktop/DesktopSchedulePage").then(m => ({ default: m.DesktopSchedulePage })));
const MobileSchedulePage = lazy(() => import("./mobile/MobileSchedulePage").then(m => ({ default: m.MobileSchedulePage })));

export function SchedulePage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileSchedulePage /> : <DesktopSchedulePage />}
    </Suspense>
  );
}
