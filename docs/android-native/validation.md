# Android nativo — comprobaciones P0/P1

Fecha: 2026-10-02. Árbol de trabajo y referencia en [baseline.md](baseline.md).

## Checks iniciales ejecutados antes de cambios de implementación

| Comando | Resultado |
| --- | --- |
| `npm run build` | Correcto; advertencias de chunks grandes e imports dinámicos/estáticos coexistentes |
| `npm test` | Correcto: 22 archivos, 145 pruebas |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Correcto |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Fallo: 42 pruebas correctas, 1 fallida de 43 |

Fallo observado: `storage::secure_store::tests::test_secure_store_roundtrip`, en `src-tauri/src/storage/secure_store.rs:82`. La lectura devolvió `None` después de guardar el secreto de prueba. El fallo se produjo antes de añadir cualquier documento/helper de este bloque; no es una regresión de la migración. Su causa no está determinada por esta inspección y no se ha modificado el almacenamiento para hacer pasar el test.

La compilación de tests Rust también emitió un aviso del linker sobre generación de `.dll.lib`/`.dll.exp`; la compilación terminó y el fallo corresponde a la ejecución del test indicado.

## Entorno Windows

Ejecutar desde la raíz en PowerShell:

```powershell
# Inspecciona sin alterar el entorno.
.\scripts\android-native\check-environment.ps1

# Habilita Java y los coreutils encontrados en este proceso de PowerShell.
.\scripts\android-native\check-environment.ps1 -ConfigureSession
java --version
javac --version
kotlinc -version
cat.exe --version

# Exige JDK + SDK + NDK cuando se prepare la compilación Android.
.\scripts\android-native\check-environment.ps1 -RequireAndroid
```

El helper no instala herramientas, acepta licencias ni cambia PATH/JAVA_HOME permanentes. Busca JDK en JAVA_HOME, PATH y directorios habituales de Microsoft/Java/Adoptium; coreutils junto a Git; SDK en ANDROID_HOME/ANDROID_SDK_ROOT y ubicaciones habituales. Un resultado vacío significa que no lo detectó, no demuestra que no exista en otro directorio.

Validación del helper ejecutada: sintaxis PowerShell correcta; inspección sin cambios en PATH/JAVA_HOME; configuración de sesión con `java`, `kotlinc` y `cat.exe` ejecutables; `-RequireAndroid` rechaza correctamente los requisitos incompletos detectados. `git diff --check` terminó correctamente.

Usar `cat.exe`, `ls.exe`, `cp.exe`, etc. con extensión en PowerShell para evitar sus alias. `rg` está disponible para búsqueda. Las operaciones destructivas siguen las reglas de seguridad de Windows.

## Validación Android pendiente

No se ejecutó compilación Android Tauri porque no se detectaron SDK/NDK, herramientas SDK ni target `aarch64-linux-android`. El flujo a reproducir sigue siendo `.github/workflows/release.yml`, con generación Tauri y parches mantenidos en `scripts/android/`; no se sustituyó por un árbol generado manualmente.

No hay APK nativo, wrapper Gradle ni bibliotecas FFI en P0. No se han comprobado instalación simultánea, reproducción, páginas de 16 KB, firma ni minificación. Tampoco se han realizado mediciones en teléfono o pruebas instrumentadas; falta un dispositivo de referencia.

P0 queda parcial. P1 puede avanzar con contratos y fixtures de catálogo sin esperar mediciones, manteniendo visibles los requisitos pendientes y sin declarar aceptados P2/P3.

## P1 — Primer bloque: catálogo/configuración

Contrato y alcance en [contracts.md](contracts.md). Se añadieron tipos puros `CoreConfig`, `SourceConfig`, `CatalogHttpConfig` y `CatalogError`, fixtures de JSON y tests sobre modelos Rust y servicios frontend actuales. Las fábricas de extractores y el cliente HTTP aún no utilizan la nueva configuración; ese cableado pertenece a P2.

Resultados del bloque, 2026-10-02:

| Comando | Resultado |
| --- | --- |
| `cargo test --manifest-path src-tauri/Cargo.toml --test catalog_contract` | Correcto: 8 pruebas de contratos/configuración |
| `npm test -- src/services/__tests__/catalogContract.test.ts` | Correcto: 5 pruebas; se ejecutaron después también dentro de la suite completa |
| `npm run build` | Correcto tras cargar el fixture mediante import `?raw`; advertencias habituales de bundles/imports |
| `npm test` | Correcto: 23 archivos, 151 pruebas en el árbol actual |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Correcto |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 42 unit tests correctos y el mismo fallo previo de `test_secure_store_roundtrip`; aborta antes de ejecutar integration tests |
| `rustfmt --check --edition 2021 src-tauri/src/core/catalog_contract.rs src-tauri/tests/catalog_contract.rs` | Correcto |
| `git diff --check` | Correcto |

