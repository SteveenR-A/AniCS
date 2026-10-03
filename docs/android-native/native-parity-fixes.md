# Correcciones de la preview nativa — 2026-10-02

La app sigue separada de Tauri: paquete `com.anics.app.preview` (debug: `.debug`) y base Room independiente. Seleccionar la misma carpeta permite compartir videos, pero Android no permite abrir directamente la base privada de otra app. Los perfiles/favoritos/historial/ajustes se transfieren mediante un respaldo JSON exportado desde Tauri.

## Cambios

- UniFFI exporta las operaciones async con `async_runtime = "tokio"`. La prueba llama a la ABI real desde un hilo sin Tokio y ejecuta HTTP contra un servidor local, reproduciendo el contexto de las coroutines Kotlin.
- Los insets del Scaffold exterior se consumen antes de los Scaffold de las pantallas. El reproductor mantiene sus propios insets. Los ViewModels usan Lifecycle y las peticiones de Inicio/Buscar se cancelan cuando se sustituyen.
- Las 13 paletas de Tauri son seleccionables y persistentes. Las pantallas usan MaterialTheme para texto, superficies y navegación, incluido el tema claro.
- Buscar explora el catálogo sin exigir texto, permite recargar/reintentar/paginar y expone género por fuente; JKAnime también estado, tipo, año y orden. Solo se muestran filtros implementados por cada extractor. El núcleo respeta año/orden aun cuando hay consulta textual.
- Respaldo compatible con esquema 1/2, validación antes de aplicar, fusión transaccional Room, claves canónicas NFD, fechas ISO, progreso fraccional, perfiles/colores/IDs y campos adicionales. Se almacenan lápidas y se filtra el historial de archivos locales para la nube. Se mantienen la prioridad local y los ajustes separados de PC/móvil.
- Favoritos y Continuar viendo siguen el perfil activo. El reproductor guarda progreso cada 10 s, al salir y al pasar a segundo plano. La reproducción online usa la calidad seleccionada y el siguiente episodio respeta servidor preferido/fallback.
- Descargas permite elegir una carpeta SAF y escanear recursivamente videos completos existentes, incluida la estructura Tauri `Anime/<serie>/Ep001.mp4`. Se omiten archivos parciales y rutas ya registradas; los IDs se derivan de la URI. Quitar una entrada completada de la lista conserva el archivo compartido. Descargar un episodio ya presente reutiliza el video sin sobrescribirlo.
- Offline usa un servidor HTTP en 127.0.0.1 con token de sesión, lista de archivos autorizados, GET/HEAD y Range. Reanuda con el progreso del archivo o del mismo título/episodio importado.
- Las descargas MP4 se conectan al servicio Android y a la carpeta SAF elegida. Pausa/reanuda actúan sobre el trabajador real; se valida la respuesta Range y no se marca un archivo truncado como completo.
- El actualizador consulta GitHub Releases al iniciar y desde Ajustes, selecciona únicamente AniCS-native.apk y comprueba tamaño/hash disponible, paquete, versionCode y firma antes de abrir el instalador Android. Si pide habilitar “Instalar apps desconocidas”, después se vuelve a pulsar Instalar. La versión/código Android derivan de package.json.

## Transferir datos y reutilizar videos

1. En Tauri, exportar el respaldo JSON desde sus opciones de datos/sincronización.
2. En la app nativa, Ajustes → Datos y sincronización → Importar; elegir el JSON y seleccionar el perfil correspondiente.
3. En Descargas → Elegir carpeta, conceder acceso a la carpeta Anime que usa Tauri. El escaneo comienza al elegirla; Buscar videos lo repite después.
4. El acceso a la carpeta es propio de esta instalación. Importar un JSON o una ruta de PC no concede permisos SAF ni copia videos.

## Cuentas opcionales

