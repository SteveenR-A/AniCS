import { useRef, useCallback } from 'react';

/**
 * Hook para evitar condiciones de carrera en peticiones asíncronas concurrentes.
 * Permite descartar respuestas de peticiones obsoletas cuando se inicia una más reciente.
 */
export function useLatestRequest() {
  const currentIdRef = useRef(0);

  const start = useCallback(() => {
    const id = ++currentIdRef.current;
    return {
      id,
      isLatest: () => currentIdRef.current === id,
    };
  }, []);

  const isLatest = useCallback((id: number) => currentIdRef.current === id, []);

  const cancel = useCallback(() => {
    currentIdRef.current++;
  }, []);

  return { start, isLatest, cancel, currentIdRef };
}
