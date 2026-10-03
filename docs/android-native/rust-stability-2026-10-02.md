# Estabilidad del motor Rust — 2 de octubre de 2026

El motor compila y la integración con Tokio funciona en las pruebas, pero hay defectos reproducibles de cierre del proceso, recuperación de descargas y cancelación. No lo consideraría listo para una versión estable hasta resolver los hallazgos R1–R4.

Esta revisión no modifica el código de la aplicación. Las reproducciones se ejecutaron en Windows con servidores HTTP locales y archivos temporales; no se probó una sesión prolongada en un teléfono ni la disponibilidad actual de los proveedores.

## Qué motor usa cada app

| Componente | Tauri móvil / PC | Kotlin móvil |
|---|---|---|
| Catálogo, extractores, HTTP y desofuscación (`anics-core`) | Compartido | Compartido a través de UniFFI |
| Runtime de llamadas nativas (`anics-ffi`) | No | Sí |
| Descargador Rust MP4/HLS, cola y servidor local | Sí | No: usa sus implementaciones Android |
| Persistencia Rust SQLite / keyring | Sí | No: usa Room y repositorios Android |
| Reproducción del video | WebView y reproductor web | Media3 |

Por tanto, un fallo del descargador HLS Rust no explica por sí solo un fallo del reproductor Kotlin. Tampoco se ha demostrado que el cierre al abrir Ajustes provenga de Rust: hace falta la traza de ese cierre en Android.

## Hallazgos, por prioridad

### R1 — P1: un script malformado puede terminar el proceso

Ubicación: `crates/anics-core/src/unpacker.rs:41` y `:57`.

`encode_base(c, a)` divide y vuelve a llamarse con `c / a`. Si `a == 1` y `c >= 1`, el valor nunca disminuye. La base llega desde el script del proveedor y no se valida antes de desofuscar.

**Reproducción:** un bloque Packer con base `1`, contador `2` y diccionario `zero|one` terminó el ejecutable aislado con `STATUS_STACK_OVERFLOW` (`0xc00000fd`). Es un cierre del proceso, no un error de catálogo recuperable. El mismo código se usa en Tauri y Kotlin.

**Resolver:** rechazar bases inválidas antes de la recursión y la desofuscación; acotar contador, diccionario y tamaño de entrada/salida. Añadir una prueba en subproceso que compruebe que una entrada inválida devuelve un error sin terminar el proceso.

### R2 — P1: la recuperación HLS puede publicar archivos corruptos como completados

Ubicación: `src-tauri/src/downloader/hls_engine.rs:180`, `:259`, `:338` y `:356`.

Se escribe cada segmento directamente en su nombre definitivo y, al reanudar, basta con que su tamaño sea mayor que cero para darlo por terminado. Un cierre durante la escritura deja un fragmento incompleto que ya no se descarga. Además, el ensamblado añade bytes al `.part` antes de guardar `assembled_count`; ese registro no es atómico y su error se ignora. Si el proceso se interrumpe entre ambas operaciones, se añade otra vez el mismo segmento.

**Reproducciones:**

- Un fragmento guardado de **1 byte** más otro de 12 000 bytes produjo un archivo de 12 001 bytes con resultado `Completed`, sin consultar los servidores.
- Simular el cierre después de añadir el primer segmento pero antes de guardar el contador produjo **36 000 bytes**, cuando los dos segmentos sumaban 24 000. También devolvió `Completed`.

**Resolver:** guardar segmentos mediante temporal y renombrado; vincularlos al manifiesto y la calidad elegidos. Registrar offsets confirmados del ensamblado y truncar el `.part` al último offset confirmado al recuperar. Propagar errores del checkpoint y verificar integridad antes de declarar completada la descarga.

### R3 — P1: pausar o cancelar puede tardar minutos y perderse en el último lote HLS

Ubicación: `src-tauri/src/downloader/hls_engine.rs:217`, `:251`, `:315`; `src-tauri/src/commands/download_cmd.rs:818` y `:1082`.

HLS consulta la señal antes de cada lote y luego espera todas sus tareas sin escuchar la cancelación. Cada fragmento puede consumir ocho intentos de 45 segundos más las esperas: aproximadamente **385 segundos** en ese recorrido. Si la señal llega durante el último lote, el motor pasa a ensamblar y puede terminar como completado. El comando de pausa espera al worker, por lo que la interfaz sigue esperando también.

