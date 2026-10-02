# Android nativo — contratos P1 de catálogo y configuración

Fecha: 2026-10-02. Primer bloque de P1, complementado por [sync-contracts.md](sync-contracts.md) para datos/sincronización. Estos contratos preparan P2 y se comprueban sobre los modelos y servicios actuales. La aplicación Kotlin y el adaptador FFI todavía no existen.

## Métodos y comandos actuales

Contrato de `AnimeExtractor` en `src-tauri/src/scrapers/mod.rs`:

| Método | Entrada | Salida / comportamiento actual |
| --- | --- | --- |
| `id` | — | ID del proveedor base: `jkanime`, `mundodonghua`, `otakustv` |
| `name` | — | Nombre visible; no se utiliza como clave |
| `base_url` | — | Dominio/base configurada |
| `search` | Texto | Lista de `AnimeResult` |
| `get_latest` | Página `u32` | Lista de últimos episodios; el comando usa página 1 si se omite |
| `get_schedule` | — | Horario plano como lista de resultados |
| `get_schedule_days` | — | Días con lista `animes`; implementación por defecto agrupa en `Semana` |
| `get_top` | — | Ranking; implementación por defecto llama a `get_latest(1)` |
| `get_details` | URL de serie | `AnimeDetails` con episodios |
| `get_servers` | URL de episodio | Lista de `VideoServer` |
| `resolve_stream` | Servidor | `ResolvedMedia` |
| `get_genres` | — | Lista de `{ name, slug }` |
| `advanced_search` | `SearchFilters` | Página de resultados; por defecto usa búsqueda simple si hay query, sin paginación adicional |

Comandos que deberán conservar nombre/argumentos en Tauri: `search_anime(query, source?)`, `get_latest(source, page?)`, `get_schedule(source)`, `get_schedule_days(source)`, `get_top(source)`, `get_details(url, source)`, `advanced_search(filters, source)`, `get_genres(source)`, `get_sources()`, `get_servers(episodeUrl, source)` y `resolve_stream(server, source)`.

La búsqueda Tauri sin fuente agrega proveedores incorporados y personalizados concurrentemente, omitiendo errores individuales mediante listas vacías. Una fuente explícita inexistente devuelve un error string. Los defaults del trait no garantizan que todos los proveedores tengan la misma capacidad: sus implementaciones sobreescriben métodos y pueden ignorar determinados filtros/páginas.

## CoreConfig: configuración suministrada por cada plataforma

Tipos iniciales en `src-tauri/src/core/catalog_contract.rs`, sin I/O, SQLite, Tauri ni estado global. Todavía no alimentan las fábricas/cliente HTTP existentes. En P2 se trasladarán al crate puro y se conectarán mediante adaptadores.

`CoreConfig` contiene `sources: SourceConfig[]` y `http: CatalogHttpConfig`.

| SourceConfig | Significado |
| --- | --- |
| `id` | Identidad del catálogo: proveedor incorporado o `custom_<índice>` |
| `name` | Nombre visible del proveedor/fuente |
| `extractor` | Parser/resolver a utilizar: `jkanime`, `mundodonghua`, `otakustv` |
| `baseUrl` | URL base suministrada por el adaptador |
| `mirrorUrls` | Fallbacks ordenados; JKAnime intenta primero `baseUrl`, después omite espejos iguales a esa base |

`CoreConfig::from_settings(&HashMap<String, String>)` captura un snapshot independiente. Tauri podrá suministrar su mapa de ajustes; Kotlin suministrará valores equivalentes desde su propio almacenamiento. El núcleo no consultará la base de otra aplicación.

Claves de entrada heredadas: `jkanime_base_url`, `mundodonghua_base_url`, `otakustv_base_url`, `custom_sources`. Los dominios por defecto siguen siendo `https://jkanime.org`, `https://www.mundodonghua.com` y `https://www.otakustv.net`. Espejos JKAnime: `.org`, `.bz`, `.net`, en ese orden. No se normalizan bases ni se elimina una barra final del snapshot.

