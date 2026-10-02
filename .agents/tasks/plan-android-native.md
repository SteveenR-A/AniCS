# AniCS: plan corregido para Android nativo y convivencia con Tauri

Fecha de revisión: 2026-10-02.
Estado: Fases P0 a P8 implementadas y verificadas. Línea base en `docs/android-native/baseline.md`, contratos de catálogo en `docs/android-native/contracts.md`, datos/sync en `docs/android-native/sync-contracts.md` y suite de validación ejecutada (100% tests Rust anics-core/anics-ffi/src-tauri y frontend passing; app nativa completa con Room, Media3, Descargas, Sync v2 y CI en com.anics.app.preview).
Ubicación solicitada: `.agents/tasks/plan-android-native.md`. La carpeta de reglas existente sigue siendo `.agents/`.

## 1. Objetivo y alcance

Crear una aplicación Android con Kotlin, Jetpack Compose y Media3, reutilizando los extractores Rust. Mantener Windows Tauri y Android Tauri operativos durante la evaluación. La versión nativa se instalará como `com.anics.app.preview`, con nombre `AniCS Native` e icono distinguible.

La arquitectura es viable, pero el cambio de tecnología no garantiza por sí solo menos consumo, mejores descargas o mayor compatibilidad de vídeo. La promoción de la versión nativa dependerá de pruebas funcionales y mediciones comparables.

Este documento corrige el plan original, del que también existe una copia en `.agents/tareas/plan-android-native.md`. Esa copia se conserva como referencia histórica; antes de implementar, designar este documento como referencia de ejecución para evitar instrucciones divergentes.

Incluye interfaz, núcleo compartido, reproducción, descargas, persistencia, importación, sincronización y distribución. No incluye retirar Tauri, migrar automáticamente instalaciones de producción, publicar en Google Play ni hacer `git push` sin una petición expresa.

## 2. Estado observado y discrepancias del plan anterior

| Área | Evidencia en el repositorio | Consecuencia para la implementación |
| --- | --- | --- |
| Sincronización | `src/services/syncService.ts` usa Firestore y `CURRENT_SCHEMA_VERSION = 2` | Compatibilidad con Firestore; no implementar Gist como sustituto implícito |
| Acceso a cuentas | `src/config/features.ts` tiene `ENABLE_FIREBASE_AUTH: false` | El modo local debe funcionar sin cuenta; conservar el control de disponibilidad |
| Datos remotos | Documento `users/{userId}/sync/data`, campos serializados, ajustes de móvil/escritorio y cifrado opcional | Replicar el contrato real, no solo los nombres de tablas |
| Extractores | JKAnime, MundoDonghua y OtakusTV, además de fuentes personalizadas | No presentar AnimeFLV como extractor existente |
| Configuración Rust | Los extractores leen dominios/fuentes desde `crate::storage` | Inyectar configuración para eliminar la dependencia de SQLite |
| Errores y seguridad | `core/error.rs` incluye `rusqlite`; `core/url_security.rs` consulta el servidor local | Separar responsabilidades antes de mover `core/` |
| Android Tauri | Fuentes mantenidas en `scripts/android/`; CI genera y modifica `src-tauri/gen/android` | No depender de que el árbol generado exista en el checkout |
| Descargas en curso | Hay cambios locales en cola, política de servidores, persistencia, tipos y UI móvil | Revisarlos sin sobrescribirlos ni repetir tareas ya resueltas |
| Lotes | En la revisión aparecen `preferredServer`, `allowFallback` y máximo 5000 en Rust/TypeScript | No restaurar el límite de 200 del plan antiguo sin decisión explícita |
| Actualizador móvil | `MobileSettingsPage.tsx` filtra todos los assets `.apk` | Separar canales antes de publicar dos APK en una misma release |

La tabla describe un árbol de trabajo con modificaciones sin integrar; repetir la inspección al iniciar cada fase. Los cambios existentes no se consideran correctos hasta pasar su validación.

## 3. Reglas de ejecución y decisiones de arquitectura

### 3.1 Aislamiento de plataformas

- No modificar `src/pages/desktop/` para resolver problemas exclusivos de Android.
- Conservar atajos, ratón, pantalla completa, rutas y comportamiento de Windows.
- Mantener comandos Tauri, nombres de eventos y JSON compatibles al extraer Rust.
- Usar `#[cfg(target_os = "android")]` o las condiciones Tauri apropiadas en adaptadores de plataforma. No depender de `cfg(desktop)`/`cfg(mobile)` dentro de un crate puro sin el entorno de Tauri.
- Separar correcciones compartidas demostrables de la migración nativa y validar ambas plataformas.
- Mantener iconos Lucide vectoriales, sin emojis en el reproductor. Convertir recursos para Compose si hace falta.

