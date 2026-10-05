# Ficha de anime nativa: diseño y metadatos

La ficha Kotlin toma como referencia la jerarquía de Android Tauri: portada y título,
etiquetas de tipo y estado, géneros, acciones principales, tarjeta de sinopsis y episodios.
El fondo y los botones usan los colores del tema seleccionado.

- `DetailsScreen` pasa `NativeAnimeDetails.animeType`, `status` y `genres` a la cabecera.
  Año y proveedor permanecen como metadatos secundarios. No se asignan los géneros del
  directorio de búsqueda a un anime: se usan exclusivamente los de su ficha.
- Los géneros ocupan todo el ancho debajo de la portada, se ajustan en varias filas y
  eliminan espacios, entradas vacías y duplicados sin cambiar los nombres de la fuente.
  Si no hay géneros, se indica que la fuente no los proporciona.
- Tipo y estado se muestran cuando tienen contenido. Se conserva el texto del catálogo
  (por ejemplo, Serie, Película, OVA, En emisión, Finalizado o Concluido).
  Los estados de emisión reconocidos tienen un punto verde con contraste para temas claros/oscuros.
- Reproducir/reanudar, guardar y lotes comparten la zona de acciones. En pantallas pequeñas
  o con letra grande se usan dos filas. Sin episodios se deshabilitan reproducción/lotes;
  guardar sigue disponible. Un único episodio también permite abrir el selector de descargas.
- La sinopsis muestra hasta siete líneas y ofrece expandir/contraer cuando el texto realmente
  desborda, en lugar de depender del número de caracteres. El estado se reinicia al cambiar de texto.
- Se conservan selección/copia del título, visor de portada con zoom, progreso, descargas,
  selector de servidores y vistas de episodios. Los cambios están aislados al módulo nativo.

## Validación

- `npm run build`: correcto, con avisos existentes de chunks/importaciones.
- `npm test`: 25 archivos, 198 pruebas correctas.
- `git diff --check`: correcto.
- Se amplían las pruebas Compose/Robolectric de cabecera y se añade `AnimeDetailContentTest`
  para géneros, tipo/estado, acciones, ausencia de episodios y expansión de sinopsis.
- No se ha ejecutado Kotlin localmente: no hay SDK Android/JDK 21 y el wrapper Gradle
  no pudo descargar su distribución mediante la conexión Java de este entorno.
  El workflow `Android Native CI & Preview Build` ejecuta `testDebugUnitTest` y genera el APK en la PR.
- `cargo check` y `cargo test` no pudieron ejecutarse: `cargo` no está instalado.
  Esta propuesta no modifica Rust, UniFFI ni los extractores.

Pendiente validación visual en teléfono con tema Rosé Pine/claro, varios géneros,
títulos largos, escala de texto grande, reproducción y lote de un episodio.
