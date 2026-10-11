# Descargas, perfiles y portadas en escritorio

Cambios locales del 10 de octubre de 2026.

## Descargas visibles

El escritorio muestra una tarjeta flotante con círculo de progreso, porcentaje,
velocidad y episodios en cola. Las tareas en cola usan un círculo indeterminado;
las pausadas siguen accesibles. La tarjeta abre la página de Descargas.

Los avisos dentro de la app indican inicio, finalización y errores. Los inicios
de lote se agrupan durante 300 ms. Los avisos del sistema requieren el permiso
de notificaciones; los de finalización existentes se conservan sin duplicarlos.

En la ficha del anime, terminar una descarga vuelve a consultar los archivos y
muestra **Descargado**. Al recuperar el foco se vuelve a comprobar el disco.
Las respuestas obsoletas se descartan al cambiar de anime o salir de la ficha.
La coincidencia tolera diferencias de guiones y espacios como `Seito-kai` /
`Seitokai`, conserva títulos japoneses y chinos y separa las temporadas.

## Perfiles

El botón de perfil de la barra lateral y la sección de perfiles en Ajustes abren el administrador de escritorio.
Permite editar perfiles existentes, crear y cambiar perfiles, cargar fotos y
exportar el avatar como PNG. Las fotos se recortan al centro a 256 × 256 píxeles,
con el mismo formato `data:image/png;base64,...` usado por Kotlin.

Se conserva el identificador del perfil al editarlo. La vista muestra perfil
activo/disponible, perfil principal, fecha de creación y estadísticas de animes,
episodios y horas. Los fallos de guardado dejan el editor abierto para reintentar.

La exportación Tauri usa el diálogo nativo y escribe únicamente en la ruta que
el usuario selecciona. La capacidad `desktop-profile-images` habilita ese comando
en escritorio; no añade un permiso general para escribir en cualquier carpeta.

## Portadas en Linux

El guardado anterior suponía que el resultado de la caché de RAM siempre tenía
un archivo equivalente en la caché de disco. Ahora guarda los bytes devueltos,
detecta el formato por su contenido y publica el archivo mediante renombrado.
Una portada reparada reemplaza los formatos anteriores del mismo título y se
rechazan respuestas HTML o base64 inválido.

Las portadas locales en Linux se devuelven como Data URI para evitar depender
de la ruta `asset:` del WebView. La ruta de descarga de los videos y el servidor
HTTP con soporte de rangos se conservan.

## Reproducción en Linux

Hyprland mantiene la configuración previa de aceleración de la interfaz y usa
por defecto los sinks de video compatibles mediante
`WEBKIT_GST_DMABUF_SINK_DISABLED=1` y `WEBKIT_GST_DISABLE_GL_SINK=1`. Los valores
definidos explícitamente por el usuario no se sobrescriben. Este código solo se
compila en Linux y se aplica antes de inicializar GTK/WebKit.

Es una mitigación basada en las rutas de renderizado de WebKit y sus incidencias
de video en NVIDIA/Wayland, no una causa reproducida en la GPU del usuario.
Referencias primarias: [incidencia de WebKit](https://bugs.webkit.org/show_bug.cgi?id=260654)
y [implementación del sink GL](https://chromium.googlesource.com/external/github.com/WebKit/webkit/+/a8823543d6bf29ae58b360b33d1f86d6267a10e2/Source/WebCore/platform/graphics/gstreamer/MediaPlayerPrivateGStreamer.cpp).

El reproductor limita a dos intentos la recuperación de errores fatales de
decodificación HLS. Si no puede recuperarse, cambia de servidor o muestra un
error con opción de reintentar para archivos locales, en lugar de esperar un
servidor alternativo inexistente.

### Diagnóstico posterior del fallo persistente

La comprobación en el equipo encontró GStreamer 1.28.8 y `gst-libav`, pero no
`gst-plugins-good` ni `gst-plugins-base`. `gst-inspect-1.0 qtdemux` y
`gst-inspect-1.0 aacparse` fallaron; un MP4 sintético tampoco pudo iniciar su
pipeline porque faltaba `qtdemux`. Este es un bloqueo comprobado independiente
de la mitigación gráfica. [GStreamer documenta que qtdemux pertenece a Good](https://gstreamer.freedesktop.org/documentation/isomp4/qtdemux.html).

El reproductor ahora consulta los parsers en Linux mediante un comando Rust
ejecutado fuera del hilo GTK. Muestra los componentes ausentes y el comando de
instalación en lugar de ocultar el diagnóstico al cambiar de servidor. Android
y Windows no realizan estas comprobaciones. Si falta `gst-inspect-1.0`, no se
deduce que la reproducción esté rota por ausencia de la herramienta.

El instalador verifica contenedor, parsers y decodificadores antes de copiar la
app. La instalación manual requiere en este equipo:

```bash
sudo pacman -S --needed gst-plugins-base gst-plugins-good
```

No se pudo completar desde Codex porque `sudo` requiere la contraseña del
usuario. La instalación anterior en `~/.local/bin/anics` también es anterior a
los cambios; recompilar el código no reemplaza automáticamente ese ejecutable.

## Validación y límites

- Frontend: `npm run build` correcto y 237 pruebas aprobadas.
- Rust: `cargo check --offline --locked` correcto. Se aprobaron 85 pruebas entre
  suites unitarias e integración en la última ejecución completa. Los contratos
  de sincronización pasaron.
- Lint sin errores; persisten avisos anteriores.
- Se comprobó visualmente la lista y el editor de perfiles mediante una vista
  temporal con datos de ejemplo. La exportación de fotos y el recorte se cubren
  con pruebas; la descarga de la vista previa en navegador no pudo verificarse.
- Pendiente comprobar reproducción real y exportación con el diálogo nativo en
  la sesión Linux del usuario. No se probó Windows ni Android en un dispositivo.

Para ver estos cambios se necesita ejecutar el código actualizado o recompilar
la aplicación. La mitigación de WebKit requiere reiniciar el proceso; una recarga
del frontend no cambia las variables de entorno del backend.

Se generó un ejecutable de desarrollo actualizado mediante `cargo build
--offline --locked`, disponible en `src-tauri/target/debug/anics`. No se instaló
ni se inició sobre el perfil real del usuario, y no se publicaron cambios.

Después del diagnóstico se generó también el ejecutable release con el frontend
incluido mediante `npm run tauri -- build --no-bundle -- --offline --locked`, en
`src-tauri/target/release/anics`. Para reemplazar la instalación anterior, instala
primero las dependencias ausentes y ejecuta `npm run install:linux -- --no-build`
desde la raíz del proyecto. La reproducción real sigue pendiente de esa instalación.
