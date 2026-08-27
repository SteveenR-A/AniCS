import { useState, useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import { cacheImage } from '@/services/downloadService';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackIconSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 JavaScript: mapa en RAM de URLs remotas -> Data URIs base64 completas (0ms)
// ─────────────────────────────────────────────────────────────────────────────
const MEMORY_CACHE = new Map<string, string>();

// ─────────────────────────────────────────────────────────────────────────────
// Cache de Bitmaps decodificados en RAM del navegador: mantiene los objetos Image
// en memoria para que el WebView tenga los píxeles decodificados en GPU/RAM listos
// ─────────────────────────────────────────────────────────────────────────────
const BITMAP_REFS = new Map<string, HTMLImageElement>();

// ─────────────────────────────────────────────────────────────────────────────
// SingleFlight en frontend: evita múltiples llamadas IPC concurrentes para la misma URL.
// ─────────────────────────────────────────────────────────────────────────────
const IN_FLIGHT = new Map<string, Promise<string>>();

/** Obtiene el Data URI en RAM si ya está en caché (0ms, sin IPC ni disco) */
export function getCachedImageUrl(url: string): string {
  return MEMORY_CACHE.get(url) ?? url;
}

/** Inserta un lote de Data URIs en la memoria RAM de JavaScript */
export function setMemoryCacheBatch(batch: Record<string, string>): void {
  for (const [url, dataUri] of Object.entries(batch)) {
    if (url && dataUri && dataUri.startsWith('data:')) {
      MEMORY_CACHE.set(url, dataUri);
      keepInRam(dataUri);
    }
  }
}

/** Predecodifica una imagen en RAM del WebView para pintura a 0ms */
function keepInRam(dataUri: string) {
  if (!dataUri || BITMAP_REFS.has(dataUri)) return;
  try {
    const img = new Image();
    img.src = dataUri;
    img.decode().catch(() => {/* best-effort */});
    BITMAP_REFS.set(dataUri, img);
    // Limitar el mapa de referencias a 1000 imágenes en RAM
    if (BITMAP_REFS.size > 1000) {
      const firstKey = BITMAP_REFS.keys().next().value;
      if (firstKey) BITMAP_REFS.delete(firstKey);
    }
  } catch {
    // Ignorar si el navegador no soporta decode
  }
}

/**
 * Precarga una imagen sin montar el componente.
 * Deduplicada: si ya está cacheada o en vuelo, no lanza otra llamada IPC.
 */
export function prefetchImage(url: string): void {
  if (!url || !url.startsWith('http') || MEMORY_CACHE.has(url) || IN_FLIGHT.has(url)) return;
  resolveImageUrl(url).catch(() => {/* best-effort */});
}

/**
 * Resuelve una URL a su Data URI en RAM con deduplicación SingleFlight.
 * Retorna directamente el valor del caché si ya fue resuelto en RAM.
 */
export function resolveImageUrl(url: string): Promise<string> {
  if (!url) return Promise.resolve('');

  // Hit en L1 RAM: 0ms, sin IPC ni disco
  const cached = MEMORY_CACHE.get(url);
  if (cached) {
    keepInRam(cached);
    return Promise.resolve(cached);
  }

  // In-flight: compartir la Promise existente (SingleFlight)
  const inflight = IN_FLIGHT.get(url);
  if (inflight) return inflight;

  // Nueva resolución: invocar Rust para obtener el Data URI
  const promise = cacheImage(url)
    .then((dataUri) => {
      let resolved: string;
      if (dataUri && dataUri.startsWith('data:')) {
        resolved = dataUri;
        MEMORY_CACHE.set(url, resolved);
        keepInRam(resolved);
      } else {
        resolved = url;
      }
      return resolved;
    })
    .catch(() => {
      return url;
    })
    .finally(() => {
      IN_FLIGHT.delete(url);
    });

  IN_FLIGHT.set(url, promise);
  return promise;
}

export function CachedImage({
  src,
  alt,
  fallbackIconSize = 32,
  style,
  className,
  ...props
}: CachedImageProps) {
  // Estado inicial: si ya está en RAM, usar inmediatamente el Data URI
  const cachedInitial = src ? MEMORY_CACHE.get(src) : undefined;
  const [imgSrc, setImgSrc] = useState<string>(() => cachedInitial ?? src ?? '');
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(Boolean(cachedInitial));
  const hasLoadedRef = useRef(Boolean(cachedInitial));

  useEffect(() => {
    if (!src) return;

    const cached = MEMORY_CACHE.get(src);
    if (cached) {
      setImgSrc(cached);
      setIsLoaded(true);
      hasLoadedRef.current = true;
      setHasError(false);
      return;
    }

    let isMounted = true;
    setHasError(false);
    setImgSrc(src);

    resolveImageUrl(src).then((resolvedUrl) => {
      if (!isMounted) return;
      if (resolvedUrl && resolvedUrl !== src) {
        setImgSrc(resolvedUrl);
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
          ...(style as React.CSSProperties),
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
        opacity: isLoaded ? 1 : 0.85,
        transition: isLoaded ? 'none' : 'opacity 0.15s ease',
      }}
      className={className}
      onLoad={() => {
        setIsLoaded(true);
        hasLoadedRef.current = true;
      }}
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
