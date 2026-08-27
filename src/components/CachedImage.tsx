import { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cacheImage } from '@/services/downloadService';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackIconSize?: number;
}

// Caché en RAM global instantánea (0ms)
const MEMORY_CACHE = new Map<string, string>();

export function getCachedImageUrl(url: string): string {
  return MEMORY_CACHE.get(url) || url;
}

export function prefetchImage(url: string) {
  if (!url || MEMORY_CACHE.has(url)) return;
  cacheImage(url)
    .then((localPath) => {
      if (localPath && localPath !== url && !localPath.startsWith('http')) {
        MEMORY_CACHE.set(url, convertFileSrc(localPath));
      } else {
        MEMORY_CACHE.set(url, url);
      }
    })
    .catch(() => {
      MEMORY_CACHE.set(url, url);
    });
}

export function CachedImage({
  src,
  alt,
  fallbackIconSize = 32,
  style,
  className,
  ...props
}: CachedImageProps) {
  const [imgSrc, setImgSrc] = useState<string>(() => {
    if (!src) return '';
    return MEMORY_CACHE.get(src) || src;
  });
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!src) return;
    setIsLoaded(false);

    // Si ya está en memoria caché RAM local, usarla de inmediato (0ms)
    if (MEMORY_CACHE.has(src)) {
      setImgSrc(MEMORY_CACHE.get(src)!);
      return;
    }

    // Mostrar inmediatamente la URL directa para que el navegador la pinte sin retraso
    setImgSrc(src);

    let isMounted = true;

    // Descargar y guardar en caché local en segundo plano
    cacheImage(src)
      .then((localPath) => {
        if (!isMounted) return;
        if (localPath && localPath !== src && !localPath.startsWith('http')) {
          const assetUrl = convertFileSrc(localPath);
          MEMORY_CACHE.set(src, assetUrl);
          setImgSrc(assetUrl);
        } else {
          MEMORY_CACHE.set(src, src);
        }
      })
      .catch(() => {
        MEMORY_CACHE.set(src, src);
      });

    return () => {
      isMounted = false;
    };
  }, [src]);

  if (!src || hasError) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface-2))',
          color: 'var(--text-muted)',
          ...(style as any),
        }}
        className={className}
      >
        <Film size={fallbackIconSize} />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      loading="eager"
      decoding="async"
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.95,
        transition: 'opacity 0.15s ease',
      }}
      className={className}
      onLoad={() => setIsLoaded(true)}
      onError={() => {
        if (imgSrc !== src) {
          setImgSrc(src);
        } else {
          setHasError(true);
        }
      }}
      {...props}
    />
  );
}
