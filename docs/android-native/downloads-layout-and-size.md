# Descargas: interfaz compacta y tamaño del episodio

## Interfaz Kotlin

- El selector Anime/Donghua se mantiene en el centro real de la cabecera usando dos
  espacios laterales del mismo ancho. Conserva selección de proveedor, favoritos y ajustes.
- Descargas ofrece un menú **Opciones** con Carpeta, Buscar videos y Actualizar almacenamiento.
  Carpeta y búsqueda se deshabilitan durante el escaneo; Buscar videos requiere una carpeta.
- El resumen de almacenamiento conserva espacio libre/total y bytes de biblioteca en una
  tarjeta compacta. Las tarjetas de anime ocultan Ver en línea hasta expandirse.
- Se mantienen biblioteca/cola, selección SAF, reproducción local y controles de descargas.

## Tamaños y progreso

Los archivos HTTP directos usan Content-Length o el total validado de Content-Range al reanudar.
Cuando una respuesta 200 carece de tamaño, se consulta una sola vez `Range: bytes=0-0` sobre
su URL final, con Referer, User-Agent y `Accept-Encoding: identity`. Se limita la espera de
conexión/lectura a 5 segundos cada una y se cierran las conexiones también al pausar/cancelar.
Si el servidor ignora el rango, solo se leen sus cabeceras, sin descargar otra copia del video.
El fallo de esta consulta no cancela la transferencia principal.

En HLS, la duración de `EXTINF` pondera el progreso por fragmentos. Si faltan duraciones
válidas se usa su número. El tamaño aproximado se calcula a partir de los bytes escritos
y el avance, y se muestra con **≈ … (estimado)** en la cola y las notificaciones.
La estimación cambia con el bitrate de los fragmentos; no es un tamaño exacto anunciado por el servidor.
Al completar y validar el archivo se guarda su tamaño real.

Las estimaciones nunca se almacenan en `totalBytes` ni se usan para validar integridad.
Sin tamaño HTTP confirmado o progreso HLS suficiente se indica **Total no disponible**
y la barra permanece indeterminada. No se cambia el esquema de Room ni Rust/UniFFI.

## Historial: abrir el anime en línea

`HistoryEntity` ya guarda `animeUrl`, `episodeUrl` y `source`. La acción **Ver anime en línea**
abre la ficha usando la URL del anime y la fuente guardadas, sin iniciar reproducción.
En grupos de episodios se elige el registro en línea más reciente, aunque el último visto
sea un archivo local. No se usa la URL del episodio como sustituto de la del anime.
Si únicamente hay URLs locales, vacías o inválidas, **Buscar anime en línea** abre Buscar
con el título precargado y codificado con `Uri.encode` (incluidos espacios, `/` y `&`).
El filtro local del historial, Reanudar y la lista de episodios conservan su funcionamiento.
`HistoryAnimeActionTest` cubre enlace/fuente, último episodio local y búsqueda sin URL válida.

## Validación

- `npm run build`: correcto, con avisos existentes de imports/chunks.
- `npm test`: 198 pruebas correctas en 25 archivos.
- Kotlin 2.0.21 en JVM 17: compilación de `DownloadSizes.kt`/`HlsPlaylist.kt` y 11 pruebas JUnit
  correctas (`DownloadSizesTest`, `DownloadSizeProbeTest`, `HlsPlaylistTest`). Incluyen peticiones
  HTTP contra un servidor local, tamaños exactos/estimados, rangos inválidos y conservación de Referer.
- Se añaden pruebas Compose/Robolectric para cabecera centrada, menú y barra de progreso;
  una prueba con Room verifica que el total HTTP aparece antes del primer byte del video.
  Se amplían las notificaciones para tamaños HLS y archivos de tamaño desconocido.
- `git diff --check`: correcto. Las pruebas Android completas y el APK quedan a cargo de CI:
  este entorno local no dispone de SDK Android/JDK 21. Rust no se pudo comprobar porque falta `cargo`;
  no hay cambios de Rust en esta propuesta.

Pendiente revisión en dispositivo: teléfonos pequeños/letra grande, tema claro y Rosé Pine,
carpeta SAF, escaneo, descargas directas/HLS y pausa/reanudación durante consulta de tamaño.