`custom_sources` sigue siendo JSON de `[{ name, url, type? }]`. Se conserva la selección actual: un tipo que contenga `donghua` elige MundoDonghua; en su defecto `otakustv`/`respaldo` elige OtakusTV; cualquier otro tipo elige JKAnime. Si el JSON o algún elemento completo no es válido, la lista personalizada queda vacía, como en `get_custom_sources()`. No se cambia el esquema almacenado ni se introducen UUID silenciosamente.

La identidad de una fuente personalizada depende actualmente de su posición y puede cambiar al reordenarla. Además, el extractor personalizado actual devuelve en los resultados su ID de proveedor base. `SourceConfig` separa ambas identidades para diseñar la procedencia en P2; este bloque no cambia esos resultados ni reescribe historial/favoritos.

Valores HTTP iniciales equivalentes al cliente de catálogo:

| Campo | Valor |
| --- | --- |
| `requestTimeoutMs` | 20000 |
| `connectTimeoutMs` | 10000 |
| `maxRedirects` | 10 |
| `maxAttempts` | 3, incluyendo el primer intento |

La rotación actual de User-Agent y el backoff/jitter siguen en `http_client.rs`: reintentos 429/5xx y errores de transporte. El cliente de descargas tiene política distinta y queda fuera de `CoreConfig`. Los valores del snapshot aún no configuran peticiones reales; P2 deberá validar parámetros positivos antes de utilizarlos y mantener la política observable del adaptador.

## Contrato JSON de modelos existentes

`serde(rename_all = "camelCase")` se conserva. Fixtures sintéticos, sin tráfico de red ni URLs de producción, en `fixtures/catalog-v1.json`. Son ejemplos del formato de modelos; no son capturas de respuesta de un proveedor ni pruebas de parsers HTML.

| Modelo | Campos actuales |
| --- | --- |
| `AnimeResult` | `title`, `url`, `thumbnailUrl`, `description`, `episode`, `animeType`, `status`, `genres`, `year`, `rating`, `source`, `profileId` |
| `AnimeDetails` | `title`, `url`, `thumbnailUrl`, `synopsis`, `genres`, `status`, `animeType`, `studio`, `duration`, `totalEpisodes`, `season`, `broadcast`, `languages`, `year`, `rating`, `episodes`, `source` |
| `Episode` | `number`, `title`, `url`, `thumbnailUrl`, `watched`, `watchProgress` |
| `VideoServer` | `name`, `url`, `isDirect`, `referer` |
| `ResolvedMedia` | `directUrl`, `mediaType`, `referer`, `userAgent`, `qualities` |
| `MediaType` | `hls`, `mp4`, `unknown`; otros strings no son variantes aceptadas |
| `Quality` | `label`, `url`, `bandwidth` |
| `SearchFilters` | `query`, `genre`, `status`, `animeType`, `year`, `orderBy`, `page` |
| `SearchResultPage` | `results`, `currentPage`, `totalPages`, `hasNext` |
| `GenreItem` | `name`, `slug` |
| `ScheduleDay` | `day`, `animes` |

Los opcionales `None` de `AnimeResult` se omiten al serializar; `thumbnailUrl` omitido se convierte en `""`, `source` omitido en `jkanime`. En los otros modelos los opcionales se emiten como `null`, aunque también pueden faltar al deserializar. Un `Default` de Rust no implica que serde permita omitir campos obligatorios: por ejemplo `SearchFilters.page` es obligatorio en JSON y `SearchFilters::default().page` vale 1 solo al construirlo en Rust.

Los tipos TypeScript actuales usan `?` para muchos campos que Rust emite como `null`. Los tests fijan el JSON real, incluyendo esos nulos; este bloque no modifica la UI ni transforma los valores. Kotlin deberá representar ambos casos como nullable/default apropiado al leer JSON; el DTO de FFI se diseñará en P3 sin cambiar el JSON Tauri.

Números: episodios/páginas son `u32` (0–4294967295), bandwidth es `u64`, rating `f32`, progreso `f64`. El progreso de reproducción se expresa entre 0 y 1; el de descargas usa otra escala (0–100) y no entra en estos fixtures. Los tests de enteros fijan rechazo de negativos, fracciones, strings y overflow de episodios. No añaden validación semántica de progreso ni convierten `totalEpisodes`/`year` a enteros: ambos siguen siendo strings.

