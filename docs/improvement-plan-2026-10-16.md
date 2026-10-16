# Plan de mejoras — 16 de octubre de 2026

Alcance: frontend React/Tauri de escritorio y móvil. Android nativo mantiene su
implementación independiente. No se cambian versiones, contratos cloud, rutas
de descargas, migraciones ni comandos Rust.

1. Distinguir errores de búsqueda de resultados vacíos, permitir reintentar la
   misma consulta y proteger el estado frente a respuestas obsoletas.
2. Mostrar estados accesibles de carga en las rutas cargadas bajo demanda.
3. Diferir portadas fuera del área visible y limitar la caché de imágenes por
   tamaño estimado y cantidad, conservando la deduplicación de peticiones.
4. Hacer accesibles las tarjetas de búsqueda, mejorar el foco y respetar la
   preferencia de movimiento reducido.
5. Recuperar errores de render por pantalla conservando navegación y almacenes.
6. Separar historial, favoritos y descargas por plataforma; extraer la interacción con la línea de
   tiempo y el control de pantalla activa del reproductor a hooks sin cambiar gestos ni atajos.
7. Empaquetar Inter y Outfit y sus licencias para eliminar la petición de fuentes
   externas durante el arranque.

Validación: pruebas de regresión de búsqueda, caché/carga diferida y recuperación;
suite frontend completa, build, lint, `cargo check --offline --locked`,
`cargo test --offline --locked` y `git diff --check`. Documentar restricciones del
entorno y no confundir pruebas de código con validación en Windows o teléfono.

Estado: implementado y validado en el entorno local.

## Resultado

- Búsqueda: error visible con reintento de filtros/página, conservación del último
  resultado válido e invalidación de fallos antiguos, incluso durante el debounce.
- Rutas: esqueletos de carga con estado accesible y recuperación de errores por
  pantalla. Cambiar parámetros de una pantalla sana conserva su montaje.
- Portadas: resolución IPC al acercarse al área visible; precarga inicial limitada
  a seis URLs únicas. Caché LRU de hasta 150 entradas y 8 MiB estimados para las
  cadenas UTF-16 de URL/base64. No es un límite de toda la RAM del WebView: los
  bitmaps decodificados quedan bajo control del navegador, sin retener objetos
  `Image` adicionales desde JavaScript.
- Accesibilidad: botones nativos en tarjetas de inicio/búsqueda y búsquedas
  recientes, nombres para controles, anuncios de resultados, foco visible,
  movimiento reducido y zoom habilitado en el viewport.
- Mantenimiento: seis pantallas independientes de biblioteca con imports
  diferidos y exports de compatibilidad; su lógica se conservó íntegra.
  Interacción con la línea de tiempo y bloqueo de pantalla extraídos a hooks.
- Fuentes: Inter y Outfit variables WOFF2 locales, con licencias y procedencia.

## Validación final

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 36 archivos, 272 pruebas correctas; 23 pruebas nuevas |
| `npm run build` | Correcto |
| `npm run lint` | Sin errores; 79 avisos pendientes |
| `cargo check --offline --locked` en `src-tauri` | Correcto |
| `cargo test --offline --locked` en `src-tauri` | 92 pruebas correctas |
| `git diff --check` | Correcto |
| Inspección de las seis pantallas extraídas | Sin cambios funcionales; espacios finales normalizados |
| Fuentes en el paquete `dist/fonts` | Ambas WOFF2 incluidas |
| Revisión visual en navegador | Búsqueda/reintento en diseños móvil y escritorio |

Las pruebas Rust que abren sockets se ejecutaron fuera del aislamiento. Se usó
`DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/anics-test-no-session-bus` para que la
prueba de credenciales no esperase el llavero interactivo; esta ejecución no
verifica la integración con el llavero nativo de Linux.

El navegador de desarrollo no dispone de comandos Tauri: permitió comprobar el
fallo de búsqueda y su presentación, mientras las pruebas automatizadas
verificaron respuestas satisfactorias, reintentos, teclado y respuestas fuera
de orden. No se comprobó una instalación Windows ni un dispositivo Android real.

El build mantiene una advertencia por tamaño del módulo del reproductor.
No se alteró la carga de Firebase ni el contrato Firestore v2. Los cambios quedan locales,
sin commit, push, actualización de versión ni publicación.
