# Correcciones de descargas, reproducción local y navegación

Base: `SteveenR-A/AniCS`, `main`, commit `fe5f5420945548a380a0541a868aaf7cb5386229` (v0.3.7).
Rama local: `fix/android-download-integrity-player-state`.

Los cambios pertenecen a `android-native` y al puente de metadatos de Tauri,
que solo se utiliza en Android. No se cambia el reproductor ni el almacenamiento
de escritorio. No se publica una versión nueva.

## Causas y cambios

| Problema | Hallazgo en el código | Corrección |
| --- | --- | --- |
| Descarga completada con archivo ausente, vacío o inaccesible | `mkdirs()` no se verificaba. La finalización comprobaba bytes recibidos y tamaño HTTP, pero no volvía a abrir el archivo guardado. También podían quedar registros antiguos de archivos eliminados o permisos SAF revocados. | Comprobar directorios y permisos antes de escribir; después de cerrar el escritor, comprobar existencia, tamaño real, lectura y coincidencia con bytes recibidos. Aplicar lo mismo a HTTP 416. Revalidar la biblioteca al entrar; los registros inválidos pasan a fallidos con mensaje y se pueden reintentar. |
| Carpeta esperada no aparece en el almacenamiento público | La ruta predeterminada intentaba `Environment.getExternalStorageDirectory()/Anime` si `canWrite()` devolvía verdadero y, en otros casos, usaba archivos de la app. Esa comprobación no garantiza acceso bajo scoped storage. | Usar SAF para la carpeta que el usuario elija; sin selección, usar `getExternalFilesDir(DIRECTORY_MOVIES)/Anime`, con alternativa en `filesDir/Anime`. Para guardar en **Almacenamiento interno/Anime**, seleccionarla con **Descargas → Carpeta**. |
| Exportación repetida al abrir | El puente de Tauri reescribía `.nomedia`, copiaba todas las portadas y reemplazaba `library.json` en cada escaneo. Kotlin también reescribía su caché y reimportaba una copia compartida de `anics.db`. | Indicador persistente `.anics/.export-version`, comparación del contenido antes de copiar/escribir y reparación de archivos ausentes. Registrar éxito después de terminar. En Kotlin, evitar escrituras idénticas y recordar versión, URI, tamaño y fecha de las importaciones automáticas. |
| Panel de episodios cortado en horizontal | Solo se limitaba la altura de la lista, sin incluir título y espacio de navegación en el límite. | Limitar la altura del contenido completo; dar a la lista el espacio restante y desplazamiento. Al abrir, enfocar el episodio actual. Añadir prueba de la última fila en una ventana horizontal. |
| Progreso y estado de visualización | La cola ya tenía actualizaciones Room cada 500 ms; la biblioteca descargada no observaba el historial del perfil. | Mantener barra, porcentaje, bytes y velocidad. Mostrar barra indeterminada cuando no hay total. Observar el perfil activo y el historial persistido para mostrar **Sin ver**, **En progreso** y **Visto**, con barra por episodio. Mantener el estado visto durante una repetición y al cambiar entre URL en línea y URI local. |
| Animes contraídos al volver | La expansión estaba en `remember` dentro de cada elemento de la lista y desaparecía al salir de composición. Además, la pantalla repetía un escaneo al volver. | Guardar claves de expansión y pestaña en `SavedStateHandle` del destino de navegación; restaurarlas al volver o recrear la pantalla. Evitar el escaneo redundante y validar los archivos al regresar. |

El historial conserva el criterio existente: un episodio se considera visto al
alcanzar el 90 %. Los estados son independientes por perfil y se almacenan en
Room, no solo en la interfaz.

La corrección impide que una consulta tardía de portadas vuelva a insertar una
fila que ya se marcó fallida. Los errores de preparación del destino también
se guardan como filas fallidas para que sean visibles en la cola. Reintentar una
fila sin destino conserva los datos originales del anime y del episodio.

Las capturas originales no incluyen la ruta/URI ni los registros de Android;
por tanto, no prueban una causa única del archivo concreto. No encontré una
exportación de videos en el arranque de Kotlin: la exportación identificada es
de **portadas y metadatos** en el puente Tauri. Interpreté el punto 5 como
animes **contraídos** al volver, de acuerdo con las capturas y la implementación.

## Archivos de implementación

Rutas relativas a `android-native/app/src/main/java/com/anics/nativeapp/`:

