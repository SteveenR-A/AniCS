# Android nativo — contratos P1 de datos y sincronización

Fecha: 2026-10-02. Referencia ejecutable: `src/services/syncService.ts`, `src/stores/useSyncStore.ts`, `src/services/storageService.ts` y los modelos/SQL actuales. Este bloque define y prueba contratos; no conecta una app nativa a Firestore ni modifica algoritmos de producción.

## Transporte, payload y esquema

La implementación vigente utiliza Firestore: documento `users/{userId}/sync/data`. Los aliases `GistSyncModal`, `GistSyncConfig` y `GistFilesPayload` conservan nombres heredados, no implementan transporte Gist. D01 se cierra actualizando AGENTS y las reglas multiplataforma a esta realidad.

| Campo | Representación |
| --- | --- |
| `syncMeta` | Objeto en backup; JSON string sin cifrar en Firestore |
| `profiles` | Array de `UserProfile`; JSON string o contenido cifrado en Firestore |
| `history` | Array de `HistoryEntry`; JSON string o contenido cifrado |
| `favorites` | Array de resultados con datos por perfil; JSON string o contenido cifrado |
| `settings` | Mapa legacy/activo de strings; JSON string o contenido cifrado |
| `settingsDesktop`, `settingsMobile` | Mapas separados de strings, opcionales en backup; JSON strings o cifrado en Firestore |
| `updatedAt` | Timestamp string del documento Firestore, fuera del payload de backup |

`SyncMeta` contiene `schemaVersion`, `appVersion`, `lastModifiedAt`, `lastModifiedDevice`, hashes de cuatro colecciones, lápidas de favoritos/perfiles/historial, `devices?` y `pbkdf2Salt?`. Los dispositivos registrados actualmente son Windows y Android. Un documento ausente retorna `{ payload: null, notModified: false }`; no equivale a un payload existente vacío. El lector actual siempre retorna `notModified: false`: no existe ETag Firestore en este servicio.

El esquema vigente es 2. `migratePayload()` asume esquema 1 cuando faltan metadatos/versiones. V1 → V2 reemplaza U+FFFD por `e` y recorta títulos, deduplica el historial por clave canónica, crea `deletedHistory: []` si falta y cambia la versión a 2. En duplicados conserva el timestamp mayor; con fechas iguales sustituye solo si el progreso es estrictamente mayor (con progreso igual conserva el primero). No ordena por fecha como parte de esa migración.

V2 se conserva; un esquema superior lanza `SyncSchemaError`. `importPayloadFromJsonString()` parsea JSON y llama a esa migración. El lector Firestore actual no ejecuta migración ni validación estructural completa; el cliente nuevo deberá validar versión/estructura antes de cualquier aplicación local o escritura remota. Una migración que admite metadatos ausentes no constituye validación suficiente de todos los campos del payload.

## Identidad, perfiles y representación de valores

`profileId` particiona historial y favoritos. La fusión usa `profileId || 'default'` para datos legacy; el modelo Rust solo aplica su default cuando el campo se omite. SQLite guarda `profile_id` y claves primarias propias; las claves canónicas cloud no sustituyen automáticamente los IDs SQLite.

| Entidad | Identidad utilizada por la fusión TypeScript |
| --- | --- |
| Episodio de historial | `<título normalizado o URL fallback>::ep<número>::<profileId>` |
| Serie en historial | `<título normalizado o URL fallback>::<profileId>` |
| Favorito | `<URL en minúsculas y trim>::<profileId>` |
| Perfil | `id` |

Normalización cloud: U+FFFD → `e`, minúsculas, Unicode NFD, eliminar U+0300–U+036F y eliminar todo lo que no sea ASCII `a-z0-9`. Si no queda título, usa `animeUrl.toLowerCase().trim()`. No añade el proveedor a la clave: episodios del mismo título/perfil/número pueden deduplicarse entre fuentes. Las URLs de favoritos no se reinterpretan ni se eliminan sus barras finales/query; se aplica solo minúsculas/trim.

Los nombres Unicode se mantienen en los datos visibles. Ejemplos de claves y diferencias actuales con Rust están en `sync-v1.json`: el normalizador SQLite Rust usa una tabla de caracteres, no el mismo algoritmo NFD. `Caram�liser` produce `carameliser` en cloud y `caramliser` en Rust; `Ångström` produce `angstrom` y `ngstrom`. Es una limitación existente que requiere un cambio compatible independiente antes de replicar lápidas/normalización en Kotlin.

