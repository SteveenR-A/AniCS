import { PageLoading } from '@/components/PageLoading';
import { lazy, Suspense } from "react";
import { useResponsive } from "@/hooks/useResponsive";

const DesktopDetailsPage = lazy(() => import("./desktop/DesktopDetailsPage").then(m => ({ default: m.DesktopDetailsPage })));
const MobileDetailsPage = lazy(() => import("./mobile/MobileDetailsPage").then(m => ({ default: m.MobileDetailsPage })));

export function DetailsPage() {
  const { isMobile } = useResponsive();
  return (
    <Suspense fallback={<PageLoading />}>
      {isMobile ? <MobileDetailsPage /> : <DesktopDetailsPage />}
    </Suspense>
  );
}