La compilación frontend detectó inicialmente que las APIs `node:fs`/`node:path` usadas para cargar el fixture no estaban incluidas en los tipos del proyecto. Se corrigió el propio test usando la carga de texto de Vite; la configuración TypeScript de la aplicación permanece intacta.

Los 8 integration tests nuevos de Rust sí se ejecutaron con su comando específico. No se presenta la suite completa como aprobada ni se excluye silenciosamente su test fallido. El total frontend describe el árbol de trabajo actual, incluyendo H0; este bloque añade 5 pruebas frontend.

Fixtures JSON comprobados por Rust y TypeScript: serialización camelCase, opcionales omitidos/null, Unicode, progreso fraccional, orden de episodios, MP4/HLS/unknown, referer/User-Agent y URLs firmadas, límites de enteros, configuración de dominios/fuentes y errores exportables. No se han ejecutado parsers de sitios, peticiones reales ni un cliente Kotlin.

P1 conserva pendiente la aceptación del cliente Kotlin completo. El bloque de datos/sincronización se registra a continuación; P0 mantiene pendientes la compilación Android Tauri y las mediciones en dispositivo.

## P1 — Segundo bloque: datos/sincronización

Contrato en [sync-contracts.md](sync-contracts.md). Se añadieron fixtures de migración y fusión, pruebas de los servicios actuales y un vector de cifrado comprobado mediante Web Crypto y Kotlin/JDK. D01 se cerró actualizando las reglas al transporte Firestore vigente. No se modificaron los algoritmos de sync/almacenamiento de producción ni se realizaron escrituras en nube.

Resultados del bloque, 2026-10-02:

| Comando | Resultado |
| --- | --- |
| `npm test -- src/services/__tests__/syncContract.test.ts src/services/__tests__/syncCryptoContract.test.ts` | Correcto: 44 pruebas nuevas |
| `cargo test --manifest-path src-tauri/Cargo.toml --test sync_contract` | Correcto: 4 pruebas nuevas |
| `.\scripts\android-native\check-crypto-contract.ps1` | Correcto: 4 comprobaciones Kotlin/JDK sobre el mismo vector de cifrado |
| `npm run build` | Correcto; advertencias habituales de bundles/imports |
| `npm test` | Correcto: 25 archivos, 195 pruebas |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Correcto |
| `cargo test --manifest-path src-tauri/Cargo.toml --no-fail-fast` | 42 unit tests pasan y persiste el fallo previo de keyring; 8 contratos de catálogo y 4 de sync pasan; scraper_tests: 2 pasan, 13 fallan |
| `rustfmt --check --edition 2021 src-tauri/tests/sync_contract.rs` | Correcto |
| Parser PowerShell del verificador y `git diff --check` | Correctos |
| `git check-ignore src-tauri/target/native-contracts/sync-crypto-contract.jar` | Jar generado confirmado como ignorado |

El modo `--no-fail-fast` permite ver los targets existentes que el fallo de keyring impedía ejecutar en comprobaciones anteriores. Las pruebas de proveedores externos en `src-tauri/tests/scraper_tests.rs` son pruebas online, distintas de los fixtures deterministas. MundoDonghua/OtakusTV muestran conexiones TCP denegadas por el entorno (Windows 10013 / PermissionDenied); JKAnime devuelve listas vacías/NotFound tras sus fallbacks. No se ha verificado disponibilidad real de los proveedores ni se atribuyen esos resultados a una extracción de scrapers: esa extracción aún no se ha realizado.

El verificador Kotlin usa el compilador Scoop y el JDK encontrados por el helper de entorno. Recibe texto de prueba mediante Base64 UTF-8 para preservar comillas/Unicode al pasar argumentos por PowerShell. Genera su jar únicamente bajo `src-tauri/target/native-contracts`, sin dependencia de SDK Android. La prueba Rust compara el valor numérico de progreso `1`/`1.0` y conserva los demás campos; esa diferencia de serialización sigue documentada para los hashes.

La fusión completa todavía se prueba en TypeScript, y los modelos/defaults en Rust. En Kotlin solo se comprueba el vector criptográfico, no el merge, Room o Firestore. Las diferencias de normalización, metadata de favoritos y agregación de lápidas se registraron para bloques compatibles independientes antes de P6. No se ha cambiado la política de producción para hacer pasar estos fixtures.

Siguiente bloque previsto: extracción inicial de modelos/configuración y utilidades puras en P2. P0 continúa parcial; tampoco se declara aceptado P1 en un cliente Kotlin completo que aún no existe.