**Reproducción:** enviar pausa cuando el servidor ya había recibido la petición del único segmento no detuvo el worker y terminó en `Completed`.

MP4 sí escucha cancelación mientras lee el cuerpo, pero no durante conexiones ni las esperas entre reintentos. HLS tampoco escucha la señal durante el análisis del manifiesto o el ensamblado.

**Resolver:** usar una señal compartida en preparación, conexión, lectura, reintentos y ensamblado. Cancelar y esperar las tareas hijas antes de devolver. Comprobar la señal antes de publicar el archivo final.

### R4 — P1: una playlist puede bloquear indefinidamente un turno de descarga

Ubicación: `src-tauri/src/downloader/hls_engine.rs:395–402` y `src-tauri/src/scrapers/http_client.rs`.

El timeout de 30 segundos cubre `req.send()`, que termina cuando llegan las cabeceras. El posterior `resp.text().await` no está dentro del timeout; `DOWNLOAD_CLIENT` tampoco tiene un límite global de lectura. Si el servidor envía cabeceras y mantiene el cuerpo detenido, la tarea retiene su turno y la pausa espera al worker.

**Reproducción:** un servidor local envió cabeceras válidas sin cuerpo. La lectura seguía pendiente a los **32 segundos**, más allá del timeout de 30 segundos. La prueba abortó sus propias tareas al terminar.

**Resolver:** aplicar el límite al envío y a la lectura completa del manifiesto; acotar bytes y escuchar cancelación en ambas fases. Los segmentos ya tienen un timeout que incluye el cuerpo.

### R5 — P2: los fallos HTTP pueden parecer catálogos vacíos

Ubicación: `crates/anics-core/src/http.rs:78–80`, `crates/anics-ffi/src/lib.rs:398` y `src-tauri/src/commands/anime_cmd.rs:36`.

`fetch_html` devuelve `Ok("")` ante un estado HTTP no exitoso, incluso después del último reintento de 429/5xx. Los parsers que aceptan HTML vacío pueden devolver listas vacías. La búsqueda agregada también sustituye errores de cada fuente por listas vacías, por lo que no distingue ausencia de resultados de indisponibilidad de todas las fuentes.

**Reproducción:** HTTP **403** devolvió una cadena vacía como éxito.

**Resolver:** conservar el estado HTTP en un error tipado; devolver resultados parciales con errores por fuente. Si fallan todas, informar del fallo y permitir reintentar. Controlar las tareas de búsqueda para que cancelar la operación también cancele sus hijos.

### R6 — P2: el lector de credenciales puede ocultar un fallback que sí existe

Ubicación: `src-tauri/src/storage/secure_store.rs:37`.

La escritura puede recurrir a `sync_config`, pero la lectura devuelve `None` inmediatamente cuando el keyring responde `NoEntry`, sin consultar ese fallback. Esto permite aparentar que una credencial guardada desapareció.

**Reproducción:** guardar un valor de prueba, sin una credencial real, en `_sec_<clave única>` y consultar el lector devolvió `None`, aunque la entrada SQLite existía. Además, `test_secure_store_roundtrip` falla en este Windows: esperaba un valor y recibió `None`. Esta prueba adicional demuestra el camino de lectura defectuoso; no establece por sí sola la causa exacta del fallo del roundtrip.

**Resolver:** diseñar una migración consistente al almacenamiento seguro y distinguir ausencia de credencial de fallo del proveedor. El contrato del proyecto exige evitar secretos en SQLite en texto plano; el fallback Android de Tauri también necesita cumplirlo. Google/Auth permanece desactivado por decisión del usuario.

### R7 — P2: el servidor local acepta rangos inválidos

Ubicación: `src-tauri/src/downloader/media_server.rs:355` y `:449`.

**Reproducciones:** `bytes=-0` sobre 100 bytes devuelve `(100, 99)`; pedir un sufijo de un archivo vacío devuelve `(0, 0)`. El primer caso produce un intervalo invertido que puede provocar underflow en la resta del manejador en builds con comprobación aritmética. En el manejador local, otros rangos no satisfacibles caen a una respuesta completa `200`, mientras el manejador DLNA sí responde `416`.