- `downloads/StorageManager.kt`: destinos comprobados, SAF, tamaño real y lectura.
- `downloads/DownloadManager.kt`: finalización verificada, errores de preparación y recreación de destinos.
- `downloads/LocalLibrary.kt`: comprobación de registros completados y recuperación después de restaurar acceso.
- `downloads/TauriLibraryMetadata.kt`: importaciones automáticas y escrituras idempotentes.
- `downloads/EpisodeWatchProgress.kt`: claves, estados y fracciones de visualización.
- `data/local/DownloadEntity.kt`: actualizaciones condicionales de error y metadatos sin migración de esquema.
- `data/repository/HistoryRepository.kt`: conservar visto al volver a reproducir y consolidar el episodio al cambiar su URL.
- `ui/viewmodels/DownloadsViewModel.kt`: estado guardado de navegación e historial por perfil.
- `ui/screens/DownloadsScreen.kt`: estados, barras e indicación de episodios con errores.
- `player/PlaybackSession.kt`: actualizar visto en la lista cuando se guarda progreso suficiente.
- `player/PlayerScreen.kt`: límite de altura y desplazamiento del panel completo.
- `MainActivity.kt`: validación del archivo local, historial de episodios y conexión con `SavedStateHandle`.

Además:

- `src-tauri/src/commands/library_bridge.rs`: exportación idempotente y prueba de reparación/versionado.
- Esta documentación.

Pruebas nuevas o ampliadas en `android-native/app/src/test/java/com/anics/nativeapp/`:
`DownloadIntegrityTest.kt`, `DownloadQueueTest.kt`, `EpisodeWatchProgressTest.kt`,
`DownloadsNavigationStateTest.kt`, `LibraryMigrationTest.kt` y `NativeUiRegressionTest.kt`.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcta; advertencias existentes de tamaño de bundles e imports dinámicos. |
| `npm test` | 198 pruebas correctas en 25 archivos. |
| Compilación Kotlin de aplicación y pruebas con JDK 21, Gradle 8.10.2 y SDK 34 | Correcta. |
| `testDebugUnitTest` | 61 pruebas correctas; cero fallos, errores u omisiones. |
| Pruebas del puente Rust en un harness aislado | 3 pruebas correctas. El harness compila directamente `library_bridge.rs` y los modelos puros del repositorio, sin enlazar Tauri/GTK. |
| `cargo check` y `cargo test` del proyecto Tauri | Bloqueados por ausencia de `pkg-config` y dependencias GLib/GTK del entorno Linux; no se presentan como correctos. |
| `rustfmt --check` sobre el puente y `git diff --check` | Correctos. |

La primera ejecución de Robolectric falló al descargar su runtime; al configurar
la conexión del entorno, la suite completa terminó correctamente. Las pruebas
de interfaz incluyen una captura del panel horizontal generada por Robolectric.
No se ha ejecutado la app en un teléfono ni contra los servidores reales de anime;
la descarga de prueba usa un servidor HTTP local y archivos de prueba.

## Aplicar el parche

Desde una copia limpia del repositorio basada en el commit indicado:

```bash
git switch -c fix/android-download-integrity-player-state
git apply --check AniCS-correcciones-android.patch
git apply AniCS-correcciones-android.patch
```

Si ya existen cambios propios o una base posterior, resolver los conflictos
antes de compilar. El paquete contiene el parche y este informe; las capturas
de prueba, cuando se generen, se identifican como capturas de Robolectric.

## Comprobar en un teléfono

1. Elegir `Anime` con SAF y descargar un episodio. Verificar carpeta, tamaño real y reproducción.
2. Probar también sin carpeta elegida y comprobar el destino de la aplicación.
3. Interrumpir una descarga y reanudarla; no debe marcarse completada con tamaño parcial.
4. Borrar el archivo de un episodio completado y volver a Descargas. Debe aparecer el error en Cola; reintentar debe recrear el destino.
5. Revocar el permiso SAF y comprobar el mensaje; volver a concederlo y buscar videos para recuperar los archivos completos existentes.
6. Abrir el panel de episodios en horizontal y desplazarse hasta el último episodio.
7. Expandir dos animes, reproducir un episodio y volver: ambos deben seguir desplegados.
8. Reproducir parcialmente y terminar un episodio; comprobar los tres estados y cambiar de perfil para verificar su independencia.
9. Abrir dos veces sin cambios: conservar fechas de portadas/manifiesto. Borrar una portada o el manifiesto y abrir otra vez: deben repararse.
