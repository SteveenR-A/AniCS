# Saltos del reproductor Kotlin

## Síntoma y alcance

Se reporta imagen congelada o desfasada al avanzar/retroceder un archivo local mientras
el audio continúa. No se dispone del archivo afectado ni de registros del decodificador,
por lo que no se afirma haber identificado o reproducido la causa exacta.
Se mejora el reproductor Media3 compartido por videos locales y en línea.

## Cambios

- `SeekParameters.CLOSEST_SYNC` busca el fotograma de sincronización más cercano.
  Evita decodificar y descartar todos los fotogramas entre un I-frame lejano y una
  posición exacta. La posición final puede variar respecto al segundo solicitado,
  dependiendo del intervalo entre keyframes. Audio y video conservan la misma línea de tiempo.
- `FLAG_DETECT_ACCESS_UNITS` detecta límites de fotogramas H.264 cuando un TS no tiene
  delimitadores AUD. Se configura tanto en archivos progresivos (incluidos TS descargados)
  como en HLS. No se habilitan keyframes no-IDR, que pueden provocar corrupción visual.
- Los saltos manuales requieren un medio buscable, el comando de búsqueda y una duración
  positiva. Una duración desconocida ya no transforma un avance en un salto a cero.
  Se limita el destino al inicio/final del medio y se lee la posición de Media3.
- No se cambian el servidor local con rangos HTTP, las descargas ni los archivos guardados.

Referencias oficiales:
- https://developer.android.com/media/media3/exoplayer/troubleshooting#why-is-seeking-in-my-video-slow
- https://developer.android.com/media/media3/exoplayer/troubleshooting#why-do-some-mpeg-ts-files-fail-to-play

## Pruebas

`PlaybackSeekTest` comprueba avance/retroceso, límites, duración desconocida y medios
no buscables sin cambiar el estado play/pause.
`PlaybackTsSeekTest` usa un TS sintético H.264/AAC sin AUDs y comprueba muestras de
video/audio y keyframes después de saltos hacia adelante, atrás y adelante nuevamente.
Esto valida extracción, no la salida de un decodificador hardware Android.

El recurso `player/no-aud.ts.base64` contiene seis segundos de video azul 32×32 a
2 fps y un tono de 440 Hz. Se generó con FFmpeg/libx264/AAC (GOP de 2, sin B-frames).
Los NAL de tipo 9 añadidos por el muxer TS se sustituyeron por tipo 12 conservando
los tamaños PES/TS. FFmpeg decodifica sus 12 fotogramas; no contiene material externo.

Validación local: `npm run build` y `git diff --check` correctos. Las pruebas Android
se ejecutan en CI; el entorno local no tiene SDK Android/JDK 21. `cargo check` y
`cargo test` no disponibles por falta de cargo; no se modifica Rust.

Pendiente verificar en dispositivo el archivo afectado: saltos repetidos ±10 s,
arrastre de barra, salto estando pausado, final del archivo, TS/MP4 locales y HLS
en línea. Si persiste, registrar formato/códec, proveedor SAF y logcat de Media3/
MediaCodec para distinguir un índice defectuoso de un fallo del decodificador.
