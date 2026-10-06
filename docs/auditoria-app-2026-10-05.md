# Auditoría de AniCS: escritorio Tauri y Android Kotlin

Fecha: 5 de octubre de 2026. Versión declarada: 0.3.8. HEAD al cierre de la revisión: `89e60209253c95ddbb9fce321342573bf73b443a`.

## Alcance y conclusión

Revisión de código de React/Tauri/Rust, Android nativo Kotlin/Compose/Media3, almacenamiento, descargas, reproducción, perfiles, sincronización y publicación. Incluye el reproductor Kotlin con las mejoras de streaming presentes en el árbol revisado. No se modificó código de producción.

La base tiene comprobaciones útiles: pasan los tests frontend y de biblioteca Tauri, las migraciones SQLite de escritorio tienen pruebas, y el streaming local utiliza tokens y soporte Range. Las prioridades son recuperar la ventana de escritorio durante descargas, renovar enlaces de descarga caducados, corregir integridad de perfiles y endurecer los contratos cloud antes de reactivar cuentas.

**Contexto de activación:** `FEATURE_FLAGS.ENABLE_FIREBASE_AUTH` y `BuildConfig.ENABLE_FIREBASE_AUTH` están en `false`. Los defectos de sincronización y login se indican como condicionales; no representan errores habituales del usuario en el modo local vigente. Sin embargo, las rutas HTTP `/auth/*` de Tauri siguen registradas sin depender del flag de interfaz.

P1 = alta prioridad por acceso a credenciales, pérdida de datos o bloqueo relevante de uso. P2 = fallo funcional o de integridad acotado. P3 = corrección menor. “Confirmado por código” significa que se verificó el flujo y sus llamadas; no implica reproducción en un dispositivo.

## Validación realizada

| Comprobación | Resultado |
| --- | --- |
| `npm run build` | Correcto. Advertencias de tamaño y de imports dinámicos ineficaces. |
| `npm test` | 25 archivos, 198 tests correctos. |
| `npm run lint` | Correcto con advertencias; incluye dependencias de hooks, refs durante render y componentes creados dentro del render. |
| `cargo check --offline`, en `src-tauri` | Correcto fuera del sandbox. |
| `cargo test --offline`, en `src-tauri` | No completó: Windows negó acceso al reemplazar `target/debug/anics.exe`. No se determinó la causa del bloqueo. |
| `cargo test --offline --lib`, en `src-tauri` | 42 tests correctos. |
| `cargo test --offline --lib`, en `crates/anics-core` | 4 tests correctos. |
| `cargo test --offline --lib`, en `crates/anics-ffi` | Compila correctamente; esta selección contiene 0 tests. No equivale a comprobar los tests de integración FFI. |
| Gradle `testDebugUnitTest assembleDebug --offline --no-daemon` | Bloqueado: no hay SDK Android configurado. No se verificó compilación ni tests Kotlin/Compose. |
| Pruebas aisladas del lector TypeScript cloud | Confirmaron aceptación de JSON corrupto como `[]` y de `schemaVersion: 99`. Se ejecutó el código real transpileado con un transporte simulado, sin acceder a Firestore. |

Los primeros fallos de Vitest por archivos temporales y de Tauri por `OUT_DIR` desaparecieron al ejecutar fuera del sandbox; no se contabilizan como defectos de AniCS. Las pruebas de scrapers contra proveedores reales, el APK en dispositivo, el instalador Windows y las mediciones de memoria/fluidez quedan pendientes. Los Cargo.lock de las bibliotecas, actualizados automáticamente por las comprobaciones, se devolvieron a su contenido previo.

## Hallazgos y correcciones propuestas

### A01 · P1 · PC: la ventana puede quedar inaccesible al cerrar durante una descarga

**Evidencia:** [lib.rs](C:/dev/AniCS/src-tauri/src/lib.rs:85). `CloseRequested` cancela el cierre y ejecuta `hide()` cuando hay tareas. La búsqueda del evento `window-hidden-downloads-active` solo encuentra su emisión; no hay bandeja, acción para mostrar la ventana ni restauración al terminar la descarga en el código revisado.

**Escenario:** iniciar una descarga y pulsar la X. El proceso sigue trabajando con la ventana oculta. El usuario pierde una vía visible para volver al reproductor o gestionar la cola.

