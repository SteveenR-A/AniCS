# Revisión de las dos versiones móviles de AniCS

Fecha local: 2 de octubre de 2026. Código actual: 0.3.1 y cambios locales presentes al comenzar la revisión.

La versión Tauri tiene más funciones de biblioteca, descargas y mantenimiento. Kotlin ya ofrece la navegación principal, temas, historial por perfil, reproducción con servidores, reanudación y siguiente episodio. Hay defectos en ambas implementaciones que conviene resolver antes de ampliar la migración.

## Alcance y evidencia

Se revisaron las páginas móviles React, el reproductor compartido, los servicios/stores Tauri, el backend de almacenamiento/descargas, las pantallas/ViewModels Kotlin, Room, el reproductor Media3, respaldos y workflows de publicación. Las capturas suministradas se usan como referencia visual. No se probaron APKs en un teléfono ni se estableció una conexión real de reproducción, casting o Firestore.

Se ejecutaron estas comprobaciones sobre el código actual:

- `npm run build`: correcto, con avisos de imports dinámicos existentes.
- `npm test -- --run`: 25 archivos y 198 pruebas correctas.
- `cargo check` en `src-tauri`: correcto.
- `cargo test --lib` en `src-tauri`: 38 correctas y 1 fallo existente, `storage::secure_store::tests::test_secure_store_roundtrip`. El gestor de credenciales devuelve `None` tras escribir el secreto de prueba en este entorno Windows. No demuestra un cierre de Android.
- Pruebas nativas existentes: 24 correctas, incluidas las de Compose para Ajustes y controles.
- Auditoría adicional: dos pruebas temporales Kotlin/Room confirman cinco observaciones de datos/descargas; una prueba temporal Vitest confirma la carrera al cambiar episodios en Tauri. Estas pruebas afirman el comportamiento defectuoso actual para documentarlo; que pasen no significa que el defecto esté corregido.

Las pruebas temporales y el init script Gradle quedan en `android-native/app/build/parity-audit/`, fuera del código de producción. El XML de las pruebas Room está en `android-native/app/build/test-results/testDebugUnitTest/TEST-com.anics.nativeapp.ReviewDataRisksTest.xml`. No se cambiaron las implementaciones de las apps en esta revisión.

## Defectos que deben resolverse

P1 identifica pérdida de datos, reproducción equivocada o bloqueo de un flujo principal. P2 identifica funcionalidad incompleta o comportamiento incorrecto recuperable.

### 1. P1 — Kotlin: importar un respaldo puede eliminar historial antiguo

Reproducción con Room: guardar 1.501 episodios online, exportar y volver a importar ese mismo respaldo. El JSON contiene 1.501 entradas; después de restaurarlo quedan 1.500 y desaparece la más antigua. Los registros offline actuales se preservan en esta importación.

La fusión aplica el límite cloud y la aplicación local vacía la tabla antes de insertar el resultado. Tauri aplica el resultado mediante upserts y no necesita borrar todo el historial local para respetar el límite de subida.

Resolver separando la representación limitada para cloud de la restauración/fusión local sin recorte. Agregar una regresión de ida y vuelta con más de 1.500 entradas.

Evidencia: [límite de fusión](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncModels.kt:117), [reemplazo de tablas](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncRepository.kt:66), [aplicación Tauri por upsert](C:/dev/AniCS/src/stores/useSyncStore.ts:767).

### 2. P1 — Tauri: una respuesta tardía puede reproducir el episodio equivocado

Reproducción en el reproductor con layout móvil: seleccionar episodio 2, seleccionar episodio 3 antes de que termine la petición anterior, resolver primero los servidores de 3 y después los de 2. El título/estado conserva episodio 3, pero `resolvedMedia` termina apuntando al video de 2.

La carga inicial desde URL valida un identificador de petición. El cambio desde la lista de episodios incrementa ese identificador, pero no lo captura ni comprueba tras `getServers`, y llama al resolver automático sin el identificador esperado. Puede afectar también al cambio automático si coincide con otra selección.