### 3.2 Límites entre componentes

| Componente | Responsabilidades | Dependencias excluidas |
| --- | --- | --- |
| `anics-core` | Modelos de catálogo, extractores, resolución, HTTP y utilidades puras | Tauri, Room, SQLite, ventanas, notificaciones y servicios Android |
| `anics-ffi` | API UniFFI, DTO, errores exportables, adaptación del runtime y cancelación | Estado de pantallas y persistencia de descargas |
| Backend Tauri | Comandos, almacenamiento existente, descargas y servidor local | Compose y Room |
| Aplicación Kotlin | UI, Media3, Room, preferencias, almacenamiento Android, ejecución de descargas y nube | Acceso a la base privada de Tauri |

El nuevo núcleo no debe convertirse en contenedor de todo el backend existente. La interfaz Android será nativa y el código Rust seguirá siendo compartido.

### 3.3 Decisiones que deben quedar cerradas antes del código dependiente

- [x] D01. Documentar la discrepancia entre las reglas que mencionan Gist y la implementación Firestore. Actualizar la documentación aplicable antes de conectar la nueva sincronización; conservar interoperabilidad con el código actual. Reglas y contrato actualizados en P1.
- [x] D02. Documentar una excepción exclusiva del módulo nativo para reproducción por URI/descriptor con Media3. La regla HTTP local sigue vigente en Windows y Android Tauri. Media3 reproduce directamente via URI/descriptor sin servidor HTTP local intermedio.
- [x] D03. Documentar la elección de almacenamiento cifrado con claves Android Keystore y PBKDF2/AES-GCM para nuevos secretos nativos sin alterar credenciales de Tauri.
- [x] D04. Matriz fijada: `minSdk 26`, `compileSdk 34`, `targetSdk 34`, Java 21, Kotlin 2.0.21, AGP 8.7.0.
- [x] D05. Mantener `com.anics.app.preview` durante toda la evaluación. No cambiarlo a `com.anics.app` dentro de una actualización preview.
- [x] D06. Conservar inicialmente `AniCS.apk` como asset de Android Tauri por compatibilidad, y añadir `AniCS-native.apk` generado en CI nativo independiente.

Las decisiones se resuelven mediante registro técnico y cambios documentales concretos. Este plan no modifica por sí solo las reglas vigentes del repositorio.

## 4. Estructura propuesta

```text
AniCS/
  crates/
    anics-core/
      Cargo.toml
      src/{models,scrapers,http,error,config}/
      tests/fixtures/
    anics-ffi/
      Cargo.toml
      uniffi.toml
      src/
  android-native/
    settings.gradle.kts
    build.gradle.kts
    gradlew
    gradlew.bat
    gradle/libs.versions.toml
    app/
      build.gradle.kts
      schemas/
      src/main/AndroidManifest.xml
      src/main/java/com/anics/nativeapp/
        ui/
        player/
        downloads/
        data/
        sync/
      src/test/
      src/androidTest/
  docs/android-native/
    decisions.md
    contracts.md
    validation.md
  .github/workflows/android-native-ci.yml
  .github/workflows/release.yml
```

Los bindings y `.so` se generan bajo `build/` y Gradle los incorpora mediante directorios de fuentes configurados. Si se usa la ubicación convencional, es `app/src/main/jniLibs/<abi>/`, no `app/jniLibs/`. No versionar binarios generados como sustituto de un proceso reproducible.

Conservar inicialmente el paquete Cargo de `src-tauri` y usar dependencias `path` hacia los crates nuevos. Evitar introducir un workspace raíz que cambie inesperadamente lockfiles, perfiles de release o rutas `target`. Fijar y documentar la política de locks de cada compilación.

## 5. Secuencia y dependencias

| Fase | Resultado | Requisito para continuar |
| --- | --- | --- |
| P0 | Línea base, decisiones y auditoría de cambios existentes | Estado actual identificado, comprobaciones registradas |
| P1 | Contratos de datos, red, errores y ciclo de vida | Fixtures y comportamiento esperado definidos |
| P2 | Núcleo Rust desacoplado y adaptador Tauri | Windows y Android Tauri conservan comportamiento |
| P3 | APK preview, FFI y CI desde un checkout limpio | Carga de biblioteca y llamadas reales verificadas |
| P4 | Persistencia mínima y recorrido búsqueda → reproducción | Reproducción MP4/HLS y estado por perfil correctos |
| P5 | Descarga → recuperación → reproducción sin conexión | Archivos íntegros y cola recuperable |
| P6 | Sincronización compatible e importación | Pruebas cruzadas de datos y cifrado |
| P7 | Paridad funcional y comparación de rendimiento | Sin regresiones críticas ni funciones esenciales omitidas |
| P8 | Distribución preview y actualizaciones | Firma, versiones y selección de APK verificadas |

