import { useState, useEffect } from 'react';

export type Platform = 'desktop' | 'mobile';

/**
 * Detecta si la app está corriendo en Android (móvil) o Windows (desktop).
 * En Tauri, podemos usar el tamaño de ventana y el user-agent para distinguir.
 */
export function useResponsive() {
  const [platform, setPlatform] = useState<Platform>(() => {
    // Detectar Android mediante user-agent
    if (typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)) {
      return 'mobile';
    }
    // O mediante tamaño de ventana (< 768px = móvil)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'mobile';
    }
    return 'desktop';
  });

  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      if (/android/i.test(navigator.userAgent)) {
        setPlatform('mobile');
      } else {
        setPlatform(width < 768 ? 'mobile' : 'desktop');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    platform,
    isMobile: platform === 'mobile',
    isDesktop: platform === 'desktop',
    windowWidth,
  };
}
