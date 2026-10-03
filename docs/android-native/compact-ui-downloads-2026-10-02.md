# Ajustes de interfaz y descargas nativas

Estos cambios se limitan a `android-native`; no modifican las pantallas de PC ni el descargador Rust de Tauri.

## Interfaz y fuentes

- Tipografía, cabecera, tarjetas, pestañas y paneles más compactos. Se mantiene la escala de texto del sistema.
- Inicio usa el selector de fuente de la cabecera. Buscar usa solamente las pestañas junto a los filtros.
- El reproductor distribuye sus controles inferiores en varias filas en vertical. El panel de opciones tiene ancho limitado y desplazamiento vertical, incluso con el teléfono horizontal.
- Las entradas repetidas del catálogo se depuran antes de construir las listas. MundoDonghua puede devolver tarjetas repetidas porque el selector incluye contenedores anidados; esas entradas podían generar claves repetidas en Compose. También se depuran horarios, ranking y episodios.
- Los servidores admitidos aparecen primero y con color de acento. Los no compatibles quedan ocultos por defecto, con un interruptor para verlos desactivados. La selección automática excluye los proveedores que la política Rust ya considera no fiables.
- Top presenta un mensaje explicativo al seleccionar una fuente sin ranking real. No presenta novedades o un directorio como ranking.
- Buscar ofrece páginas numeradas, anterior/siguiente y conserva «Cargar más». Los totales proceden del proveedor: cuando no informa un total, solo se conoce la página siguiente.

## Descargas y biblioteca

- Límite persistente de 1–4 transferencias simultáneas; preferencias independientes de servidor para reproducción y descarga.
- Cola con botones por episodio y lotes por rango o temporada. Los episodios existentes se omiten incluso si conservan nombres de carpeta diferentes.
- Progreso, bytes y velocidad; notificación con pausa, reanudación y cancelación. En Android 13 o superior se solicita permiso de notificaciones al iniciar la primera descarga. Tocar la notificación abre Descargas.
- Reanudación HTTP con validación de `Content-Range`, del tamaño final y de la respuesta. Si el servidor ignora Range, se reinicia el archivo sin concatenar datos repetidos.
- Los videos compartidos se detectan mediante el permiso de carpeta de Android. Una copia exportada de `anics.db` permite importar títulos, enlaces y portadas de Tauri sin modificar la base original. No concede acceso a la base privada de otra app ni importa por sí sola todos sus perfiles/historial: para esos datos se mantiene Importar respaldo en Ajustes.
- Las portadas locales `poster.jpg`, `cover.jpg`, `cover.png`, `folder.jpg` o `thumbnail.jpg` se reconocen en la carpeta del anime; también se usan las URL de los metadatos importados. La caché privada de imágenes de Tauri no puede compartirse automáticamente entre paquetes Android.
- Se puede abrir la ficha del anime desde Descargas; si falta el enlace, se busca por título. El reproductor conserva la pantalla de origen en la navegación.
- Quitar de la biblioteca conserva el video. Borrar el archivo requiere elegir explícitamente esa acción en el diálogo.
- Coil conserva solamente imágenes solicitadas, con caché de disco configurable de 100 MB a 1 GB. Cambiar el límite se aplica al reiniciar la app.

## Calidad y límites

La calidad se aplica a variantes proporcionadas por el servidor y a pistas adaptativas HLS de Media3. Un MP4 de resolución única no puede transformarse en 720p/1080p mediante una preferencia; el reproductor no muestra opciones inexistentes. Las descargas nativas continúan limitadas a MP4: empaquetar HLS descargado sigue pendiente.

Google/Auth permanece desactivado en esta preview. La comprobación y descarga de actualizaciones desde GitHub ya existe; requiere publicar el APK nativo correcto y mantener su firma.

## Validación

- `testDebugUnitTest` y `assembleDebug`: 31 pruebas Android, incluyendo controles en 320×640 y 800×360, texto ampliado, cola con servidor HTTP local, reanudación byte a byte, migración Room, importación de SQLite y acciones de notificación.
- Capturas verificadas en `android-native/app/build/ui-preview/`.
- Frontend: `npm run build` y 198 pruebas.
- Rust: `cargo check --offline` y `cargo test --offline`: 66 pruebas (39 de biblioteca y 27 de integración). El test del gestor de credenciales requiere ejecutarse fuera del sandbox; allí pasa.

No se contó con ADB ni con una traza del cierre de Donghua en el teléfono. Se corrigió la causa posible de claves duplicadas y se probó la depuración, pero la desaparición del cierre real requiere comprobar este APK en el dispositivo. Los hallazgos de la revisión previa del motor Rust no quedan resueltos por estos cambios de Kotlin.