**Cambio:** implementar bandeja con “Mostrar AniCS” y “Salir”, recuperación mediante instancia única y una política explícita al terminar las descargas. Como corrección inicial, mantener la ventana accesible hasta disponer de esa vía.

**Verificación:** cerrar con una descarga y con varias en cola; restaurar la misma instancia; comprobar que finalizar, pausar y cancelar dejan una salida accesible. Confirmado por código; pendiente prueba interactiva.

### A02 · P2 · Android Kotlin: reanudar conserva enlaces de streaming caducados

**Evidencia:** [DownloadManager.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/downloads/DownloadManager.kt:88), método `resolve`, y `resumeDownload` en línea 272. La URL resuelta se persiste y `resolve()` retorna inmediatamente si `streamUrl` no está vacío. Reanudar solo devuelve la tarea a la cola.

**Escenario:** pausar, volver después de que caduque una URL firmada, recibir 403/410 y pulsar Reanudar. Se vuelve a solicitar el mismo enlace; no se resuelve de nuevo el episodio. La manifestación depende del proveedor y de la caducidad del enlace.

**Cambio:** conservar la identidad del episodio y resolver una URL nueva ante respuestas de caducidad o en un reintento explícito. Al cambiar de recurso, validar identidad/tamaño y el rango antes de anexar bytes; una URL nueva no garantiza que el archivo sea idéntico.

**Verificación:** servidor simulado con URL antigua rechazada y URL renovada válida; comprobar tanto reanudación segura como reinicio cuando cambia el contenido.

### A03 · P2 · Android Kotlin: borrar un perfil deja sus favoritos e historial

**Evidencia:** [ProfileRepository.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/data/repository/ProfileRepository.kt:59). La transacción registra la lápida y elimina el perfil, pero no sus registros en `history` y `favorites`. Las entidades no declaran una relación con borrado en cascada. El [equivalente Rust](C:/dev/AniCS/src-tauri/src/storage/database.rs:258) sí elimina ambas colecciones.

**Consecuencia:** quedan datos huérfanos; los conteos globales y la exportación pueden incluir datos de perfiles eliminados. La fusión Kotlin filtra perfiles eliminados, pero tampoco filtra por ese motivo todas las filas dependientes.

**Cambio:** eliminar los registros dependientes dentro de la misma transacción y respetar el perfil activo/default. Limpiar huérfanos existentes mediante una migración o reparación explícita.

**Verificación:** perfil con historial y favoritos; eliminarlo y comprobar tablas, conteos y exportación. Confirmado por código.

### A04 · P3 · Android Kotlin: el tamaño de SQLite se consulta con un nombre incorrecto

**Evidencia:** [SettingsViewModel.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/ui/viewmodels/SettingsViewModel.kt:351) consulta `anics.db`; [AppDatabase.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/data/local/AppDatabase.kt:57) abre `anics_native.db`.

**Consecuencia:** Ajustes puede indicar 0 B aunque existan datos. Además, medir solo el archivo principal omite el WAL mientras tenga datos pendientes.

**Cambio:** compartir una constante del nombre de base y definir si el indicador incluye los archivos SQLite auxiliares. Verificar con una base poblada y con escrituras en WAL. Confirmado por código.

### A05 · P1 · Tauri: el puente HTTP de autenticación carece de autorización de sesión

**Evidencia:** [media_server.rs](C:/dev/AniCS/src-tauri/src/downloader/media_server.rs:364) despacha `/auth` antes del control de token de `/video`. El callback acepta `AuthCallbackData`, `/auth/status` devuelve los tokens pendientes y `/auth/clear` borra el estado sin comprobar un secreto de sesión. El handler ignora `_origin` y responde con CORS `*`.

**Consecuencia:** otro proceso local que conozca el puerto puede consultar credenciales pendientes, inyectar un callback o cancelar un login. El alcance desde una página web depende de las restricciones de acceso a loopback del navegador; no se comprobó explotación desde un sitio externo. El token aleatorio que protege videos no protege estas rutas.

**Cambio:** no habilitar el puente cuando Auth esté desactivado; crear un nonce por intento, verificarlo y consumirlo una sola vez, exigir rutas exactas y limitar origen y duración. Leer/consumir el resultado desde un comando Tauri evita exponer los tokens mediante un GET público.

**Verificación:** rechazar solicitudes sin nonce, con nonce erróneo/reutilizado y sin intento activo; comprobar que ningún GET no autorizado devuelve tokens. Confirmado por código, sin extracción de credenciales reales.

