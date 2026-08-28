import { useState, useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { cacheImage } from '@/services/downloadService';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackIconSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// L1 JavaScript: mapa en RAM de URLs remotas -> Data URIs base64 completas (0ms)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_RAM_IMAGES = 150;
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

/** Normaliza la URL: si es una ruta local en disco, la pasa por convertFileSrc */
function normalizeSrc(rawSrc: string): string {
  if (!rawSrc) return '';
  if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://') || rawSrc.startsWith('data:') || rawSrc.startsWith('asset:')) {
    return rawSrc;
  }
  try {
    return convertFileSrc(rawSrc);
  } catch {
    return rawSrc;
  }
}

/** Limpia completamente la caché de imágenes en memoria RAM */
export function clearMemoryCache(): void {
  MEMORY_CACHE.clear();
  BITMAP_REFS.clear();
  IN_FLIGHT.clear();
}

/** Guarda en MEMORY_CACHE con límite LRU estricto para no sobre-saturar la RAM */
function setMemoryCache(url: string, dataUri: string): void {
  if (MEMORY_CACHE.size >= MAX_RAM_IMAGES) {
    const oldestKey = MEMORY_CACHE.keys().next().value;
    if (oldestKey) MEMORY_CACHE.delete(oldestKey);
  }
  MEMORY_CACHE.set(url, dataUri);
}

/** Obtiene el Data URI en RAM si ya está en caché (0ms, sin IPC ni disco) */
export function getCachedImageUrl(url: string): string {
  return MEMORY_CACHE.get(url) ?? normalizeSrc(url);
}

/** Inserta un lote de Data URIs en la memoria RAM de JavaScript */
export function setMemoryCacheBatch(batch: Record<string, string>): void {
  for (const [url, dataUri] of Object.entries(batch)) {
    if (url && dataUri && dataUri.startsWith('data:')) {
      setMemoryCache(url, dataUri);
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
    if (BITMAP_REFS.size >= MAX_RAM_IMAGES) {
      const firstKey = BITMAP_REFS.keys().next().value;
      if (firstKey) BITMAP_REFS.delete(firstKey);
    }
    BITMAP_REFS.set(dataUri, img);
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

  // Si es una ruta local en disco, convertir a asset protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return Promise.resolve(normalizeSrc(url));
  }

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
        resolved = normalizeSrc(url);
      }
      return resolved;
    })
    .catch(() => {
      return normalizeSrc(url);
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
  const normalizedInitial = normalizeSrc(src);
  const cachedInitial = src ? MEMORY_CACHE.get(src) : undefined;
  const [imgSrc, setImgSrc] = useState<string>(() => cachedInitial ?? normalizedInitial);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(Boolean(cachedInitial));
  const hasLoadedRef = useRef(Boolean(cachedInitial));

  useEffect(() => {
    if (!src) return;

    const normalized = normalizeSrc(src);
    const cached = MEMORY_CACHE.get(src);
    if (cached) {
      setImgSrc(cached);
      setIsLoaded(true);
      hasLoadedRef.current = true;
      setHasError(false);
      return;
    }

    // Si es un asset local directo
    if (normalized.startsWith('asset:') || !src.startsWith('http')) {
      setImgSrc(normalized);
      setHasError(false);
      return;
    }

    let isMounted = true;
    setHasError(false);
    setImgSrc(normalized);

    resolveImageUrl(src).then((resolvedUrl) => {
      if (!isMounted) return;
      if (resolvedUrl && resolvedUrl !== normalized) {
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