Resolver protegiendo todos los resultados y bloques `finally` con la identidad de la operación y del episodio, incluidas las ramas locales. Mantener la prueba de respuestas fuera de orden como regresión.

Evidencia: [cambio de episodio](C:/dev/AniCS/src/pages/PlayerPage.tsx:975), [resultado sin validación](C:/dev/AniCS/src/pages/PlayerPage.tsx:1024), [identificador opcional del resolver](C:/dev/AniCS/src/pages/PlayerPage.tsx:492).

### 3. P1 — Kotlin: descargas interrumpidas pueden quedar bloqueadas al reiniciar

El estado `downloading` se guarda en Room, mientras que los trabajos activos viven en memoria. Si Android termina el proceso sin ejecutar la limpieza, la nueva instancia no reconstruye esos trabajos ni normaliza sus estados. La pantalla ofrece Pausar para `downloading`; `pauseDownload` solo cancela un trabajo si existe y no cambia por sí misma la fila persistida.

Prueba Room: crear una fila `downloading`, crear un gestor nuevo y pulsar su acción de pausa. La fila sigue siendo `downloading`. No aparece la acción de reanudación reservada para `paused`/`failed`.

Resolver reconciliando trabajos y estados al iniciar el servicio/app; convertir trabajos interrumpidos en pausados o restaurar la cola. Una pausa sin trabajo activo también debe persistir el estado. Conservar los bytes ya escritos.

Evidencia: [trabajos en memoria](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/downloads/DownloadManager.kt:18), [pausa](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/downloads/DownloadManager.kt:189), [acciones según estado](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/ui/screens/DownloadsScreen.kt:114), [inicio del servicio](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/downloads/DownloadService.kt:42).

### 4. P1 condicionado — Ambas: falta cerrar la continuidad de firma para actualizaciones

El actualizador Kotlin comprueba paquete, código de versión y firma, lo cual es correcto. El APK local entregado es `com.anics.app.preview.debug`; el release usa `com.anics.app.preview`. Un release no puede actualizar esa instalación debug aunque el número de versión sea superior.

En CI nativo, si falta la clave configurada se publica un APK debug con la clave del runner. En Tauri, el fallback genera una clave nueva en cada ejecución; reutilizar alias/contraseña no reutiliza el certificado. Esas rutas no garantizan actualizaciones sobre instalaciones anteriores. No se consultaron secretos de GitHub: el riesgo de los fallbacks es condicional, no se afirma que falten secretos actualmente.

Resolver definiendo el paquete de distribución y una clave persistente para cada variante, verificando certificado/versionCode en CI y evitando publicar una variante fallback como si fuera la actualizable. La primera transición de debug a release requiere instalación separada y una transferencia de datos explícita.

Evidencia: [paquetes por variante](C:/dev/AniCS/android-native/app/build.gradle.kts:22), [validación del actualizador](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/updates/UpdateRepository.kt:86), [fallback nativo](C:/dev/AniCS/.github/workflows/android-native-ci.yml:90), [clave nueva Tauri](C:/dev/AniCS/.github/workflows/release.yml:265).

### 5. P2 — Migrar videos de carpeta no transfiere todo el progreso offline

Las dos versiones usan bases de datos separadas. Elegir y escanear la carpeta Tauri en Kotlin incorpora videos, pero no lee su SQLite. Los backups actuales de ambas versiones excluyen historial local por reutilizar la representación cloud. La prueba Room confirma que el progreso offline existente no aparece en el JSON exportado.

Esto preserva la exclusión de rutas locales de cloud, pero deja incompleta la transferencia que necesita el usuario. Incorporar una sección de respaldo local compatible y opcional, con identidad estable de serie/episodio y asociación a archivos al escanear. Mostrar claramente qué se importará y qué necesita volver a elegir permisos de carpeta.

Evidencia: [backup nativo usa sync](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/BackupManager.kt:6), [exclusión nativa](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncRepository.kt:39), [exclusión Tauri](C:/dev/AniCS/src/stores/useSyncStore.ts:865).

### 6. P2 — Kotlin: los ajustes de escritorio se pierden en una transferencia de ida y vuelta