BuildConfig.ENABLE_FIREBASE_AUTH permanece en false. No hay inicio de sesión obligatorio ni sincronización automática mientras esté desactivado. Hay un adaptador Google Credential Manager/Firebase Auth y Firestore, con controles condicionales para iniciar sesión/sincronizar/cerrar sesión. Al habilitarlo se necesitan VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID y VITE_GOOGLE_WEB_CLIENT_ID, además de registrar el paquete/certificado Android y el cliente OAuth correcto en Firebase/Google. Las variables se toman del entorno de build o .env.local; no se añaden secretos al repo.

El adaptador consulta users/{uid}/sync/data directamente del servidor, admite campos JSON serializados y objetos legacy, rechaza lecturas/descifrados inválidos antes de escribir, conserva settingsDesktop/settingsMobile y preserva PBKDF2/AES-GCM si el documento ya está cifrado. El PIN se introduce por sesión y no se almacena. Google/Firestore real no se han probado con una cuenta; El modo de cuentas permanece desactivado por petición del usuario. La implementación de auto-sync/debounce periódico queda pendiente de un bloque posterior; el adaptador actual ofrece sincronización manual.

## Firma y actualizaciones

El workflow acepta ANICS_NATIVE_KEYSTORE_BASE64, ANICS_NATIVE_STORE_PASSWORD, ANICS_NATIVE_KEY_ALIAS y ANICS_NATIVE_KEY_PASSWORD para producir releases nativos con una clave estable. Sin esos secretos sigue generando la preview debug. Las claves debug creadas por runners distintos pueden cambiar: el actualizador rechaza esas firmas. Para pasar de una preview firmada con otra clave a una instalación estable se debe exportar el respaldo y reinstalar. No se han creado claves, configurado secretos ni publicado releases en este cambio.

GitHub Pages puede enlazar al APK de los releases, pero el actualizador funciona sin una página intermedia. Un dominio como anics.io requiere tener ese dominio y configurar DNS; no se ha creado ni publicado una página.

## Límites de validación

Se comprueban compilación Kotlin y 13 pruebas JVM de contratos/streaming, build y 195 tests frontend, cargo check Tauri/FFI, 4 pruebas FFI (incluida ABI sin Tokio) y 12 contratos Rust. Las bibliotecas Rust se reconstruyen para ARM64 y x86_64 con NDK r26b. La prueba Tauri de keyring test_secure_store_roundtrip conserva su fallo previo documentado (38 pruebas unitarias pasan y 1 falla); no se modifica el almacenamiento de PC para ocultarlo. No se han ejecutado UI instrumentada, dispositivo, permisos SAF reales, instalación de actualizaciones ni Google/Firestore de producción.

Las descargas HLS permanecen pendientes: la UI pide un servidor MP4 y evita guardar una playlist como video. Compilar solo Kotlin no reconstruye las bibliotecas FFI.

## APK generado originalmente

`android-native/app/build/outputs/apk/debug/AniCS-native.apk`, paquete `com.anics.app.preview.debug`, versión `0.3.0-preview`, código `3000`, 34 654 138 bytes. `assembleDebug` y las 13 pruebas JVM pasan. Se verifica la firma con apksigner, las ABI ARM64/x86_64 con aapt y la presencia de JNA. Los hashes de ambas bibliotecas Rust empaquetadas coinciden con las bibliotecas recién compiladas.

El artefacto de esa ruta se reemplaza al compilar nuevamente. La revisión posterior de interfaz/reproductor está documentada en native-ui-player.md; sus pruebas y metadatos del APK corresponden a la compilación actual.

SHA-256: `a28060b612cfd3bc9ead70a3dcf8333056e4fed9837aa973e4ec5036da34257e`.

Este APK de desarrollo usa la clave debug local y conserva la versión del proyecto: no constituye un release publicado. Si la preview instalada tiene otra firma, Android exigirá una reinstalación; conservar primero los datos mediante un respaldo. No se realiza git push.
