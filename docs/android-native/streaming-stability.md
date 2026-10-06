# Estabilidad de reproducción en línea en Kotlin

## Diferencias encontradas frente a Tauri

`src/pages/PlayerPage.tsx` configura HLS con 60 segundos de búfer, máximo de 120,
unos 60 MB de datos y reintentos de fragmentos. `src/utils/hlsLoader.ts` también
redirige solicitudes de la familia `ducvomes.com` a espejos y rota ante fallos.
Kotlin usaba ExoPlayer sin LoadControl personalizado ni ese cargador. Su fallback
de servidor cubría la resolución inicial, pero no un error de red durante el video.
Estas diferencias explican posibles cortes adicionales; no se dispone de una captura
de red del episodio reportado para atribuir todos sus cortes a una sola causa.

## Cambios

- Búfer de VOD: mínimo 60 s, máximo 120 s, inicio con 4 s y reanudación después de
  quedarse sin datos con 10 s. Tras un corte puede esperar más antes de reanudar,
  para evitar el ciclo de reproducir pocos segundos y volver a detenerse.
- Objetivo de 64 MiB para datos comprimidos, priorizado sobre alcanzar los segundos
  configurados; no es un límite exacto de RAM de toda la app. Retiene 15 s hacia atrás
  desde keyframes para reducir lecturas al retroceder. Conserva ABR de Media3 y la
  calidad elegida; no fuerza la variante de mayor bitrate.
- Cuatro reintentos mínimos de carga con el backoff de Media3; sus errores no
  recuperables siguen el comportamiento estándar. Conexión HTTP limitada a 10 s y
  lectura a 15 s (antes 15/20). Se mantiene Referer, User-Agent y redirecciones.
- El DataSource de reproducción aplica la misma familia de espejos que Tauri. Solo
  reconoce hosts exactos `cdn1` a `cdn6` de `ducvomes.com` sin puerto personalizado,
  credenciales en autoridad ni métodos distintos de GET. Para cdn2/cdn5 intenta cdn1
  primero y conserva el host original entre las alternativas. Prueba como máximo
  cuatro hosts por apertura; un espejo que respondió se prioriza durante ese stream.
  No se afirma que un espejo concreto esté disponible permanentemente.
- Se preservan ruta/query codificados, firma, rango, cabeceras, flags y clave de
  caché del DataSpec. Se cierran intentos fallidos y se conservan listeners de
  transferencia para que Media3 pueda medir ancho de banda. Los manifiestos HLS
  relativos usan la URL efectiva; las URLs absolutas de fragmentos pasan por la
  misma fábrica. Las solicitudes de otros dominios y loopback no cambian de host.
- Si una lectura del cuerpo falla, el error vuelve a Media3. La siguiente apertura
  intenta otro espejo con el rango del último byte consumido. No se empalman cuerpos
  HTTP ni se modifica el índice temporal dentro de `read()`.
- Agotados los reintentos, los errores de red/HTTP permiten otro servidor del episodio
  si `allowFallback` está activo. Conserva posición, perfil y la intención play/pause;
  prueba cada servidor una vez para evitar ciclos. Las acciones manuales reinician
  esa oportunidad y un episodio nuevo tiene su propio conjunto. No se aplica a
  reproducción local, errores del decodificador ni cuando fallback está desactivado.

Cambios aislados al módulo Kotlin: sin dependencias nuevas, cambios de Tauri/Rust,
migración Room ni escritura de caché o descargas adicionales en disco.

## Validación

- `npm run build` correcto; `git diff --check` correcto.
- Kotlin 2.0.21/JVM 17: compilación de StreamingBuffer/DataSource/Cdn contra Media3
  1.4.1 y 4 pruebas JUnit correctas para URI, firmas y selección acotada de espejos.
- Los tres archivos de pruebas StreamingBuffer/DataSource/Cdn también compilan
  contra sus dependencias reales; las seis pruebas Robolectric no se ejecutaron localmente.
- Se añaden pruebas Robolectric de reserve/rebuffer, umbral de memoria y red:
  recuperación de manifiestos/fragmentos, cierre, cabeceras/rangos, listeners,
  cancelación y reapertura después de fallar el cuerpo.
- PlaybackSessionTest añade recuperación con posición/pausa/perfil, preferencia de
  fallback, exclusión local, agotamiento, acciones manuales y otro episodio.
- La suite Android completa y el APK se validan en Android Native CI. Localmente
  no hay SDK Android/JDK 21; `cargo check` y `cargo test` no disponibles por falta
  de cargo (sin cambios Rust).

Pendiente comparación en teléfono con el mismo episodio, servidor y calidad en ambas
versiones. Medir número/duración de rebuffer y tiempo de inicio; incluir HLS con
manifiesto maestro, MP4 remoto, Wi-Fi variable, red caída, fallback desactivado,
saltos, reproducción pausada y memoria en sesiones largas. Un servidor o enlace
con caudal sostenido inferior al bitrate aún puede producir cortes.

Referencia de Media3: https://developer.android.com/media/media3/exoplayer/customization