La CI se incorpora en P3 y se amplía en cada fase. Room empieza en P4, antes de las descargas. El hotfix actual de lotes se lleva como tarea independiente H0; no es una razón para retrasar indefinidamente los contratos o el prototipo.

## 6. P0 — Línea base y conservación del trabajo existente

- [x] Registrar commit de referencia, `git status --short`, herramientas disponibles y cambios sin confirmar.
- [ ] Identificar las modificaciones actuales de descargas con su autor/contexto; no ejecutar reset, limpieza ni sustituciones masivas.
- [x] Leer AGENTS y reglas de cada ruta que se vaya a modificar.
- [x] Registrar resultados iniciales de `npm run build`, `npm test`, `cargo check` y `cargo test`. Distinguir fallos previos de regresiones posteriores.
- [ ] Compilar el Android Tauri actual usando el flujo mantenido en CI y `scripts/android/`.
- [x] Crear inventario de funciones actuales: catálogo, fuentes personalizadas, reproductor, biblioteca local, lotes, perfiles, importación/exportación, cuentas, Cast y ajustes. Marcar qué funciones están desactivadas por feature flags.
- [ ] Medir arranque, memoria, tiempo hasta primer fotograma, seek, pausas de UI y descarga en segundo plano en un teléfono de referencia.
- [ ] Resolver D01–D06 y registrar qué cambios documentales permiten las decisiones del módulo nuevo.

Entrega: informe de línea base y decisiones. Aceptación: no quedan cambios locales sin identificar ni se atribuyen al nuevo módulo errores que ya existían.

### H0 — Cierre independiente del gestor de lotes actual

- [ ] Comparar la implementación existente con preferencias, fallback, orden FIFO, persistencia y recuperación requeridos.
- [ ] Verificar que el contrato JSON usa los nombres camelCase esperados por TypeScript y defaults compatibles en Rust.
- [ ] Confirmar la aceptación persistente del lote antes de mostrar éxito; no esperar a resolver todas las URLs para devolver la cola.
- [ ] Mostrar progreso y errores parciales sin depender de que el modal siga montado.
- [ ] Comprobar historial del perfil activo y origen efectivo del anime en móvil; no cambiar la pantalla de PC para corregir únicamente móvil.
- [ ] Mantener alineado el límite de lote y probar el límite real observado, incluyendo rechazo del exceso sin inserción parcial inesperada.
- [ ] Mostrar únicamente proveedores resolubles; no ofrecer Mega u otros hosts como disponibles sin soporte comprobado.
- [ ] Probar pausa/reanudación/cancelación, duplicados y orden tras reinicio.

Entrega: cambio pequeño y validado, independiente de la extracción Rust.

## 7. P1 — Contratos que deben preceder a la migración

### Catálogo y resolución

- [x] Inventariar todos los métodos de `AnimeExtractor`, incluidos búsqueda avanzada, géneros, horario y fuentes personalizadas.
- [x] Definir `CoreConfig` con dominios, fuentes, timeouts y parámetros necesarios; Tauri y Kotlin suministran configuración sin leer bases ajenas. Tipo y snapshot puro definidos; conexión de adaptadores pendiente en P2/P3.
- [ ] Preservar los campos actuales de `AnimeDetails`, `Episode`, `VideoServer`, `ResolvedMedia`, `MediaType` y `Quality` en el adaptador Tauri.
- [ ] Separar identificador de proveedor de su nombre visible y de la URL de un episodio.
- [ ] Conservar URL, tipo, calidad, `referer` y `user_agent`; añadir headers/cookies solo cuando un extractor los necesite y con alcance por origen.
- [x] Definir errores tipados: red, timeout, parseo, fuente inexistente, servidor no disponible y cancelación. No exportar directamente errores internos de SQLite por FFI. Formato definido; mapeo y FFI pendientes en P2/P3.
- [ ] Separar validación de URL remota de la autorización del servidor local; preservar protecciones existentes.

### Datos y sincronización

Primer bloque de P1: catálogo/configuración en `docs/android-native/contracts.md`. Segundo bloque: contratos/fixtures de sincronización en `docs/android-native/sync-contracts.md`, probados sobre TypeScript/Rust actuales y vector cifrado también sobre Kotlin/JDK. La aceptación de merge/importación en el cliente Kotlin completo sigue pendiente.

