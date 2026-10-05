# Ajustes de interfaz, perfiles y descargas nativas

Los cambios afectan exclusivamente a `android-native`. No se cambia la versión de escritorio ni se publica un release.

- Ficha del anime compacta: portada de 88 dp, géneros junto al título y descarga por lote cuando hay varios episodios.
- Descargas: se retira el botón de importación de `anics.db` y el texto técnico. La detección automática de metadatos existentes continúa. Las barras de almacenamiento y descarga no dibujan el punto final de Material 3.
- Ajustes: arquitectura nativa, ABI del dispositivo y licencia GPL v3 con acceso al archivo del repositorio.
- Perfil activo: edición de nombre, cuatro avatares predefinidos, selección de foto y exportación PNG. Las fotos se recortan al centro y reducen a 256 × 256; se guardan como PNG en una URL de datos portable para los respaldos y el contrato de sincronización existente.
- Descargas HLS: los servidores ya reconocidos por el resolver (incluidos Magi, Desu y Asura cuando proporcionen un stream compatible) pueden descargar listas finitas con segmentos completos, AES-128 y fMP4 con inicialización única. Los streams TS se guardan como `.ts`; fMP4, como `.mp4`. Los servidores MP4 conservan la descarga HTTP por rangos.
- El resolver comprueba las listas HLS durante la selección automática para poder continuar al siguiente servidor cuando el formato no sea compatible.

## Límites del soporte HLS

Se rechazan transmisiones en vivo, audio en listas separadas, DRM / SAMPLE-AES, segmentos por rangos, discontinuidades e inicializaciones múltiples. No se añade ningún resolver para hosts bloqueados por `ServerSupport`. Al reanudar HLS se reinicia el archivo desde el primer segmento; las descargas MP4 mantienen su reanudación por bytes. No se ha probado un episodio real de Magi en un dispositivo Android.

## Verificación

- `npm run build`: correcto.
- `npm test`: 198 pruebas correctas.
- Parser HLS compilado con Kotlin/JVM y ejecutado con JUnit: 4 pruebas correctas (variantes, rutas, AES / IV y fMP4; rechazo de formatos no compatibles).
- Se incorporan pruebas Robolectric de exportación PNG, transporte de la foto como URL de datos y descarga HTTP de HLS cifrado con verificación del archivo final. Su ejecución queda pendiente de la resolución de dependencias Android.
- `git diff --check`: correcto.
- Gradle Android: intentado con JDK 21, SDK 34 y Gradle 8.10.2; bloqueado al resolver `com.android.application:8.7.0` por el acceso a los repositorios de dependencias. La compilación Kotlin y las pruebas Android completas quedan pendientes.
- `cargo check` / `cargo test`: no ejecutables en este entorno porque Cargo no está instalado. No se modificó código Rust.
