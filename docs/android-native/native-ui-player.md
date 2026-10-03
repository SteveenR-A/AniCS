# Interfaz y reproductor nativos — 2026-10-02

La referencia visual es AniCS móvil en Tauri con Rosé Pine. Los cambios se concentran en Kotlin y la fachada UniFFI; no se modifican páginas de escritorio ni el reproductor Tauri en este trabajo.

## Interfaz

- Encabezado AniCS común con icono, fuente activa, Favoritos y Ajustes. Navegación inferior: Inicio, Buscar, Horarios, Top, Descargas e Historial. Se usan los vectores de Lucide del frontend, con su licencia conservada.
- Rosé Pine es el tema inicial de instalaciones sin tema guardado. Los temas elegidos/importados se conservan. Tarjetas con bordes, títulos limitados, selector de temas con muestras y secciones que se adaptan al ancho y al tamaño de texto.
- Ajustes elimina el desplazamiento horizontal anidado sobre las tarjetas que contenían otros elementos desplazables. Sus acciones persisten inmediatamente; muestra ese comportamiento sin un botón Guardar global redundante. Permite agregar fuentes con formatos compatibles, además de editar las existentes.
- Buscar integra filtros en la lista desplazable, accesos rápidos, teclado de búsqueda, búsquedas recientes persistentes y estados vacíos con acciones. Las opciones dependen de las capacidades del extractor.
- Horarios y Top llaman al núcleo Rust. UniFFI añade get_top, se regenera Kotlin y se reconstruyen ARM64/x86_64. Se muestran estados vacíos cuando una fuente no ofrece resultados.
- Historial por perfil, agrupado por anime, con reanudación, búsqueda y borrado confirmado que conserva videos. Descargas agrupadas por anime, episodios desplegables, tamaño de videos y almacenamiento real. Las portadas offline proceden de favoritos/historial locales cuando existen; de lo contrario se muestra un icono.
- El escaneo distingue videos detectados de filas nuevas: repetirlo mantiene el número de archivos existentes y no duplica la biblioteca.

## Reproductor

La sesión mantiene juntos anime, perfil, episodio, lista de episodios, servidores y medio resuelto. La resolución cancelable de otro episodio no mezcla sus servidores con el anterior si falla.

- Cambio de servidor dentro del reproductor, conservando posición y estado de pausa. Cambio de calidad manteniendo el tiempo; velocidad y audio.
- Reanudación automática desde SQLite, por perfil/URL y con fallback al título/episodio canónico. El seek fraccional espera una duración disponible. Los episodios completados (90% o más) comienzan desde el principio.
- Anterior, siguiente y selección de episodios; avance automático al terminar, configurable también dentro del reproductor. Funciona online y con episodios locales de la misma serie. Si no hay otro episodio, informa al usuario.
- Progreso cada 10 segundos, al cambiar medio, al salir y al pasar a segundo plano. Al volver del fondo, reanuda si antes estaba reproduciendo. Al cambiar de episodio o salir se reinicia el medio anterior.
- Controles adaptativos vertical/horizontal, slider fino con seek al soltar, botones ±10 s, intro +85 s, bloqueo de controles, modo de imagen y cambio de orientación. Ocultación automática del HUD; un toque sobre el video alterna el HUD y doble toque aplica pausa/seek según la zona.
- Pantalla encendida y barras del sistema ocultas mientras se reproduce; se restauran al salir. Errores visibles con reintento/selección de servidor.

## Validación y límites

Se validan 24 pruebas nativas: 13 contratos/streaming/actualizador existentes, 8 pruebas de sesión y 3 pruebas Compose con Robolectric. Estas últimas recorren Ajustes en un teléfono de 360 dp, cambian tema, prueban texto ampliado y accionan servidores/episodios/siguiente en horizontal. Las capturas de los composables reales se generan en app/build/ui-preview y se revisan visualmente. Robolectric no sustituye la prueba de un stream real en un teléfono.

También pasan npm run build, 198 pruebas frontend, cargo check Tauri y 4 pruebas FFI. cargo test --lib de Tauri mantiene el fallo previo test_secure_store_roundtrip del keyring: 38 pasan, 1 falla.

Google continúa desactivado. No se implementan casting, HLS descargable ni nuevos proveedores de catálogo; no se publican releases ni se hace git push. El APK usa la versión actual del proyecto; este archivo documenta una compilación de desarrollo local.

## APK verificado

- Archivo: `android-native/app/build/outputs/apk/debug/AniCS-native.apk`.
- Versión: `0.3.1-preview`, código `3001`, paquete `com.anics.app.preview.debug`.
- Android mínimo: 8.0 (API 26). ABI: ARM64 y x86_64.
- Tamaño: 35 059 652 bytes.
- SHA-256 del APK: `8A81D522A2B4D083B7CF5D0C1BC0564E95F3F10046FB08304AE49DC4EC19EE57`.
- SHA-256 del certificado de desarrollo: `f56ae8fef2bd93341026095f6147b0ef9d603ae157d8b98fd17e0fc2e4ddefcb`.
- `apksigner verify` valida la firma. Las bibliotecas Rust empaquetadas coinciden con las reconstruidas para ambas ABI; JNA también está incluida.
