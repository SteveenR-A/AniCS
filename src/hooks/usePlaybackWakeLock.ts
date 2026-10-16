import { useEffect, useRef } from 'react';
import { setKeepScreenOn } from '@/services/downloadService';

export function usePlaybackWakeLock(isPlaying: boolean) {
  // Screen Wake Lock y mantenimiento de pantalla activa estrictamente reactivo a isPlaying
  const wakeLockSentinelRef = useRef<any>(null);

  useEffect(() => {
    let isSubscribed = true;

    const updateScreenLock = async () => {
      if (isPlaying && document.visibilityState === 'visible') {
        setKeepScreenOn(true);
        try {
          if ('wakeLock' in navigator && !wakeLockSentinelRef.current) {
            const sentinel = await (navigator as any).wakeLock.request('screen');
            if (isSubscribed) {
              wakeLockSentinelRef.current = sentinel;
              sentinel.addEventListener?.('release', () => {
                if (wakeLockSentinelRef.current === sentinel) {
                  wakeLockSentinelRef.current = null;
                }
              });
            } else {
              sentinel.release().catch(() => {});
            }
          }
        } catch {}
      } else {
        setKeepScreenOn(false);
        if (wakeLockSentinelRef.current && typeof wakeLockSentinelRef.current.release === 'function') {
          wakeLockSentinelRef.current.release().catch(() => {});
          wakeLockSentinelRef.current = null;
        }
      }
    };

    updateScreenLock();

    const handleVisibilityChange = () => {
      updateScreenLock();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      setKeepScreenOn(false);
      if (wakeLockSentinelRef.current && typeof wakeLockSentinelRef.current.release === 'function') {
        wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
      }
    };
  }, [isPlaying]);

}