### A06 · P1 · Tauri: el fallback de secretos escribe texto plano en SQLite

**Evidencia:** [secure_store.rs](C:/dev/AniCS/src-tauri/src/storage/secure_store.rs:14). Si no se puede inicializar/escribir keyring, `set_secure_secret()` usa `database::set_sync_config("_sec_...", secret)`. En Android Tauri la rama keyring ni siquiera se compila.

**Consecuencia:** un secreto guardado por esa API puede acabar en SQLite. Filtrar `_sec_` de las exportaciones evita exposición por ese canal, pero no cifra el archivo local. Esto contradice las directrices del proyecto. No se comprobó que la base de este equipo contenga un token real.

**Cambio:** fallar de forma explícita al no disponer de almacenamiento seguro; usar el almacén cifrado nativo para Android Tauri y migrar cualquier fallback antiguo tras verificar la escritura segura. Eliminar el dato antiguo solo después de confirmar la migración.

**Verificación:** simular fallo del almacén nativo y comprobar que SQLite no recibe el secreto. Probar migración y eliminación de credenciales. El test de roundtrip actual no distingue el backend seguro del fallback.

### A07 · P1 condicional · Tauri: el login puede comunicar éxito aunque Firebase lo rechace

**Evidencia:** [authService.ts](C:/dev/AniCS/src/services/firebase/authService.ts:98). Si falla `signInWithCredential`, el catch solo escribe un aviso; después se construye `AuthUserInfo` con el callback y se retorna como éxito. También sucede si el callback carece de tokens.

**Consecuencia:** al habilitar Auth, la interfaz puede mostrar una cuenta que no corresponde a una sesión Firebase válida; la sincronización posterior falla o conserva otra sesión. No se demostró un bypass de reglas Firestore.

**Cambio:** retornar éxito exclusivamente después de autenticar y obtener la identidad de Firebase; el callback es un medio de transporte, no una prueba de sesión. Mostrar error recuperable y no actualizar la cuenta activa al fallar.

**Verificación:** token ausente, inválido y de identidad distinta; ninguna ruta debe producir una sesión aparente. Confirmado por código.

### A08 · P1 condicional · Tauri: el lector cloud tolera corrupción y esquemas futuros

**Evidencia:** [syncService.ts](C:/dev/AniCS/src/services/syncService.ts:479). `parseField()` devuelve arrays/mapas vacíos al faltar contenido o fallar JSON sin cifrado. `fetchFirestoreData()` devuelve el payload sin llamar a `migratePayload()` ni validar su estructura. La ruta de importación directa del store puede aplicarlo sin pasar por la fusión que sí comprueba versiones.

**Prueba aislada:** `favorites: '{broken'` devolvió `favorites: []`; `schemaVersion: 99` fue aceptado por el lector. Las dependencias de transporte se simularon; se ejecutó la función real, sin red.

**Consecuencia:** datos dañados o de un cliente más nuevo pueden interpretarse como un respaldo válido. Una escritura posterior puede sustituir contenido remoto por una reconstrucción incompleta. No se reprodujo pérdida en una cuenta real.

**Cambio:** validar versión y estructura inmediatamente después de descifrar; distinguir documento ausente de documento inválido y abortar antes de mutar SQLite o escribir Firestore. Aplicar las colecciones locales en una transacción de backend.

**Verificación:** esquema futuro, colección ausente, JSON roto, progreso no finito y fecha inválida; asegurar cero escrituras locales/remotas ante rechazo.

### A09 · P1 condicional · Tauri: aplicar lápidas elimina favoritos añadidos de nuevo

**Evidencia:** [syncService.ts](C:/dev/AniCS/src/services/syncService.ts:251) conserva el favorito si `addedAt` es posterior a `deletedAt`; [useSyncStore.ts](C:/dev/AniCS/src/stores/useSyncStore.ts:775) añade los favoritos fusionados y luego ejecuta `removeFavorite()` por todas las lápidas, sin comprobar si fueron superadas. La rama de solo descarga repite el patrón en línea 715.

**Escenario:** eliminar un favorito a las 12:00 y volver a añadirlo a las 12:01. La función pura de fusión lo conserva —comprobado en prueba aislada—, pero la aplicación local lo vuelve a borrar. El borrado local también genera una nueva lápida, reforzando el conflicto.