Kotlin podrá usar `Long` para `u32`; la representación FFI de `u64` debe conservar su rango mediante el tipo generado correspondiente. JSON/JavaScript no preserva exactamente enteros mayores que 9007199254740991: no reducir silenciosamente el contrato Rust para ocultar esa diferencia. El test Rust de `u64::MAX` verifica el tipo, no compatibilidad numérica de JavaScript. Unicode y saltos de línea se conservan sin normalización. Fechas pertenecen al próximo bloque de datos/sincronización.

## Media y peticiones por origen

La URL de episodio identifica contenido, la URL del servidor identifica un host/player y `directUrl` identifica el recurso reproducible; no son intercambiables. `VideoServer.name` es visible, no un ID estable de proveedor. El catálogo nativo deberá mantener fuente seleccionada y proveedor/resolver separados de estas URLs.

No decodificar ni reconstruir URLs firmadas al transportarlas. Conservar `referer`, `userAgent`, tipo y cada calidad/bandwidth. La ruta directa de `animeService.resolveStream()` para MP4/HLS devuelve `qualities: []`, preserva referer y puede omitir userAgent; el resolver Rust puede emitirlo como null o devolver un valor. Ambas rutas son contratos actuales.

No se añade un mapa genérico de headers/cookies sin un extractor que lo necesite. Cualquier extensión posterior deberá definir el origen autorizado y su propagación a redirects, playlists y segmentos, evitando compartir credenciales entre fuentes.

## Errores tipados y ciclo de vida

`CatalogError { code, message, sourceId? }` define códigos estables `network`, `timeout`, `parse`, `source_not_found`, `server_unavailable`, `cancelled`, `security`, `rate_limit`. El tipo usa datos serializables, sin errores SQLite ni handles de plataforma.

En P2/P3: fallo de transporte → network, timeout identificado → timeout, fallo de parser → parse, lookup de fuente fallido → source_not_found, ausencia de stream resoluble → server_unavailable; rechazo de URL → security y limitación temporal → rate_limit. No clasificar cualquier `NotFound` como fuente inexistente. Los adaptadores conservarán inicialmente errores string de los comandos Tauri. El mapeo todavía no está conectado; los tests solo verifican el formato tipado.

El cliente HTTP actual puede convertir estados HTTP no exitosos en HTML vacío y los extractores pueden devolver listas vacías. No presentar ese comportamiento como propagación de errores HTTP tipados ya implementada; cualquier mejora debe probar compatibilidad y distinguir fallo de fuente de catálogo vacío.

Cada operación futura pertenecerá a una selección de fuente/anime/episodio y un propietario explícito. Al cancelar o sustituir esa selección se descartarán resultados obsoletos. Cancelar coroutine/FFI deberá terminar el trabajo asociado; esta propiedad se implementará y probará en P3/P4.

## Separación de URL remota y medios locales

`validate_url_cached()` combina hoy validación remota de http/https, IP/DNS y una excepción del servidor Tauri local, dependiente de `get_server_port()`/`get_media_token()`. La excepción exige host loopback admitido, puerto actual, ruta `/video` y un único token válido.

Contrato para P2: trasladar validación remota pura al núcleo y mantener autorización local en el adaptador Tauri, con sus pruebas existentes. La configuración de una fuente no autoriza por sí misma su URL. Los scrapers actuales no llaman universalmente a `validate_url_cached()`, por lo que este documento no afirma que toda petición actual use esa protección. No se ha movido ni modificado la política existente en este bloque; la separación ejecutable y sus tests quedan pendientes en P2.

## Comprobación y alcance pendiente

`src-tauri/tests/catalog_contract.rs` comprueba serde de los modelos reales, límites de enteros, snapshots de configuración y códigos de error. `src/services/__tests__/catalogContract.test.ts` consume el mismo JSON mediante los servicios frontend reales con transporte Tauri mockeado. No depende de disponibilidad de sitios externos.

El segundo bloque de P1 añade fixtures de sincronización v1/v2/futuro/vacío/borrados/perfiles/ajustes, claves normalizadas, fechas y semántica real de `mergeSyncData` en [sync-contracts.md](sync-contracts.md). Lectura/merge de payloads por Kotlin, parsers HTML, HTTP y FFI se verificarán en fases posteriores. No se declara P1 aceptado por completo.