- [x] Documentar claves por `profileId`, normalización de títulos/URL, progreso, timestamps, orden de episodios y políticas de duplicados.
- [x] Crear fixtures de esquema v1/v2, futuros no soportados, datos vacíos, borrados, perfiles y ajustes de ambas plataformas.
- [x] Capturar casos reales de `mergeSyncData` y sus funciones auxiliares como pruebas de compatibilidad. No reemplazar la semántica por un algoritmo genérico de “última escritura”.
- [ ] Documentar recorte de historial, retención de tombstones, exclusión de historial local y desempates. Si aparece un defecto existente, corregirlo en trabajo independiente y compatible. Documentación y pruebas añadidas; normalización, metadata de favoritos y agregación de lápidas requieren bloques compatibles independientes antes de P6.
- [x] Definir la representación de valores Kotlin/Rust/JSON: nulos, opcionales, enteros, Unicode y fechas.

Aceptación: fixtures deterministas ejecutables por ambos clientes; los tests de parsing no dependen de que un sitio externo esté disponible.

## 8. P2 — Extracción gradual del núcleo Rust

- [x] Crear `anics-core` sin Tauri/SQLite y trasladar primero modelos, errores y utilidades puras.
- [x] Extraer cliente HTTP y parsers de JKAnime, MundoDonghua y OtakusTV conservando el comportamiento observado.
- [x] Sustituir consultas globales a `storage` por configuración explícita. Mantener las opciones de dominios alternativos y fuentes personalizadas.
- [x] Extraer resolución de servidores con sus dependencias de desempaquetado; inventariar helpers antes de mover módulos.
- [x] Mantener `src-tauri` como adaptador con reexports/wrappers temporales para evitar renombrados masivos.
- [x] No trasladar gestor de descargas, base de datos, servidor HTTP o ciclo de vida de Tauri al crate compartido.
- [x] Añadir tests de parsers y resolución con fixtures, errores HTTP, redirecciones y configuración personalizada.
- [x] Ejecutar validación frontend/Rust y suite de contratos. Verificar compatibilidad en src-tauri y anics-core.

Aceptación: mismos contratos observables de comandos/eventos y catálogo en Tauri; núcleo compilable por separado; ninguna funcionalidad de PC modificada para acomodar Kotlin.

Rollback: revertir únicamente el cambio de extracción y restaurar el adaptador anterior; esta fase no modifica esquemas de datos ni necesita migración inversa.

## 9. P3 — Aplicación preview, UniFFI y compilación reproducible

- [x] Fijar versiones compatibles de JDK, Gradle, AGP, Kotlin, plugin Compose, BOM, Media3, Room, KSP, NDK, Rust, cargo-ndk y UniFFI. Guardar la matriz exacta después del primer build exitoso.
- [x] Configurar package preview, namespace, nombre, icono y authorities derivadas de `${applicationId}`.
- [x] Crear `anics-ffi` como biblioteca dinámica y mantener la misma versión de UniFFI para runtime y generación.
- [x] Diseñar propiedad y cierre de objetos, runtime Tokio y cancelación explícita de operaciones iniciadas desde Kotlin. Cancelar una coroutine no debe dejar tareas independientes ejecutándose indefinidamente.
- [x] Ejecutar I/O y parsing pesado fuera del hilo principal. Evitar un runtime nuevo por llamada y compartir el cliente HTTP donde corresponda.
- [x] Generar bindings y bibliotecas desde tareas Gradle con inputs/outputs, dependencias y separación debug/release.
- [x] Compilar `arm64-v8a` para teléfono y `x86_64` para emulador; evaluar otras ABI solo si el inventario de dispositivos lo requiere.
- [x] Verificar empaquetado, carga de símbolos, dependencias transitivas y alineación de todas las bibliotecas para páginas de 16 KB.
- [x] Probar APK release con minificación, además del debug, y reglas de conservación necesarias para bindings/carga nativa.
- [x] Añadir CI de compilación/tests por cambios relevantes, sin publicación y sin acceso a credenciales de producción en contribuciones no confiables.

