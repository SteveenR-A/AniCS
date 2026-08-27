import { useState, useEffect } from 'react';
import { Film } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cacheImage } from '@/services/downloadService';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackIconSize?: number;
}

// Caché en memoria para evitar invocar tauri repetidamente en la misma sesión
const MEMORY_CACHE = new Map<string, string>();

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

    // Si ya está en memoria caché
    if (MEMORY_CACHE.has(src)) {
      setImgSrc(MEMORY_CACHE.get(src)!);
      return;
    }

    let isMounted = true;

    // Obtener la ruta de caché local desde el backend de Rust
    cacheImage(src)
      .then((localPath) => {
        if (!isMounted) return;
        if (localPath && localPath !== src && !localPath.startsWith('http')) {
          const assetUrl = convertFileSrc(localPath);
          MEMORY_CACHE.set(src, assetUrl);
          setImgSrc(assetUrl);
        } else {
          MEMORY_CACHE.set(src, src);
          setImgSrc(src);
        }
      })
      .catch(() => {
        if (isMounted) {
          setImgSrc(src);
        }
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
      style={{
        ...style,
        opacity: isLoaded ? 1 : 0.85,
        transition: 'opacity 0.2s ease',
      }}
      className={className}
      onLoad={() => setIsLoaded(true)}
      onError={() => {
        // Si falló el assetUrl local, intentar con src original antes de dar error
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
