import { useResponsive } from '@/hooks/useResponsive';
import { DesktopSettingsPage } from './desktop/DesktopSettingsPage';
import { MobileSettingsPage } from './mobile/MobileSettingsPage';

export function SettingsPage() {
  const { isMobile } = useResponsive();
  return isMobile ? <MobileSettingsPage /> : <DesktopSettingsPage />;
}
