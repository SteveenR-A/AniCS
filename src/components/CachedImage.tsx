import { useState, useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ImageMemoryCache } from '@/utils/imageMemoryCache';
import { cacheImage } from '@/services/downloadService';

interface CachedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackIconSize?: number;
}

// Strings have a byte budget; let the WebView release decoded bitmaps itself.
const MEMORY_CACHE = new ImageMemoryCache();
const IN_FLIGHT = new Map<string, Promise<string>>();
let cacheGeneration = 0;

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
  ++cacheGeneration;
  MEMORY_CACHE.clear();
  IN_FLIGHT.clear();
}

/** Obtiene el Data URI en RAM si ya está en caché (0ms, sin IPC ni disco) */
export function getCachedImageUrl(url: string): string {
  return MEMORY_CACHE.get(url) ?? normalizeSrc(url);
}

/** Inserta un lote de Data URIs en la memoria RAM de JavaScript */
export function setMemoryCacheBatch(batch: Record<string, string>): void {
  for (const [url, dataUri] of Object.entries(batch)) {
    if (url && dataUri && dataUri.startsWith('data:')) {
      MEMORY_CACHE.set(url, dataUri);
    }
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
    return Promise.resolve(cached);
  }

  // In-flight: compartir la Promise existente (SingleFlight)
  const inflight = IN_FLIGHT.get(url);
  if (inflight) return inflight;

  // Nueva resolución: invocar Rust para obtener el Data URI
  const generation = cacheGeneration;
  const promise = cacheImage(url)
    .then((dataUri) => {
      let resolved: string;
      if (dataUri && dataUri.startsWith('data:')) {
        resolved = dataUri;
        if (generation === cacheGeneration) {
          MEMORY_CACHE.set(url, resolved);
        }
      } else {
        resolved = normalizeSrc(url);
      }
      return resolved;
    })
    .catch(() => {
      return normalizeSrc(url);
    })
    .finally(() => {
      if (IN_FLIGHT.get(url) === promise) IN_FLIGHT.delete(url);
    });

  IN_FLIGHT.set(url, promise);
  return promise;
}

export function CachedImage({
  src, alt, fallbackIconSize = 32, style, className,
  loading = 'lazy', onLoad, onError, ...props
}: CachedImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [image, setImage] = useState(() => ({
    source: src, url: MEMORY_CACHE.get(src), loaded: false, error: false,
  }));
  // Never paint the old source or retain its error while a recycled card changes.
  const current = image.source === src ? image : { source: src, url: undefined, loaded: false, error: false };

  useEffect(() => {
    let disposed = false;
    const cached = MEMORY_CACHE.get(src);
    const local = src && !/^https?:\/\//.test(src);
    setImage({ source: src, url: cached ?? (local ? normalizeSrc(src) : undefined), loaded: Boolean(cached), error: false });
    if (!src || cached || local) return;

    const load = () => {
      if (disposed) return;
      // Resolve before assigning src so the browser and IPC do not fetch twice.
      void resolveImageUrl(src).then(url => {
        if (!disposed) setImage({ source: src, url, loaded: false, error: false });
      });
    };
    let observer: IntersectionObserver | undefined;
    if (loading === 'eager' || typeof IntersectionObserver === 'undefined') {
      load();
    } else if (imageRef.current) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      }, { rootMargin: '300px' });
      observer.observe(imageRef.current);
    }
    return () => { disposed = true; observer?.disconnect(); };
  }, [src, loading]);

  if (!src || current.error) {
    return (
      <span role="img" aria-label={alt} className={className} style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-elevated)',
        color: 'var(--text-muted)', ...style,
      }}>
        <Film size={fallbackIconSize} aria-hidden="true" />
      </span>
    );
  }

  return (
    <img {...props} ref={imageRef} src={current.url} alt={alt} loading={loading} decoding="async"
      style={{ ...style, opacity: current.loaded ? 1 : 0.85 }} className={className}
      onLoad={event => {
        setImage(previous => previous.source === src ? { ...previous, loaded: true } : previous);
        onLoad?.(event);
      }}
      onError={event => {
        setImage(previous => previous.source !== src ? previous : previous.url !== src
          ? { ...previous, url: src, loaded: false }
          : { ...previous, error: true });
        onError?.(event);
      }}
    />
  );
}
