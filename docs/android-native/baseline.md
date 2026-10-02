# Android nativo — línea base P0

Fecha: 2026-10-02 (America/Guatemala).
Commit de referencia: `8c85222bc668a766d8b3add614109228e8d18259`.
Versión existente: `0.2.11`.

La referencia de ejecución es `.agents/tasks/plan-android-native.md`, solicitada por el usuario. Este primer bloque abarca únicamente la inspección P0, sus documentos y un asistente de entorno PowerShell. P0 permanece parcial: faltan compilación Android Tauri y mediciones en dispositivo. No se ha iniciado P1 ni se ha generado un APK nativo.

## Trabajo encontrado antes de comenzar

Los siguientes cambios estaban presentes antes de esta tarea. Su contexto observable es H0 (descargas por lotes); no se puede atribuir su autor a partir del árbol sin confirmar. Se conservan como trabajo previo y no se considera H0 cerrado por haber pasado algunas pruebas.

| Archivos | Contexto observado |
| --- | --- |
| `src-tauri/src/commands/download_cmd.rs` | Encolado por lotes, preferencias de servidor y recuperación de descargas |
| `src-tauri/src/core/anime.rs` | Campo `queue_order` con default para `DownloadTask` |
| `src-tauri/src/downloader/mod.rs`, `queue.rs`, `server_policy.rs` | Cola FIFO, concurrencia y candidatos de servidores |
| `src-tauri/src/storage/database.rs` | Persistencia de reservas de lotes, transacciones y orden de cola |
| `src/components/BatchDownloadModal.tsx`, `BatchDownloadModal.test.tsx` | Selección y validación del lote |
| `src/pages/mobile/MobileDetailsPage.tsx` | Estado visto/progreso de los episodios ofrecidos al modal |
| `src/services/downloadService.ts`, `src/types/index.ts` | Contratos de lote, preferencia/fallback y máximo 5000 |
| `src/stores/useDownloadStore.ts`, `src/stores/__tests__/useDownloadStore.test.ts`, `src/utils/downloadQueue.ts` | Estado de cola y pruebas del cliente |
| `.agents/tasks/plan-android-native.md` | Plan sin seguimiento Git previo a este bloque |

Estado inicial exacto de `git status --short`:

```text
 M src-tauri/src/commands/download_cmd.rs
 M src-tauri/src/core/anime.rs
 M src-tauri/src/downloader/mod.rs
 M src-tauri/src/storage/database.rs
 M src/components/BatchDownloadModal.tsx
 M src/pages/mobile/MobileDetailsPage.tsx
 M src/services/downloadService.ts
 M src/stores/useDownloadStore.ts
 M src/types/index.ts
?? .agents/tasks/
?? src-tauri/src/downloader/queue.rs
?? src-tauri/src/downloader/server_policy.rs
?? src/components/BatchDownloadModal.test.tsx
?? src/stores/__tests__/useDownloadStore.test.ts
?? src/utils/downloadQueue.ts
```

## Herramientas comprobadas

| Herramienta | Resultado local |
| --- | --- |
| Windows / shell | Windows, PowerShell |
| Node / npm | `v24.19.0` / `11.17.0` |
| Tauri CLI | `2.11.4` |
| Rust / Cargo | `1.98.1` / `1.98.1`; único target instalado: `x86_64-pc-windows-msvc` |
| Java / javac | Microsoft OpenJDK `21.0.12.1`, en `C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot` |
| Kotlin CLI | `kotlinc-jvm 2.4.20`, shim Scoop en `C:/Users/herna/scoop/shims/kotlinc.cmd` |
| GNU coreutils | `8.32`, disponibles en `C:/Program Files/Git/usr/bin`; comprobado con `cat.exe --version` |
| Android SDK / NDK | No detectados en variables de entorno ni ubicaciones habituales inspeccionadas |
| Gradle / adb / sdkmanager / cargo-ndk | No disponibles en el PATH inspeccionado |
| Android Tauri generado | `src-tauri/gen/android` no detectado |

Java y coreutils no estaban en el PATH heredado inicialmente. Se verificaron añadiendo sus directorios al proceso PowerShell. Kotlin funcionó después de configurar ese Java. El helper `scripts/android-native/check-environment.ps1 -ConfigureSession` permite repetir esta configuración sin modificar variables permanentes.

Estas versiones describen la instalación local; no fijan todavía la matriz de Gradle/AGP/Kotlin del nuevo módulo. El compilador Kotlin que descargue Gradle será una dependencia fijada del proyecto, independiente del CLI instalado por Scoop.

## Inventario funcional observado

Inventario estático del código actual; no equivale a pruebas de funcionamiento en teléfono.

| Función | Evidencia existente / consideración nativa |
| --- | --- |
| Inicio y episodios recientes | Ruta `/`, `get_latest`, extractores de JKAnime, MundoDonghua y OtakusTV |
| Búsqueda simple/avanzada y géneros | Ruta `/search`, `search_anime`, `advanced_search`, `get_genres` |
| Calendario y ranking | Rutas `/schedule`, `/top`, horario plano/por días y top |
| Fuentes personalizadas | `custom_sources`, fábrica `custom_<índice>` y dominios configurados en SQLite |
| Detalles, episodios y servidores | Rutas `/details`, `get_details`, `get_servers`, `resolve_stream` |
| Reproductor | `PlayerPage.tsx`, estado compartido y gestos descritos en AGENTS; MP4/HLS y resolución Rust |
| Descargas y lotes | Ruta `/downloads`, biblioteca local, controles de cola y máximo de lote 5000 observado; H0 continúa independiente |
| Biblioteca local | Escaneo de carpetas, carátulas y reproducción HTTP local con Range |
| Historial, favoritos y perfiles | Rutas `/history`, `/favorites`; SQLite por perfil y servicios de almacenamiento/perfiles |
| Importación/exportación | `CloudSyncModal.tsx`, `useSyncStore.ts`, backups JSON |
| Nube | Firestore `users/{userId}/sync/data`, esquema v2, cifrado opcional; módulo Auth oculto por flag |
| Cast | `castingService.ts`, `CastDialog.tsx`, backend DLNA y proveedor Google Cast en `scripts/android/` |
| Ajustes y actualizaciones | Dominios, fuentes, descargas, temas/caché y selector de assets APK |

Flags actuales en `src/config/features.ts`: `SHOW_SUBSCRIPTION = false`, `ENABLE_FIREBASE_AUTH = false`, `MASK_SERVERS = false`. El módulo nativo deberá ofrecer modo local y conservar la disponibilidad definida por esos flags.

## Resultados y pendientes

Los resultados de los cuatro checks y las limitaciones de Android se registran en [validation.md](validation.md). Las decisiones y discrepancias están en [decisions.md](decisions.md).

P0 pendiente:

- Identificación del autor/contexto externo de H0: solo se ha identificado su alcance en código.
- Compilar Android Tauri mediante el flujo de `.github/workflows/release.yml` y `scripts/android/`, tras disponer de SDK/NDK y target Rust.
- Inventario de teléfono/emulador y mediciones de arranque, memoria, primer fotograma, seek y descargas de fondo.
- Cierre de las decisiones que requieren reglas documentales y evaluación de dispositivos/herramientas.

Continuación: P1 incorpora contratos de catálogo/configuración en [contracts.md](contracts.md) y datos/sincronización en [sync-contracts.md](sync-contracts.md), con fixtures deterministas. P1 conserva pendiente la aceptación del cliente Kotlin completo. El siguiente bloque previsto es la extracción inicial del núcleo en P2. H0 y Compose/FFI siguen como tareas/fases independientes.