Prueba: importar un payload con `settingsDesktop` y volver a exportar. Ese campo desaparece. La fusión lo calcula, pero el repositorio persiste únicamente el mapa activo; la exportación solo produce `settings`/`settingsMobile`.

Resolver conservando el mapa de la otra plataforma sin aplicarlo a Android. Esto importa incluso en modo local al transportar respaldos entre PC y móvil.

Evidencia: [exportación](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncRepository.kt:53), [persistencia de ajustes](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncRepository.kt:84).

### 7. P2 — Kotlin: borrar un perfil deja favoritos e historial huérfanos

La prueba Room elimina un perfil y confirma que sus filas de favoritos e historial permanecen. El repositorio registra la lápida y elimina solo el perfil; no hay relaciones con borrado en cascada. Esos datos aún pueden salir en un respaldo pese a que el perfil ya no existe. La acción de borrar perfiles tampoco está expuesta actualmente en Ajustes.

Resolver el borrado transaccional de todas las colecciones del perfil, conservar las lápidas necesarias y definir el perfil activo de reemplazo. No restaurar filas offline de perfiles eliminados durante una importación.

Evidencia: [borrado nativo](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/data/repository/ProfileRepository.kt:51), [restauración de filas locales](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncRepository.kt:77). Tauri sí elimina ambas colecciones en [su repositorio](C:/dev/AniCS/src-tauri/src/storage/database.rs:271).

### 8. P2 — Kotlin: el escaneo no reconcilia archivos eliminados

`LocalLibrary.scan` inserta archivos nuevos y omite los ya conocidos. No actualiza tamaño/estado de conocidos ni retira o marca como ausentes los que desaparecieron. Descargas muestra todas las filas `completed` de Room, por lo que un archivo borrado fuera de AniCS puede seguir apareciendo como reproducible. Cambiar de carpeta también conserva filas anteriores sin indicar procedencia/disponibilidad.

Resolver reconciliando por carpeta y permiso vigente, con estado ausente recuperable y sin borrar videos ni otras colas. También usar la capacidad del almacenamiento elegido para el resumen de espacio: actualmente `StatFs` siempre consulta el almacenamiento primario, aunque SAF apunte a otro volumen.

Evidencia: [escaneo e inserción](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/downloads/LocalLibrary.kt:31), [listado y volumen](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/ui/viewmodels/DownloadsViewModel.kt:39).

### 9. P2 — Tauri: errores de conexión se presentan como contenido vacío o anunciado

La búsqueda vacía resultados tras un error sin conservar un estado de error visible. Horarios y Top registran el error en consola. Detalles, tras timeout de 8 s/error y con datos parciales de la tarjeta, puede mostrar una descripción de estreno futuro y ausencia de episodios para una serie existente.

Resolver con estados distintos de error, resultado vacío y estreno real; conservar información conocida, ofrecer Reintentar y evitar atribuir un estado editorial a un fallo de red. Cubrir extractor caído, timeout y retorno desde caché.

Evidencia: [búsqueda](C:/dev/AniCS/src/pages/mobile/MobileSearchPage.tsx:200), [detalles](C:/dev/AniCS/src/pages/mobile/MobileDetailsPage.tsx:130), [horarios](C:/dev/AniCS/src/pages/mobile/MobileSchedulePage.tsx:50), [Top](C:/dev/AniCS/src/pages/mobile/MobileTopAnimePage.tsx:37).

### 10. P2 — Tauri: el botón central invisible intercepta el toque simple

El botón de Play/Pause mantiene su área interactiva cuando se oculta con `opacity: 0`. Un toque sobre ese centro pausa; un toque fuera alterna el HUD. Las pruebas actuales confirman ese comportamiento, que difiere del contrato móvil de un toque para mostrar controles y doble toque central para Play/Pause.

Resolver retirando la captura del botón oculto en móvil y manteniendo operables los botones visibles. Agregar una prueba del toque en la ubicación real del botón con HUD oculto. Preservar los controles de escritorio.

Evidencia: [botón central](C:/dev/AniCS/src/pages/PlayerPage.tsx:1573), [pruebas actuales](C:/dev/AniCS/src/pages/PlayerPage.interactions.test.tsx:166).