**Resolver:** rechazar sufijos cero y cualquier rango sobre un archivo vacío; asegurar `start <= end < size` y responder `416` a rangos no satisfacibles. Como mejora adicional del protocolo, leer las cabeceras hasta su terminador, con límites de bytes y tiempo: actualmente se interpreta un único `read`, aunque TCP puede dividir una petición.

### R8 — P2: completar una descarga sobrescribe sus contadores con datos antiguos

Ubicación: `src-tauri/src/commands/download_cmd.rs:501` y `:553`.

**Inspección estática:** el evento final reutiliza `downloaded_bytes` y `total_bytes` del registro cargado antes de descargar. El forwarder persiste ese evento. Una descarga nueva puede terminar con progreso 100 % y bytes guardados en cero, aunque el archivo tenga datos.

**Resolver:** obtener el tamaño real del archivo final y persistir estado, bytes y total de manera consistente antes de emitir la finalización. Añadir una prueba de integración del worker y su persistencia.

### R9 — P2: faltan límites de trabajo y memoria para datos de proveedores

Ubicación: `crates/anics-core/src/unpacker.rs:41`, `crates/anics-core/src/scrapers/jkanime.rs:1127–1131`, `crates/anics-core/src/http.rs:83`.

**Inspección estática:** el contador del Packer puede ordenar miles de millones de iteraciones; el total de episodios recibido se usa directamente para reservar y generar un vector; el HTML se lee sin límite de bytes. Estos recorridos pueden consumir CPU o memoria excesivas ante respuestas inesperadas. No se provocó un agotamiento de memoria durante esta revisión.

**Resolver:** límites explícitos por tipo de respuesta, paginación de episodios y presupuesto de desofuscación. Separar parsing pesado del executor asíncrono; un timeout asíncrono no interrumpe un bucle síncrono que no cede ejecución.

## Validación y aspectos que funcionan

| Comprobación | Resultado |
|---|---|
| `cargo check --manifest-path src-tauri/Cargo.toml` | Correcto |
| Tests `anics-core` | 10 correctos |
| Tests `anics-ffi` | 4 correctos |
| Tests de biblioteca Tauri | 38 correctos, 1 fallo de credenciales Windows |
| Contratos de catálogo y sincronización Tauri | 12 correctos |
| Reproducciones adicionales | 7 correctas, documentando los defectos actuales |
| Script Packer inválido, en ejecutable aislado | Cierre con stack overflow confirmado |

Las siete reproducciones usan aserciones del comportamiento defectuoso para documentarlo. Que pasen **no significa que los defectos estén corregidos**. El ejecutable del stack overflow es una reproducción separada.

La prueba de UniFFI llama la ABI real desde un executor extranjero, sin un Tokio externo, y realiza HTTP correctamente. La cola usa tickets y libera turnos por RAII; sus pruebas verifican orden, concurrencia y cancelación de espera. MP4 comprueba `Content-Range`, usa el offset real de disco y reinicia cuando el servidor ignora Range. SQLite supera las pruebas existentes de migración y reserva transaccional de lotes; el arranque convierte descargas interrumpidas a pausadas.

No se ejecutaron los tests de `scraper_tests.rs` contra proveedores externos. Tampoco hubo cambios de frontend que requirieran repetir su build. Los archivos de reproducción quedaron en directorios ignorados:

- `src-tauri/target/stability-audit/rust_stability_audit.rs`
- `crates/anics-core/target/stability-audit/rust_stability_probe.rs`

Para repetirlos, copiar temporalmente el primero a `src-tauri/tests/` y el segundo a `crates/anics-core/examples/`, y ejecutar el test y el example por nombre. El example debe seguir ejecutándose en su propio proceso.

## Orden de resolución

1. Validación del desofuscador y recuperación íntegra de HLS (R1–R2).
2. Cancelación efectiva y límites de lectura completos (R3–R4).
3. Errores visibles, credenciales, rangos y contadores (R5–R8).
4. Límites de CPU/memoria y pruebas en Android con cambios de red, background, poco espacio y cierres durante la descarga (R9).