Las fechas viajan como strings; los fixtures usan ISO 8601 UTC con milisegundos. El código actual compara mediante `Date.getTime()` y genera escrituras mediante `toISOString()`, con calibración de reloj en memoria. Hay datos legacy con fechas sin hora; deberán admitirse mediante un parser explícito sin convertirlas implícitamente a la zona local. Las fechas inválidas no están validadas exhaustivamente por el servicio actual.

Mapa futuro: strings Kotlin para IDs/URLs/fechas, boolean para `isActive`, `Double` para progreso (0–1), `Long` para número de episodio `u32`, mapas de strings para ajustes y DTO nullable/default para opcionales. Valores como `"true"`, `"2"` o rutas siguen siendo strings de ajustes, no boolean/entero. Diferenciar lista vacía, campo ausente y null; no inventar defaults de datos del usuario tras un error de lectura. Los perfiles importados no obtienen un nuevo ID.

`UserProfile`: `id`, `name`, `avatar`, `color`, `isActive`, `createdAt`. `HistoryEntry`: `id`, título/URL/carátula, número/URL de episodio, progreso, `watchedAt`, fuente y perfil. Favoritos preservan `profileId` y `status`. El campo JSON adicional `addedAt`, si está presente, participa en la fusión de favoritos; el modelo Rust `AnimeResult` y la consulta actual de favoritos para sync no lo exportan, aunque SQLite guarda `added_at`. La prueba Rust caracteriza esa limitación; no convierte la pérdida de ese campo en un requisito nativo.

## Reglas de fusión y borrado

| Área | Comportamiento actual |
| --- | --- |
| Historial | Una fila por clave canónica; fecha más nueva gana aunque tenga menor progreso; con fecha igual gana mayor progreso y, con ambos iguales, gana remoto |
| Orden del historial | Descendente por `watchedAt`; en empates se conserva el orden estable del mapa |
| Duplicados dentro de local | La inserción posterior en el mapa sustituye la anterior; no se hace una selección independiente del máximo timestamp dentro de local |
| Favoritos | Deduplica URL/perfil; el registro local tiene prioridad sobre el remoto, sin comparar fechas de modificación de todos los campos |
| Perfiles | Local tiene prioridad por ID; nuevos perfiles remotos se incorporan con `isActive: false`; lápidas suprimen el ID sin comparar con `createdAt` |

Lápidas locales: `{ id, entityType, entityId, profileId, deletedAt }`. El store las convierte en metadatos cloud: `favorite` → `{ url, profileId, deletedAt }`, `profile` → `{ profileId, deletedAt }`, `history_episode/history_anime/history_clear` → `{ type, key, profileId, deletedAt }`.

Las lápidas de historial pueden afectar episodio, serie o todo el perfil. Se suprime una visualización cuando `watchedAt <= deletedAt + 5000 ms`; el límite es inclusivo. Una nueva visualización a los 5001 ms sobrevive. Los helpers eligen la lápida de fecha máxima para cada clave recibida. Un favorito borrado solo sobrevive si tiene `addedAt` válido estrictamente posterior al borrado; la igualdad no basta. No hay margen de cinco segundos para favoritos.

`mergeSyncData()` retiene lápidas con antigüedad menor que 30 días; a exactamente 30 días se descartan. Ordena/fusiona historial y recorta a los 1500 registros más recientes globalmente, no 1500 por perfil. El recorte cloud no implica borrar historial local. Los hashes de salida quedan vacíos para recalcular después.

La agregación de metadatos en `mergeSyncData()` conserva la última lápida por clave al recorrer local y después remoto; no compara timestamps en esa etapa, a diferencia de los helpers. Un remoto más antiguo puede reemplazar una lápida local más nueva. Esta discrepancia requiere corrección independiente antes de conectar sync nativo; los fixtures normales evitan presentar ese resultado como política deseada.

La fusión no es conmutativa: prioridad local de perfiles/favoritos/ajustes y desempates de historial impiden sustituirla por un algoritmo genérico de última escritura. Tampoco elimina automáticamente toda entidad de un perfil al desaparecer ese perfil; la aplicación local debe respetar su política de borrado transaccional.

## Ajustes por plataforma e historial local

La fusión de ajustes comienza con el mapa remoto de cada plataforma y superpone el mapa local; por último superpone `local.settings` en móvil si `local.syncMeta.lastModifiedDevice === 'android'`, o en escritorio en otro caso. La plataforma actual elige cuál mapa se expone como `settings`. Si ese mapa está vacío, usa `local.settings`. Los dispositivos se fusionan remoto → local.