### 11. P2 — Publicación nativa: el APK puede no adjuntarse al release

Los workflows Tauri y nativo corren independientemente. El nativo espera 20 × 15 segundos a que exista el release; si termina antes y el release tarda más, abandona la espera con una advertencia. El archivo queda como artefacto temporal de un día. Entonces el actualizador puede detectar la versión nueva y no encontrar `AniCS-native.apk`.

Resolver publicando las variantes en un workflow coordinado que espere ambos builds o con una tarea de adjuntado reejecutable y fallo explícito. Usar rutas exactas de artefactos según variante en vez del primer APK encontrado.

Evidencia: [espera limitada](C:/dev/AniCS/.github/workflows/android-native-ci.yml:120), [publicación Tauri](C:/dev/AniCS/.github/workflows/release.yml:294).

### 12. P2 — Kotlin: la opción de fallback no recupera errores del reproductor

`allowFallback` prueba otros servidores cuando falla resolver la URL. Si la URL se resuelve pero Media3 falla al abrir/reproducirla, el controlador expone un error y requiere reintento/cambio manual. Tauri dispone de recuperación de servidor ante error del video.

Mejorar con recuperación limitada y cancelable que conserve tiempo/pausa, excluya candidatos ya fallidos y permita detener el cambio automático. Aclarar en Ajustes qué cubre la opción mientras tanto.

Evidencia: [fallback de resolución](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/player/PlaybackSession.kt:98), [error Media3](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/player/PlayerController.kt:67).

## Funciones que todavía faltan o son parciales en Kotlin

| Área | Tauri móvil | Kotlin actual / mejora pendiente |
| --- | --- | --- |
| Navegación y temas | Encabezado, seis pestañas, temas | Ya implementados; falta comprobar todas las pantallas con texto grande, recortes e insets reales. |
| Catálogo / Horarios / Top | Páginas específicas y datos Rust | Implementados. El ranking pierde la cifra de votos: el extractor la coloca en `animeType` y la tarjeta nativa solo muestra `rating`. |
| Búsqueda | Filtros, sesión por fuente, paginación | Implementados en parte. Las fuentes custom de formato JKAnime pierden los filtros de estado/tipo/año porque la UI compara el ID literal `jkanime`. Usar capacidades/formato del extractor. |
| Detalles | Buscar episodios, ver más, progreso, descargas locales y lote | Progreso y lista básica presentes; faltan búsqueda/orden de episodios, acceso al archivo ya descargado desde la ficha y descarga por lote. |
| Favoritos | Estados y filtros, por ejemplo pendiente/viendo/completado | Alta/baja por perfil presentes. Los estados importados se conservan en JSON adicional, pero no se pueden editar ni filtrar desde la UI nativa. |
| Historial | Agrupación, reanudar, selección y borrado por episodio/serie | Agrupación/reanudación/borrado por serie presentes; falta selección múltiple y borrado individual desde la lista de episodios desplegada. |
| Descargas | Cola con orden/concurrencia, HLS, pausas, reintentos | Solo MP4 descargable. `queueOrder` ordena la lista; se inician trabajos inmediatamente sin límite de concurrencia configurable. Falta persistencia/restauración robusta de cola y velocidad/ETA. |
| Biblioteca offline | Carpetas, portadas guardadas, eliminación física | Escaneo SAF y reproducción presentes. Falta reconciliación y distinguir Quitar de biblioteca de Eliminar archivo/serie; ahora Quitar conserva el video y reaparece al escanear. |
| Inicio | Novedades y sección de emisiones | Kotlin tiene Continuar viendo para online; excluye contenido offline y solo carga página 1 de novedades. Añadir continuidad offline y paginación si el extractor la admite. |
| Reproductor | Servidores, calidad, resume, siguiente, casting y ajustes | La base ya existe. Faltan casting, subtítulos/pistas si el medio los ofrece, control de volumen/brillo táctil y recuperación de sesión tras muerte de proceso. La sesión actual solo vive en un ViewModel. |
| Mantenimiento | Caché con estadísticas/límite, SQLite, VACUUM, novedades | Coil/Room existen, pero falta UI de límites/limpieza, estadísticas de DB, optimización y changelog. |
| Perfiles | Crear, editar y borrar con estadísticas | Crear/cambiar presentes; faltan editar avatar/nombre/color, borrar desde UI y estadísticas. Corregir primero las filas huérfanas. |
| Respaldos | Exportación/importación online | Requieren una transferencia local completa y una vista previa con cantidades/perfiles/ajustes antes de aplicar. |
| Google / cloud | Firestore y contratos heredados | Soporte opcional preparado y desactivado por decisión del usuario. No es un fallo que esté apagado. Antes de activarlo faltan validar cuentas reales, cifrado, preservación de ambos mapas y ciclo automático. |
| Actualizador | Consulta de GitHub e instalación por Android | Kotlin ya tiene consulta/descarga/validación. Falta mostrar progreso/cancelación, coordinar publicación y validar actualización entre dos APKs firmados compatibles. |

