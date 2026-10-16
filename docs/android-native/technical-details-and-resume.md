# Ficha técnica y continuación por historial — 16 de octubre de 2026

## Ficha técnica Kotlin

`AnimeTechnicalDetails` se muestra entre las acciones principales y la sinopsis.
Usa los datos existentes de `NativeAnimeDetails`, sin modificar Rust ni UniFFI:

- Total de episodios declarado por el catálogo, con fallback al número disponible.
- Estudio, duración y audio cuando tienen contenido.
- Temporada, o emisión si el catálogo no proporciona temporada.
- Si no hay episodios ni total, distingue «Por estrenar» de «Desconocido».

Las tarjetas usan iconos Lucide, colores con variantes claras/oscuras, texto sin
elipsis y columnas adaptadas al ancho y a la escala de letra. El generador de
iconos incorpora `Layers`; no se editó manualmente el vector generado.

## Botón principal en las tres interfaces

Las fichas de PC, Android Tauri y Android Kotlin seleccionan a partir del
historial del perfil activo y ordenan los episodios por número:

| Historial | Acción |
| --- | --- |
| Sin historial del anime | Reproducir episodio 1, o el primero disponible |
| Último episodio 4 incompleto | Reanudar episodio 4 |
| Último episodio 4 completado | Continuar episodio 5, si está disponible y pendiente |
| Sucesores ya completados | Continuar en el siguiente disponible pendiente |
| Sin sucesor disponible | Volver a ver el último episodio |
| Sin episodios disponibles | Reproducción deshabilitada |

Para esta selección, un progreso de al menos 90 % cuenta como completado.
Kotlin también respeta la marca persistida `completed` y calcula la fracción
desde posición/duración para registros sin `watchProgress`. No cambia el criterio
de las estadísticas ni los indicadores existentes de otras pantallas.

La selección usa el último registro cronológico, admite historial local con el
mismo título/temporada y compara URLs canónicas. No mezcla perfiles ni títulos
de temporadas distintas. En Kotlin se conservan títulos Unicode al compararlos.

Tauri consulta el historial completo, evitando perder series antiguas por el
límite anterior de 500 registros. El hook descarta respuestas anteriores al
cambio de perfil, actualiza al recuperar el foco y tras sincronizar, y bloquea
el botón durante la carga. Si falla SQLite ofrece reintentar el historial en
lugar de iniciar silenciosamente el episodio 1.

## Validación

| Comprobación | Resultado |
| --- | --- |
| `npm test` | 39 archivos, 291 pruebas correctas; 19 nuevas en este bloque |
| `npm run build` | Correcto, con aviso de tamaño del reproductor |
| `npm run lint` | Sin errores, 79 avisos pendientes |
| `cargo check --offline --locked` en `src-tauri` | Correcto |
| `cargo test --offline --locked` en `src-tauri` | 92 pruebas correctas |
| `DetailsPlaybackTest` en JVM | 7 pruebas correctas |
| Pruebas Compose y compilación APK | Pendientes por el entorno Android |
| `git diff --check` | Correcto |

La comprobación JVM compiló los archivos reales `anics_ffi.kt`, `HistoryEntity.kt`,
`DetailsPlayback.kt` y `DetailsPlaybackTest.kt`, sin modelos sustitutos, usando
el compilador Kotlin 1.9.24 distribuido con Gradle 8.10.2 y JUnit 4.13.2. Se
añadieron JNA 5.14.0, Coroutines 1.9.0 y Room Common 2.6.1 en `/tmp` desde sus
repositorios oficiales. Este resultado verifica la política de continuación;
no sustituye la compilación Android con Kotlin 2.0.21 ni las pruebas de Compose.

El intento de `testDebugUnitTest assembleDebug --offline --no-daemon` descargó
Gradle a `/tmp/anics-gradle`, pero no pudo resolver el plugin Android 8.7.0 sin
dependencias previamente cacheadas. Tampoco se encontró un SDK Android
configurado. Las tres pruebas nuevas de `AnimeTechnicalDetailsTest` cubren
campos presentes/ausentes y pantalla estrecha con letra grande; quedan para el
entorno Android o el workflow nativo existente. No se generó un APK.

Rust se ejecutó con permiso para servidores locales y un bus D-Bus de prueba
aislado; no se valida la integración con un llavero interactivo. No se hicieron
commits, push, cambios de versión ni publicación.