El guardado Firestore superpone `payload.settings` en el mapa de la plataforma actual. El store conserva el mapa de la otra plataforma y filtra rutas `download_dir` incompatibles al aplicar ajustes cloud: rutas Windows en Android y `/storage`/`/data` en escritorio. La importación offline actual aplica `settings` directamente, sin ese mismo filtro; cualquier mejora debe implementarse en un bloque compatible separado.

`isLocalFileHistory()` reconoce fuente `local`, `local://`, rutas Windows y prefijos `/storage/`/`/data/` en campos relevantes. `useSyncStore` excluye esos registros antes de calcular/subir hashes y de exportar backups. `mergeSyncData()` no realiza esa exclusión por sí mismo; un caller que omite el filtro conserva filas locales. URI Android `content://` no se reconoce por ese helper actualmente: el cliente nativo deberá clasificar sus propias URI locales antes de exportar.

## Hashes, cifrado y ciclo de sincronización

Hashes SHA-256 sobre UTF-8 de `JSON.stringify(profiles/history/favorites/settings)`. No ordena canónicamente claves ni incluye `settingsDesktop`, `settingsMobile`, dispositivos o lápidas en esos cuatro hashes. Igualdad de hashes no demuestra igualdad completa de metadatos. Diferencias de orden/representación JSON importan: Rust puede emitir progreso como `1.0` y JavaScript como `1`. Los tests de datos comparan valor numérico; la interoperabilidad de hashes exige probar bytes exactos antes de P6.

Cifrado actual: PIN codificado UTF-8, PBKDF2-HMAC-SHA256 con 100000 iteraciones y salt de 16 bytes; clave AES de 256 bits. Cada campo de datos cifrado usa AES-GCM con IV aleatorio de 12 bytes y tag de 128 bits. Transporte Base64 estándar de `IV || ciphertext || tag`; el salt viaja Base64 en `syncMeta.pbkdf2Salt`. Metadatos permanecen sin cifrar.

`crypto-v1.json` es un vector sintético con PIN/salt/IV fijos, creado con primitivas de Node y comprobado mediante Web Crypto y Kotlin/JDK. Producción sigue generando IV aleatorio. Se prueban descifrado, layout de cifrado, rechazo de PIN/tag incorrectos y SHA-256 del texto Unicode. Esto verifica formato de bytes y primitivas, no Android Keystore, credenciales reales ni ciclo Firestore con cifrado.

El lector admite campos serializados y objetos legacy. Si hay salt/flag de cifrado solicita clave; puede aceptar JSON plano durante una transición si falla descifrado y el contenido parsea como JSON. Con cifrado desactivado puede retornar defaults para JSON malformado en algunas rutas. El guardado sin clave actualmente puede escribir plano aunque el flag esté activado; el store intenta obtenerla antes. La implementación nativa debe separar vacío de fallo y evitar subir tras una lectura/descifrado inválidos.

Auto-sync vigente: debounce de 30 segundos para cambios y comprobación periódica de 15 minutos con cuenta/autoSync habilitados. Los flags de Auth/suscripción no se activan en este bloque. No se implementa ETag ni se crean cuentas obligatorias.

## Evidencias y próximos bloques

`fixtures/sync-v1.json` contiene reloj fijo, entradas/perfiles/favoritos reutilizables, payloads completos, migraciones v1/v2/futuro/vacío, claves, casos de borrado y resultados de merge PC/Android. Las listas de IDs en casos auxiliares son referencias a los diccionarios del fixture; no son IDs calculados por el algoritmo probado. Los expected se definieron al crear el fixture, sin generarlos ejecutando `mergeSyncData()`.

`syncContract.test.ts` ejecuta el código TypeScript real con reloj/plataforma fijos y Firestore mockeado. `src-tauri/tests/sync_contract.rs` verifica modelos/defaults Rust y registra diferencias existentes. `syncCryptoContract.test.ts` y `scripts/android-native/check-crypto-contract.ps1` ejecutan el mismo vector con Web Crypto y Kotlin/JDK. El jar generado queda en `src-tauri/target/native-contracts/`, ignorado por Git.

Las reglas de merge aún no están implementadas en Kotlin: solo se verifica allí el vector criptográfico. No se declaran probados Room, importación transaccional, cuentas, escrituras reales en nube ni sincronización cruzada de instalaciones. Antes de P6 se deben resolver las limitaciones descritas con cambios compatibles independientes.

Siguiente bloque de implementación: P2, extracción inicial de modelos/configuración y utilidades puras al núcleo compartido, conservando adaptadores Tauri. P0 continúa con sus validaciones Android/dispositivo pendientes y P1 conserva pendiente la aceptación en el cliente Kotlin completo.