Además, ambos algoritmos de fusión conservan la última lápida recorrida para una clave, sin elegir necesariamente la fecha mayor. Antes de habilitar cloud nativo se debe resolver esa diferencia documentada y probar la sincronización de ida y vuelta. No se activó Google ni cloud durante esta revisión.

## Mejoras visuales y de uso propuestas

1. Mantener el encabezado AniCS y Rosé Pine como referencia; uniformar tamaños, espaciado, contraste de texto secundario y zonas táctiles en todas las pantallas. Ajustes ya cuenta con pruebas compactas, pero eso no valida Buscar/Historial/Detalles completos.
2. Reducir la repetición de selectores de fuente entre encabezado y contenido. Diferenciar categoría, proveedor y servidor de video con nombres claros.
3. Mostrar una acción principal por situación: Reanudar con episodio/progreso; Ver siguiente cuando se completó; Reproducir descarga cuando ya existe el archivo.
4. Añadir estados visibles para Sin conexión, Acceso a carpeta perdido, Archivo ausente, Fuente caída y Sin resultados. Conservar las tarjetas conocidas durante una actualización y ofrecer reintento contextual.
5. En el reproductor, mostrar texto/nombre seleccionado junto a los iconos de servidores y opciones cuando haya espacio, buffer en la línea de tiempo y feedback del cambio. Probar HUD, bloqueo y paneles con notch y navegación por gestos.
6. Guardar/restaurar filtros, posición de lista y contexto de reproducción. Explicar automáticamente las transferencias parciales y dar un resultado de importación con cantidades.

## Orden recomendado de trabajo

1. Guardados: importación sin recorte, progreso offline y ambos mapas de ajustes; borrar perfiles sin huérfanos.
2. Descargas: recuperar trabajos interrumpidos, reconciliar biblioteca/permisos y proteger archivos compartidos con Tauri. Usar archivos temporales mientras se descarga para que la otra app no confunda un MP4 parcial con un episodio terminado.
3. Reproductor: carrera de episodios Tauri, gesto central y recuperación de errores Kotlin; validar reanudación y siguiente con streams reales.
4. Actualizaciones: paquete/firma estable, publicación coordinada y prueba de instalación sobre una versión anterior conservando datos.
5. Completar HLS/lotes, estados de favoritos, gestión de perfiles y mantenimiento; pulir accesibilidad y navegación. Casting/cloud requieren su validación específica cuando se decida habilitarlos.

## Aceptación pendiente en dispositivo

Probar ambas apps en el mismo Android: elegir carpeta Tauri por SAF, detectar episodios sin duplicados, importar/exportar más de 1.500 registros, cambiar perfiles y reanudar online/offline, alternar servidores mientras reproduce y pausado, cambiar episodio rápidamente, finalizar el episodio con autoNext activado/desactivado, cortar/restaurar red, pausar descargas, terminar el proceso y volver a abrir, revocar permiso de carpeta, rotar y usar texto grande. Comprobar además actualización firmada sobre instalación existente y reproducción MP4/HLS/códecs que realmente devuelven las fuentes.