**Cambio:** aplicar únicamente las eliminaciones efectivas del resultado fusionado y disponer de una operación de importación que no fabrique una lápida local nueva para una eliminación remota.

**Verificación:** probar `syncNow()` completo con borrar → añadir de nuevo → sincronizar, en ambas ramas. La prueba existente de la función pura no cubre el borrado posterior.

### A10 · P1 condicional · Android Kotlin: los borrados desde Ajustes omiten lápidas

**Evidencia:** [SettingsViewModel.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/ui/viewmodels/SettingsViewModel.kt:399). `clearHistory()` llama al DAO directamente; `resetDatabase()` elimina historial y favoritos sin registrar lápidas. [HistoryRepository.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/data/repository/HistoryRepository.kt:76) ya dispone de un borrado con lápida.

**Consecuencia:** al restaurar/fusionar un respaldo antiguo o habilitar cloud, los registros eliminados pueden reaparecer. La omisión existe hoy; la propagación cloud automática está desactivada.

**Cambio:** unificar los borrados intencionales en repositorios transaccionales. Definir expresamente si “Restablecer” limpia solo este dispositivo o propaga una eliminación; conservar el modo local y el contrato v2.

**Verificación:** borrar desde Ajustes y fusionar el respaldo anterior; comprobar que el historial eliminado no reaparece cuando la operación tiene semántica de borrado sincronizable.

### A11 · P2 condicional · Android Kotlin: la fusión de lápidas no conserva siempre la fecha más reciente

**Evidencia:** [SyncModels.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/SyncModels.kt:78). Se recorren lápidas locales y después remotas, asignando `result[key(t)] = t`; una remota más antigua reemplaza una local más nueva. La implementación TypeScript compara timestamps.

**Escenario:** lápida local 12:05, remota 12:00 y favorito añadido a las 12:03. La fusión nativa puede conservar el favorito usando el borrado antiguo, aunque debería suprimirlo por el borrado local posterior.

**Cambio:** elegir el máximo `deletedAt` por clave y definir empate determinista, manteniendo la retención de 30 días.

**Verificación:** mismo conjunto en orden local/remoto invertido y vector compartido TypeScript/Kotlin. Confirmado por código; pendiente ejecutar Kotlin.

### A12 · P1 condicional · Ambas versiones: lectura y escritura cloud permiten sobrescrituras concurrentes

**Evidencia:** [syncService.ts](C:/dev/AniCS/src/services/syncService.ts:608) usa `getDoc` seguido, fuera de transacción, por `setDoc`; [CloudSyncClient.kt](C:/dev/AniCS/android-native/app/src/main/java/com/anics/nativeapp/sync/CloudSyncClient.kt:64) hace `get(Source.SERVER)` y después `ref.set(document)`.

**Escenario:** PC y Android leen la misma revisión, cada uno añade un favorito y ambos escriben su resultado. La última escritura puede omitir el cambio del otro. Los hashes y el debounce local no impiden esta carrera entre dispositivos; una sincronización posterior podría recuperarla si el cambio sigue presente localmente, pero no hay garantía de convergencia inmediata.

