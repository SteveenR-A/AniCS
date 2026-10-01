import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopSettingsPage = lazy(() => import("./desktop/DesktopSettingsPage").then(m => ({ default: m.DesktopSettingsPage })));
const MobileSettingsPage = lazy(() => import("./mobile/MobileSettingsPage").then(m => ({ default: m.MobileSettingsPage })));

export function SettingsPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={null}>
      {isMobile ? <MobileSettingsPage /> : <DesktopSettingsPage />}
    </Suspense>
  );
}