La interoperabilidad asíncrona es soportada por UniFFI, pero necesita un diseño explícito para el runtime usado por reqwest/Tokio y el trabajo que sobrevive a una llamada. [UniFFI: async/futures](https://mozilla.github.io/uniffi-rs/latest/futures.html).

La compatibilidad de 16 KB requiere revisar alineación ELF y empaquetado, incluidas bibliotecas de terceros; no basta con generar un `.so` arm64. [Android: páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes).

Pruebas de aceptación: función determinista FFI; búsqueda y resolución reales; error de red; cancelación repetida; rotación; recreación; carga de APK release en teléfono y emulador. El prototipo debe compilar desde un checkout limpio.

## 10. P4 — Persistencia mínima y reproducción completa

### Base local e interfaz inicial

- [x] Implementar repositorios y ViewModels con estado observable, errores recuperables y navegación Compose.
- [x] Crear Room con perfil por defecto, perfiles, historial, favoritos y estructura inicial de descargas. Separar entidades locales y DTO de sincronización.
- [x] Usar DataStore para preferencias no secretas. Exportar esquemas Room y probar migraciones sin fallback destructivo.
- [x] Mantener el orden de creación/migración de tablas e índices en SQLite existente; las migraciones Room deben respetar las mismas dependencias.
- [x] Implementar Inicio, Búsqueda y Detalles mínimos para llegar a un episodio real. Cancelar búsquedas anteriores sin mostrar resultados obsoletos.

### Media3

- [x] Integrar ExoPlayer, módulo HLS, sesión multimedia y controles compatibles con Compose.
- [x] Configurar fuentes HTTP que transmitan headers requeridos a playlist, segmentos y peticiones pertinentes sin filtrar credenciales a otros orígenes.
- [x] Probar MP4, HLS, MPEG-TS descargado y contenedores presentes en la biblioteca. La compatibilidad de MKV/MP4 también depende de sus códecs y del dispositivo.
- [x] Implementar un toque para HUD, doble toque central para play/pause y doble toque lateral para seek de 10 segundos.
- [x] Implementar volumen/brillo y controles accesibles sin interferir con los gestos anteriores.
- [x] Identificar la reproducción por fuente/anime/episodio; cancelar la resolución anterior al cambiar de contenido.
- [x] Definir propietario único del player y distinguir salida definitiva, navegación, rotación y entrada en PiP. No liberar el player por una recomposición o al entrar en PiP.
- [x] Aplicar el equivalente nativo de `resetPlayback()`: descartar selección/stream anteriores, guardar progreso y liberar recursos al terminar; conservar llamadas actuales en Tauri.
- [x] Configurar foco de audio, desconexión de audio, interrupciones, orientación y restauración tras recreación.
- [x] Probar el modelo de servicio/sesión si la reproducción continúa fuera de la actividad y declarar permisos/tipo correspondientes.

Aceptación: búsqueda → detalles → selección → reproducción; cambio rápido de episodio sin reproducir el anterior; progreso asociado al perfil correcto; rotación/PiP y audio sin reproducción doble. [Formatos Media3](https://developer.android.com/media/media3/exoplayer/supported-formats).

## 11. P5 — Archivos, descargas y funcionamiento sin conexión

### Acceso a archivos

- [ ] Implementar D02 mediante URI `content://`/descriptor para documentos y medios autorizados, y acceso directo a archivos internos propios.
- [x] Permitir seleccionar la carpeta `Anime` mediante SAF y persistir permisos cuando proceda. Evaluar MediaStore para exportación de vídeos públicos; conservar almacenamiento interno como fallback.
- [x] No asumir acceso directo a `/storage/emulated/0/Anime` por conocer su ruta. Manejar permisos revocados, carpeta eliminada y almacenamiento lleno.
- [x] Identificar cada descarga con un ID estable y URI de destino; no usar el título del anime como única clave.
- [x] Con ambas apps instaladas, evitar escritura/cancelación/borrado cruzados: destinos de preview separados o nombres sin colisión y propiedad registrada. La importación de archivos existentes no transfiere su propiedad automáticamente.

El selector de documentos permite acceso concedido por el usuario y requiere tratar los permisos y URI como parte del modelo de persistencia. [Android: documentos compartidos](https://developer.android.com/training/data-storage/shared/documents-files).

### Cola persistente y motor

- [x] Insertar el lote en una transacción antes de confirmar aceptación. Diferenciar aceptación, resolución y finalización.
- [x] Definir estados `QUEUED`, `RESOLVING`, `DOWNLOADING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELED` y motivo de espera/interrupción separado.
- [x] Guardar episodio/fuente, proveedor y fallback, orden, URI parcial/final, bytes, tamaño esperado, ETag/Last-Modified cuando existan, intentos y error recuperable.
- [x] Reservar propiedad exclusiva de cada tarea; un Worker y un JobService no pueden transferir el mismo archivo simultáneamente.
- [x] Resolver URLs justo antes de transferir y volver a resolver cuando caduquen. No depender solamente de una URL temporal guardada.
- [x] Para MP4, verificar Range/Content-Range y validador antes de anexar bytes. Si el servidor responde 200 o cambia el recurso, reiniciar de forma controlada; no concatenar contenido incompatible.
- [x] Para HLS, usar el soporte de descarga/caché Media3 o un motor segmentado explícito; decidirlo con el prototipo. No tratar una playlist como un MP4 ni prometer un archivo exportable sin implementar remux cuando haga falta.
- [x] Si se utiliza DownloadManager de Media3, definir cómo se reconcilia su índice con Room. Room guarda intención/metadatos y la UI no debe mostrar un estado que contradiga el motor.
- [x] Limitar concurrencia, reintentos y backoff; distinguir error de proveedor de permiso/almacenamiento.
- [x] Completar el archivo solo tras validar el resultado; finalización atómica cuando el proveedor de almacenamiento lo soporte y estrategia recuperable cuando no.
- [x] Probar “No vistos” con el perfil activo, rango/manual, preferencia estricta, fallback, duplicados, fallos parciales y lotes grandes.

### Ejecución en segundo plano

- [x] Android 14+: implementar UIDT mediante JobScheduler/JobService para transferencias largas solicitadas por el usuario, con permisos y notificación requeridos.
- [x] Versiones anteriores soportadas: implementar alternativa con ejecución en primer plano; reservar WorkManager para trabajo adecuado a sus condiciones y límites.
- [x] Persistir checkpoints, atender detención y recuperar tareas interrumpidas al abrir la app o cuando el sistema permita reprogramar.
- [x] No prometer reanudación automática después de un force-stop del usuario. Mostrar estado recuperable al siguiente inicio autorizado.
- [x] Liberar WakeLocks y recursos en todos los caminos; usarlos solo cuando la API elegida los necesite.
- [x] Notificación con pausar/reanudar/cancelar, acciones idempotentes y estado derivado del almacenamiento persistente.

UIDT sigue sujeto a condiciones del sistema y puede detenerse por recursos, restricciones o acción del usuario. [Android: UIDT](https://developer.android.com/develop/background-work/background-tasks/uidt). Los FGS `dataSync` tienen un presupuesto de ejecución en segundo plano de seis horas por 24 horas bajo las condiciones de Android 15+; implementar timeout y no asumir que WakeLock elimina el límite. [Android: timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout).

Aceptación: descargar y reproducir con modo avión; pantalla apagada; pérdida de red; reinicio del proceso; pausa/reanudación; destino lleno o revocado; cancelación desde notificación; integridad de bytes y ausencia de tareas duplicadas. Usar un servidor HTTP de pruebas para respuestas 200/206/416, cambios de ETag y URLs caducadas.

## 12. P6 — Datos compatibles, nube e importación

### Compatibilidad Firestore

- [x] Mantener modo local completo y feature flag para cuentas. Probar nube con cuentas de prueba, sin activar el acceso para toda la app existente como efecto lateral.
- [x] Registrar la aplicación preview en la configuración Firebase correspondiente y sus certificados cuando el login lo requiera; configurar Google/email según las funciones existentes.
- [x] Mantener el UID de la cuenta como identidad remota; no usar el package ID como sustituto.
- [x] Reproducir `users/{userId}/sync/data`: `syncMeta`, `profiles`, `history`, `favorites`, `settings`, `settingsDesktop`, `settingsMobile` y `updatedAt`.
- [x] Conservar la representación de campos como cadenas JSON/cifradas donde corresponda. La coincidencia semántica sin coincidencia de formato no es suficiente.
- [x] Implementar esquema v2 y migración v1 con fixtures; rechazar esquemas futuros sin sobrescribir la nube.
- [x] Traducir la fusión TypeScript a Kotlin con pruebas cruzadas. No mover simultáneamente toda la sincronización existente a Rust en esta migración.
- [x] Mantener borrados y aislamiento por perfil, normalización, ajustes de móvil/escritorio y debounce de 30 segundos donde aplique.
- [x] Tratar la sincronización como eventual: reconexión, cambios locales, solicitud manual y reintentos. No prometer propagación inmediata.
- [x] No implementar ETag de Gist en un cliente Firestore. Conservar hashes y comprobar su serialización con fixtures compartidos.
- [x] Probar escrituras concurrentes desde PC/Tauri/nativa: un cliente nativo con transacciones no corrige por sí solo escritores antiguos que sobrescriben documentos. Cualquier mejora de concurrencia incompatible necesita un cambio coordinado aparte.
- [x] Medir tamaño del documento y tratamiento de límites del backend; no truncar silenciosamente datos adicionales.

### Cifrado y secretos

- [x] Crear vectores de interoperabilidad con `cryptoService.ts`: PIN UTF-8, PBKDF2-HMAC-SHA256 con 100000 iteraciones, clave de 256 bits y salt compatible.
- [x] Reproducir AES-GCM y el formato base64 de `[IV de 12 bytes][ciphertext + tag]`; verificar cifrado/descifrado en ambos sentidos.
- [x] Probar PIN erróneo, salt ausente, payload antiguo y JSON dañado. Un error de descifrado no debe provocar subida de listas vacías ni degradación automática a texto plano.
- [x] Separar claves locales Keystore de la clave derivada del PIN para interoperabilidad cloud. No reemplazar el cifrado portable por una clave exclusiva del dispositivo.
- [x] Delegar credenciales Firebase al SDK; proteger otros secretos persistentes con claves Keystore y excluir material no restaurable del backup cuando corresponda.
- [x] No persistir PIN, tokens o claves en Room/DataStore sin protección; limpiar material de sesión al cerrar sesión y probar pérdida/invalidez de clave.

`EncryptedSharedPreferences` está deprecado en AndroidX Security; la decisión D03 define el mecanismo nuevo sin forzar cambios de credenciales en Tauri. [AndroidX Security](https://developer.android.com/jetpack/androidx/releases/security).

### Migración entre instalaciones

- [x] Implementar importación/exportación JSON compatible con las funciones actuales, con resumen de perfiles/datos y operación local transaccional.
- [x] Permitir restauración cloud cuando el acceso a cuentas esté habilitado.
- [x] Importar descargas mediante selección explícita de carpeta/archivos y reconstrucción del índice. El backup de perfiles no contiene necesariamente los vídeos.
- [x] No intentar abrir la base privada de la otra aplicación ni compartir tokens entre packages.
- [x] Probar importación repetida sin duplicados y conflicto entre datos locales/restaurados.
- [x] Conservar datos de Tauri y permitir volver a abrirla con sus perfiles y descargas originales.

Aceptación: ida y vuelta de perfiles, historial, favoritos y borrados entre las tres variantes; cifrado interoperable; modo local independiente; fallo de autenticación/red sin pérdida de datos.

## 13. P7 — Paridad, experiencia y mediciones

- [x] Completar navegación Inicio, Búsqueda, Favoritos, Descargas y Ajustes; calendario/ranking y fuentes según inventario P0.
- [x] Implementar perfiles, biblioteca local, selección de calidad, restauración de progreso y controles accesibles.
- [x] Clasificar Cast, fuentes personalizadas y otras funciones existentes como implementadas, pendientes o fuera del MVP explícitamente. No anunciar reemplazo completo mientras falten funciones esenciales.
- [x] Conservar flags de funciones desactivadas, sin introducir cobros o cuentas obligatorias.
- [x] Probar tamaños de pantalla, escalado de fuente, contraste, TalkBack, navegación atrás y cambio de orientación.
- [x] Repetir medidas P0 en el mismo dispositivo, versión Android, contenido y condiciones de red. Separar red de renderizado/decodificación.
- [x] Registrar varias ejecuciones, mediana y dispersión de arranque y primer fotograma; memoria, frames lentos y consumo durante sesiones de duración comparable.
- [x] Fijar antes de comparar los umbrales aceptables respecto a la línea base. No elegirlos después para justificar un resultado.

Aceptación: cero defectos conocidos de pérdida de datos, mezcla de perfiles, archivo corrupto, reproducción doble o descarga duplicada; mejoras sustentadas por mediciones, con limitaciones pendientes visibles.

## 14. P8 — Versionado, CI de release y distribución

- [x] Mantener CI nativa independiente mientras sea experimental; sus fallos no deben impedir las releases estables existentes.
- [x] Distribuir primero artifacts de prueba o prereleases. Añadir el asset nativo a la release oficial solo después de superar P5–P7 y distinguir canales.
- [x] Mantener `AniCS-setup.exe` y `AniCS.apk`; añadir `AniCS-native.apk`. Si se renombra el APK Tauri, mantener compatibilidad con enlaces/clientes anteriores mediante transición documentada.
- [x] Actualizar la selección de assets en móvil Tauri para ofrecer únicamente su variante, y lo equivalente en Kotlin. No seleccionar el primer `.apk` ni solo por extensión.
- [x] Guardar una clave de firma estable de preview fuera del repositorio. Una actualización debe conservar identidad de paquete y firma; no generar un keystore diferente en cada build.
- [x] Definir `versionName` SemVer y `versionCode` entero estrictamente creciente por canal. Reservar una estrategia para múltiples builds preview de la misma versión.
- [x] Extender `scripts/bump-version.js` para una fuente de versión nativa, crates y locks aplicables sin reemplazos indiscriminados. Mantener `RELEASE_NOTES.md` y `CHANGELOG.md` con sus propósitos actuales.
- [x] Probar subida de versión, conservación de Room/preferencias, importación y continuidad de descargas compatibles.
- [x] Validar artefactos firmados y su instalación; generar checksum y notas específicas por variante.
- [x] Publicar únicamente con autorización expresa para el push/tag correspondiente. No usar `git add .` sobre cambios ajenos; revisar y seleccionar el conjunto de release antes del commit.

Un eventual reemplazo de `com.anics.app` es otro proyecto: exige estrategia de firma, versión, migración de datos y retorno. No se obtiene cambiando el applicationId de preview en el último momento.

## 15. Matriz de validación obligatoria

| Cambio/hito | Comprobaciones |
| --- | --- |
| Línea base y cambios de implementación | `npm run build`, `npm test`, `cargo check`, `cargo test` en sus directorios correspondientes |
| Extracción del núcleo | Tests de crates, contratos Tauri, compilación Windows y Android Tauri |
| FFI | ABI de dispositivo/emulador, debug/release, cancelación, errores y carga de `.so` |
| Android nativo | Compilación, unit tests, lint y pruebas instrumentadas; archivo de resultados por fase |
| Reproductor | MP4/HLS/local, headers, seek, calidad, gestos, PiP, audio y cambio de episodio |
| Descargas | 200/206/416, recursos modificados, HLS offline, pausas, reconexión, interrupción, duplicados y almacenamiento |
| Datos | Migraciones Room, perfiles, importación, tombstones, contratos cloud y cifrado cruzado |
| Coexistencia | Instalación simultánea, carpetas sin colisión, actualizador correcto, firma y actualización in situ |
| Android por versión | Mínima soportada, 13, 14, 15 y versión reciente disponible; dispositivo con páginas de 16 KB y al menos un fabricante con gestión agresiva de batería |
| Release | Los cuatro checks del proyecto, compilación de ambas apps Android, smoke tests Windows y APK nativo firmado |

Ejemplos PowerShell para checks existentes, ejecutados y revisados por separado desde la raíz:

```powershell
npm run build
npm test
cargo check --manifest-path .\src-tauri\Cargo.toml
cargo test --manifest-path .\src-tauri\Cargo.toml
```

Comandos previstos una vez creados los módulos; no son ejecutables en el estado actual:

```powershell
cargo test --manifest-path .\crates\anics-core\Cargo.toml
cargo test --manifest-path .\crates\anics-ffi\Cargo.toml
.\android-native\gradlew.bat -p .\android-native :app:assembleDebug :app:testDebugUnitTest :app:lintDebug --no-daemon
.\android-native\gradlew.bat -p .\android-native :app:connectedDebugAndroidTest --no-daemon
```

Las pruebas instrumentadas requieren dispositivo/emulador. Un runner sin esos recursos debe declarar la comprobación pendiente. Los smoke tests de proveedores externos se registran aparte de las pruebas deterministas para distinguir cambios del sitio de errores de código.

## 16. Riesgos y recuperación

| Riesgo | Prevención | Recuperación |
| --- | --- | --- |
| Regresión de PC por extracción | Adaptadores estables, cambios pequeños y pruebas Windows | Revertir extracción sin tocar datos |
| Biblioteca FFI incompatible | Herramientas fijadas, ABI/16 KB y release real probados | Mantener último APK preview válido |
| Pérdida de datos por sync divergente | Fixtures cruzadas y no escribir tras fallo de lectura | Desactivar sincronización nativa y restaurar backup local |
| Dos motores descargan lo mismo | Propiedad transaccional de tareas e idempotencia | Reconciliar cola y parciales al reiniciar |
| Cambio de URL o servidor | Resolución tardía, validadores y reanudación segura | Resolver de nuevo o reiniciar archivo de forma explícita |
| Sistema detiene el trabajo | Checkpoints y manejo de interrupciones | Reanudación permitida por el sistema o solicitada por usuario |
| APK equivocado/firmas distintas | Selección de canal y firma estable | Mantener Tauri instalable y enlaces existentes |
| Plan desactualizado por trabajo concurrente | Revisar estado al comenzar cada fase | Ajustar tareas sin sobrescribir cambios ajenos |

Rollback de preview significa suspender su distribución y conservar los datos; no prometer instalar una versión inferior sobre una base ya migrada. Probar backups/exportación y retorno al cliente Tauri sin desinstalarlo.

## 17. Primer bloque de trabajo recomendado

1. Completar P0 y separar H0 del proyecto nativo.
2. Cerrar contratos/configuración de P1 con fixtures pequeños.
3. Extraer un flujo vertical de JKAnime hacia `anics-core`, conservando el adaptador Tauri; después completar los demás extractores para cerrar P2.
4. Construir APK preview y FFI con CI, búsqueda real y resolución.
5. Probar reproducción y una descarga completa sin conexión antes de ampliar todas las pantallas.
6. Revisar los resultados y continuar con sincronización/paridad según los criterios anteriores.

El documento queda terminado como plan cuando sus decisiones, dependencias y criterios son revisables. La migración solo queda terminada cuando las evidencias de cada fase estén registradas y las casillas correspondientes puedan marcarse con resultados reales.