**Cambio:** leer, validar y fusionar con una transacción Firestore que reintente ante cambios remotos; mantener esquema v2, cifrado y documento vigente. Preparar un snapshot local, no modificar SQLite desde el callback reintentable, y aplicar el resultado confirmado fuera de él. Firestore documenta los [reintentos de transacciones ante escrituras concurrentes](https://firebase.google.com/docs/firestore/manage-data/transactions).

**Verificación:** dos clientes sincronizando simultáneamente altas, borrados y cambios de ajustes; comprobar convergencia sin perder ninguno. Riesgo confirmado por la secuencia de operaciones, sin prueba contra producción.

## Mejoras adicionales sugeridas

| Área | Cambio sugerido y motivo | Evidencia / criterio de aceptación |
| --- | --- | --- |
| Actualizador Windows | Verificar integridad y autenticidad antes de ejecutar, con archivo temporal privado y publicación atómica del resultado. | [download_cmd.rs](C:/dev/AniCS/src-tauri/src/commands/download_cmd.rs:2057) escribe, hace flush y ejecuta; no verifica digest/firma ni igualdad final de tamaño. La URL se reconstruye al repositorio oficial, lo cual reduce riesgo; no se comprobó descarga maliciosa. Un archivo incompleto/alterado debe rechazarse. |
| Defensa del WebView | Introducir CSP y limitar el alcance del protocolo asset. | [tauri.conf.json](C:/dev/AniCS/src-tauri/tauri.conf.json:27) tiene `csp: null` y scope `**`. Probar imágenes, HLS, loopback y Firebase antes de restringir. Es endurecimiento; no prueba por sí mismo una inyección explotable. Referencia: [CSP de Tauri](https://v2.tauri.app/security/csp/). |
| Inicio y tamaño frontend | Cargar rutas pesadas bajo demanda y separar el módulo cloud cuando Auth esté desactivado. | Build observado: `index` 889.43 kB y `PlayerPage` 642.13 kB minificados; Firebase tiene imports estáticos que invalidan parte de la división dinámica. Medir arranque y memoria antes/después, manteniendo reproducción y modo offline. |
| Mantenimiento del reproductor | Extraer resolución, sesión, progreso y controles de `PlayerPage.tsx` por responsabilidades, con interfaces y pruebas de comportamiento. | El archivo combina gran parte del reproductor y supera 2.000 líneas. Preservar clic simple/HUD, doble toque, teclas, rueda, pantalla completa y limpieza de streams. No tratar todas las advertencias de hooks como bugs sin revisar su efecto. |
| Accesibilidad | Usar enlaces/botones para tarjetas interactivas y verificar foco, nombres accesibles, escala de texto y contraste. | [DesktopSearchPage.tsx](C:/dev/AniCS/src/pages/desktop/DesktopSearchPage.tsx:18) usa `motion.div` con `onClick` para resultados, sin activación de teclado. Verificar Tab, Enter/Espacio y TalkBack con las mismas acciones disponibles por puntero. |
| Publicación y CI | Añadir gates frontend/Rust al release; separar tests con fixtures de pruebas contra proveedores reales; hacer fallar la publicación nativa si no logra adjuntar el APK. | [release.yml](C:/dev/AniCS/.github/workflows/release.yml:115) construye sin pasos de tests; [android-native-ci.yml](C:/dev/AniCS/.github/workflows/android-native-ci.yml:136) termina con aviso y éxito si agota la espera del release. Los dos workflows publican por separado. Un run verde debe garantizar los assets esperados. |
| Reproducibilidad Rust | Sincronizar versiones de paquetes locales en Cargo.lock durante `bump` y validar con `--locked`. | Los checks actualizaron `anics-core` de 0.2.11 a 0.3.8 en su lock y core/FFI de 0.3.6 a 0.3.8 en el lock FFI. El [script bump](C:/dev/AniCS/scripts/bump-version.js:54) modifica Cargo.toml, pero no estos lockfiles. Las pruebas de la auditoría restauraron esos cambios automáticos. |
| Capacidad cloud | Presupuestar bytes del documento antes de escribir, incluyendo JSON/cifrado, y advertir sin sustituir contenido existente. | Limitar historial a 1.500 entradas no limita longitud de URLs, favoritos o metadatos. El documento Firestore admite [hasta 1 MiB](https://firebase.google.com/docs/firestore/quotas). Una evolución a varios documentos requiere diseñar una migración del contrato, no cambiarlo unilateralmente. |
| Android nativo | Añadir índices Room según consultas reales y exportar esquemas para comprobar migraciones; usar recogida de estado ligada al lifecycle donde corresponda. | Las consultas por perfil/episodio y orden temporal crecen con el historial; `exportSchema = false` dificulta revisar cambios. Medir con miles de filas y verificar migraciones 1→2→3, background/foreground y pérdida de permisos SAF. |

## Orden recomendado

1. Corregir A01–A04 y la accesibilidad de las acciones principales: tienen efecto en el uso local vigente.
2. Cerrar A05–A06 y endurecer el actualizador/CSP antes de ampliar capacidades de autenticación o distribución.
3. Resolver A07–A12 con pruebas de contratos compartidas, conservando Firestore v2 y el modo Auth desactivado.
4. Añadir gates de CI y asegurar publicación de ambos APK; después optimizar bundles y dividir el reproductor.

Antes de dar por cerradas correcciones Android, ejecutar Gradle y pruebas en un dispositivo con red intermitente, sesión de reproducción prolongada, descargas en segundo plano, reinicio del proceso y permisos SAF revocados. Antes de cerrar escritorio, comprobar la ventana/bandeja, atajos y reproducción local. Esta auditoría no certifica esos comportamientos: identifica los casos concretos que deben verificarse.
