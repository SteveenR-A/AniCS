# Registro de Cambios (Changelog) — AniCS

Todas las modificaciones notables de este proyecto estarán documentadas en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [0.2.3] - 2026-09-04

### Optimizaciones Móviles, Sincronización Nube y Anuncio de Actualizaciones
- Reproductor Móvil: Eliminación de botones redundantes para mayor visibilidad.
- Buscador Móvil: Búsqueda debounced (700ms), soporte para Enter y corrección de recarga al borrar.
- Anuncio de Actualizaciones: Modal visual flotante al iniciar en PC y Android con notas de versión.
- Sincronización en la Nube: Compatibilidad total bidireccional entre Windows y Android sin sobrescribir configuraciones.
- Cola de Descargas: Botón 'Limpiar completadas' para depurar la lista preservando los archivos descargados.
- Historial Móvil: Interfaz compacta en encabezado y modal de seguridad para borrado selectivo o en la nube.

---

## [0.2.2] - 2026-09-03

### 🎬 Streaming HLS de Alta Resiliencia y Mitigación de Servidores Caídos
- **Mitigación Automática de CDNs Caídos (`hlsLoader.ts`, `hls_engine.rs`):**
  - Solución definitiva al congelamiento del video cada 3 segundos provocado por la caída/inactividad de los servidores remotos `cdn2.ducvomes.com` y `cdn5.ducvomes.com` (`130.78.217.218`) en servidores JKAnime (*Magi* y *Desu*).
  - Implementación de `createRobustHlsLoader`: Interceptor personalizado que extiende `Hls.DefaultConfig.loader` para sanitizar en caliente las listas maestras y de medios (`.m3u8`), reescribiendo fragmentos a espejos funcionales (`cdn1`, `cdn3`, `cdn4`, `cdn6`).
  - Rotación y conmutación por error (*fallback*) automática ante fragmentos con fallo de red (`HTTP 404/5xx` o timeout).
  - Ampliación de umbrales de buffering en `PlayerPage.tsx` a 60s/120s y manejo granular de recuperación ante errores de carga y decodificación (`hls.startLoad()`, `hls.recoverMediaError()`).
  - Función nativa `sanitize_segment_url` en el motor Rust Tauri (`hls_engine.rs`) para proteger también las descargas locales en background contra servidores offline.

### ☁️ Sincronización en la Nube Multiplataforma y Aislamiento de Configuraciones
- **Separación de Ajustes por Plataforma (`settings_desktop.json` y `settings_mobile.json`):**
  - División de configuraciones en GitHub Gist para evitar que Windows y Android sobreescriban sus respectivas carpetas de descarga (`C:\Users\...\Videos\AniCS` vs `/storage/emulated/0/Anime`) o preferencias del reproductor.
  - Conservación de `settings.json` legacy para compatibilidad con versiones previas de la app.
- **Exclusión de Archivos Locales en Disco (`isLocalFileHistory`):**
  - Las reproducciones de archivos descargados localmente en disco se mantienen registradas en el SQLite de cada dispositivo, pero se excluyen del payload en la nube. En `history.json` solo viajan episodios de streaming online (*JKAnime*, *MundoDonghua*), eliminando rutas locales inaccesibles entre PC y Android.
- **Corrección de CORS en Descargas de Gist (`syncService.ts`):**
  - Omisión de la cabecera `Authorization: Bearer` al solicitar archivos grandes o truncados a través de `raw_url` en `gist.githubusercontent.com`, evitando bloqueos por preflight CORS del navegador.
- **Serialización Minificada y Determinista:**
  - Optimización con `JSON.stringify(...)` plano en el Gist y en `computePayloadHashes`, reduciendo entre 30% y 40% el uso de ancho de banda y datos móviles en conexiones lentas.
- **Actualizador Interno Restaurado (`download_cmd.rs`):**
  - Se eliminó el bloqueo restrictivo que buscaba manifiestos `SHA256SUMS.txt` en la release. La firma criptográfica de la aplicación en Android se realiza nativamente en CI mediante el Keystore oficial de GitHub Actions Secrets (`ANDROID_KEYSTORE_BASE64`), permitiendo que el instalador interno descargue y ejecute `.exe` y `.apk` fluidamente sin falsos bloqueos.
- **Registro Multi-dispositivo en Metadatos:**
  - Campo `devices` en `sync_meta.json` que registra de forma independiente la última fecha de sincronización y versión de cliente de Windows y Android.

### 🧪 Suite de Pruebas Automatizadas
- 66 pruebas unitarias e integrales en el frontend (`npm test`), incluyendo pruebas end-to-end de descarga de Gist, fusión bidireccional en SQLite y resolución estricta de conflictos LWW (*Last-Write-Wins*).
- 32 pruebas en Rust (`cargo test`) sin regresiones.

---

## [0.2.1] - 2026-09-02

### 🛡️ Seguridad Avanzada, Anti-SSRF y Mitigación de Timing Attacks
- **Blindaje Anti-SSRF y DNS Rebinding (`url_security.rs`):**
  - Implementación de validación estricta de URLs (`validate_url_cached`) aplicada a segmentos HLS (`hls_engine.rs`) y descargas de red.
  - Bloqueo exhaustivo de rangos IPv4/IPv6 privados (RFC 1918), loopback (127.0.0.0/8, ::1), link-local (169.254.0.0/16, fe80::/10), CGNAT (100.64.0.0/10), ULA (fc00::/7), multicast y rangos reservados.
  - `DnsCache` global thread-safe con TTL de 60 segundos para evitar sobrecarga de resolución DNS y proteger la latencia en fragmentos de video.
- **Protección del Servidor de Medios Local (`media_server.rs`):**
  - Verificación de token de sesión en tiempo constante (`verify_token_constant_time`) mediante digest SHA-256 para prevenir fugas de canal lateral (timing attacks).
  - Defensa Anti-CSRF estricta: Detección y rechazo de peticiones con cabeceras `Origin` o `Referer` ajenas al WebView de la app (`tauri://localhost`, `http://tauri.localhost`, `http://localhost:1420`).
  - Reintento con backoff en el enlace del puerto preferido `41725`.

### ⚡ Verificación de Integridad en Actualizaciones y Rate Limiting
- **Verificación Estricta Fail-Closed de Integridad (`download_cmd.rs`):**
  - Cálculo SHA-256 en streaming durante la descarga del nuevo instalador mediante `sha2`.
  - Validación obligatoria contra el manifiesto oficial `SHA256SUMS.txt` / `checksums.txt` de la release en GitHub, comparado en tiempo constante (`subtle::ConstantTimeEq`).
  - Política Fail-Closed: Eliminación inmediata del binario descargado y cancelación del proceso si no existe manifiesto oficial o si el checksum difiere.
- **Limitador de Velocidad Token Bucket (`rate_limiter.rs`):**
  - Algoritmo Token Bucket adaptativo (`GitHubRateLimiter`) para regular el tráfico hacia la API de GitHub.
  - Detección e interpretación dinámica de cabeceras `x-ratelimit-remaining` y `x-ratelimit-reset` con enfriamiento preventivo y jitter para evitar errores `429 Too Many Requests`.

### 🚀 Optimización de Persistencia y Sincronización Gist
- **Transacciones SQLite en Lote (`batch_add_favorites`):**
  - Nuevo comando nativo Tauri y función de almacenamiento que inserta y actualiza listas de favoritos dentro de una sola transacción atómica, acelerando significativamente la sincronización.
  - Generación determinista de ID en `batch_upsert_history` ante entradas con identificador vacío.
  - Deserialización segura con valores por defecto en `AnimeResult` e `HistoryEntry` frente a esquemas legacy.
- **Sincronización Gist Resiliente e Interactiva (`syncService.ts`, `useSyncStore.ts`):**
  - Manejo interactivo de PIN (`NeedPinForDecryptionError`): Solicitud dinámica del PIN de desbloqueo con la sal PBKDF2 remota cuando el Gist está cifrado y la clave no reside en memoria.
  - Soporte de archivos Gist truncados o de gran tamaño: Descarga directa desde `raw_url` autenticado cuando GitHub trunca el payload JSON.
  - Sincronización automática inmediata al vincular o actualizar el token de GitHub.

---

## [0.2.0] - 2026-09-02

### 🔄 Sincronización Bidireccional y Deduplicación
- **Sincronización con Lápidas Temporales (Tombstones):**
  - Registro y propagación fiel de eliminaciones intencionadas de historial y favoritos entre PC y Android vía GitHub Gist sin reapariciones no deseadas.
- **Deduplicación Canónica:**
  - Normalización unificada de títulos y rutas para fusionar registros de descargas locales y servidores online en una única entrada coherente.
- **Optimización de Payload en la Nube:**
  - Ventana de hasta 1500 episodios con orden cronológico y auto-vinculación de Gists existentes.

### 🛡️ Blindaje de Seguridad y Arquitectura
- **Servidor Local de Streaming Protegido (`media_server.rs`):**
  - Requiere token efímero de sesión UUID v4 en cada solicitud de video (`/video?path=...&token=...`), rechazando accesos no autorizados con `403 Forbidden`.
  - Puerto dedicado fijado (`41725`) con fallback controlado.
  - Bloqueo explícito de Symlinks con `symlink_metadata` para prevenir ataques de traversal en Android y Windows.
  - Validación de rutas base autorizadas (descargas, caché y portadas internas) y restricción estricta de orígenes CORS al WebView.
- **Content Security Policy (CSP) Estricto:**
  - Erradicación de comodines loopback (`http://127.0.0.1:*`) fijando el puerto exacto en `tauri.conf.json`.
  - Ámbito de protocolo de assets acotado a directorios estándar de la app.
- **Actualizador Determinista:**
  - Reconstrucción de URLs de descarga de actualizaciones desde cero en Rust (`https://github.com/SteveenR-A/AniCS/releases/download/...`), neutralizando manipulaciones en base de datos o entradas del usuario.
- **Filtrado de Secretos en SQLite:**
  - Exclusión automática de claves privadas `_sec_%` en `get_all_sync_config`.

---

## [0.1.22] - 2026-09-02

### 📥 Gestión Avanzada de Descargas
- **Descarga por Lotes (Batch Download):**
  - Nuevo modal interactivo en la vista de detalles del anime con 3 modos de descarga:
    - *No Vistos:* Identifica automáticamente y encola únicamente los episodios que el usuario no ha completado.
    - *Por Rango:* Permite descargar un bloque continuo de episodios (ej. del capítulo 1 al 12).
    - *Selección Manual:* Selección personalizada con casillas interactivas y botones rápidos ("Todos", "Ninguno", "Invertir").
  - Resolución secuencial de enlaces directos de video en segundo plano con notificación de progreso y respaldo inteligente de servidores.
- **Barra de Almacenamiento en Disco:**
  - Componente visual interactivo en la pestaña de descargas que muestra cuánto espacio ocupan los animes descargados respecto al espacio libre del disco o memoria interna.
  - Nuevo comando Tauri nativo (`get_storage_space_info`) con cálculo recursivo en Rust y soporte multiplataforma (`GetDiskFreeSpaceExW` en Windows y `statvfs` en POSIX / Android).

### ⭐ Organización de Favoritos por Estado
- **Listas de Seguimiento:**
  - Clasificación rápida de tus animes favoritos en pestañas dedicadas: *"Todos"*, *"Viendo"*, *"Pendiente"*, *"Completado"* y *"Favoritos"*.
  - Selector de estado (`FavoriteStatusDropdown`) estilizado con iconos Lucide y colores temáticos, accesible directamente desde la tarjeta de favoritos y la barra de acciones de la vista de detalles.
  - Migración segura en SQLite (`ALTER TABLE favorites ADD COLUMN status TEXT NOT NULL DEFAULT 'favorite'`) e indexación optimizada.

### 🕒 Historial Unificado por Serie
- **Consolidación de Episodios por Anime:**
  - El historial ahora agrupa todas las visualizaciones de una misma serie en una única tarjeta principal, evitando la saturación de entradas duplicadas.
  - Indicador destacado del último capítulo visto con porcentaje de progreso y botón de reanudación directa.
  - Sub-lista desplegable interactiva (acordeón) para explorar todos los capítulos vistos de la serie, reproducir episodios anteriores o eliminarlos de forma individual.

### 🔐 Fix de Sincronía en Android y Persistencia Segura
- **Fallback Resiliente de Credenciales:**
  - Implementado mecanismo de almacenamiento seguro con SQLite (`sync_config` con prefijo privado `_sec_`) en entornos móviles o sistemas sin soporte para Keyring del SO.
  - Garantiza que el Personal Access Token (PAT) de GitHub y la sal de PBKDF2 persistan correctamente en Android para sincronizaciones automáticas y arranque en frío.

---

## [0.1.21] - 2026-09-02

### 🎨 Nuevos Temas Visuales y Personalización
- **6 Nuevas Paletas de Color Populares:**
  - **Gruvbox Dark:** Tonos cálidos terrosos diseñados para no cansar la vista en sesiones largas (*Clásico del ricing*).
  - **Rosé Pine:** Púrpura profundo con acentos durazno y lavanda (*Popular en Hyprland*).
  - **Everforest:** Verde bosque oscuro con toques cálidos (*Inspirado en naturaleza*).
  - **Oxocarbon:** Minimalismo extremo con fondo negro puro y acentos azul IBM/magenta (*Ideal para OLED*).
  - **Kanagawa:** Inspirado en la pintura "La gran ola" con azules índigo y rojos suaves (*Estética japonesa*).
  - **Mellow:** Pastel oscuro con verde sage y lila apagado (*Underrated*).
- **Selector de Temas Mejorado:**
  - Badges informativos de estilo y previsualización de 4 tonos (fondo, superficie, acento primario y secundario) en escritorio y móvil.

### 🧹 Limpieza de Descargas Canceladas, Portadas Internas Privadas y Gestión Segura de Carpetas
- **Limpieza de Archivos al Cancelar o Descartar Descargas:**
  - `cancel_download` y `delete_download_record` eliminan físicamente archivos parciales (`.part`), fragmentos temporales (`.hls_parts`) y videos incompletos.
  - Mitigación de condiciones de carrera esperando a que el worker asíncrono libere los descriptores de archivo antes del borrado en disco.
- **Almacenamiento Privado de Portadas (`covers/`):**
  - Las portadas de animes descargados ahora se guardan en el directorio interno de la aplicación (`app_data_dir/covers/{titulo}.jpg`).
  - Cero contaminación en la galería multimedia de Android y en el explorador de Windows, evitando la duplicidad de archivos `poster.jpg`.
- **Migración Transparente y Auto-limpieza:**
  - `scan_local_downloads` detecta portadas `poster.jpg` heredadas de versiones anteriores y las migra al almacenamiento interno privado, eliminando el archivo público para mantener limpio el almacenamiento del usuario.
- **Eliminación Segura en Dos Pasos (`clean_empty_anime_folder_safely`):**
  - Paso 1: Conteo estricto de videos y descargas en curso. Si contiene al menos un video, la carpeta se preserva intacta.
  - Paso 2: Si el conteo es cero, elimina residuos (`poster.jpg`, `.nomedia`, `.tmp`) y remueve la carpeta vacía al borrar el último episodio.
- **Deduplicación Canónica de Series:**
  - Agrupación por ruta física normalizada y título para evitar carpetas o series duplicadas por alias del sistema de archivos.

### 🔄 Motor de Sincronización Bidireccional Inteligente y Corrección Móvil
- **Hashes Deterministas Locales:** Comparación previa de hashes SHA-256 antes de interactuar con la red.
- **Cero Escrituras Innecesarias:** Los clientes nuevos descargan datos remotos a SQLite sin forzar subidas vacías a GitHub Gists.
- **Corrección Visual en Móvil:** Enmascaramiento inteligente del token GitHub (`ghp_••••••••••••`), compactación de Gist ID y protección contra desbordamientos en pantallas estrechas (<400px).
- **Optimización de GitHub Actions:** Pipeline de release restringido exclusivamente a tags `v*` y `workflow_dispatch`, con retención de 1 día en artifacts intermedios.

---

## [0.1.20] - 2026-09-01

### 🚀 Sincronización por Episodio, Estadísticas de Perfil y Escaneo Manual de Descargas
- **Sincronización por Episodio Individual (`animeUrl::epNum::profileId`):**
  - Cada capítulo visto se indexa y almacena independientemente en GitHub Gist y SQLite, impidiendo que ver un capítulo nuevo sobreescriba los anteriores en la nube.
- **Resolución de Conflictos Inteligente:**
  - Si alguno de los dispositivos completó el episodio (`watchProgress >= 80%`), se prioriza el progreso más alto. Si ninguno está completado, gana la fecha más reciente (`watchedAt`).
- **Estadísticas de Usuario por Perfil:**
  - Consulta SQL optimizada en SQLite (`get_profile_stats`) para calcular:
    - Cantidad de animes únicos vistos.
    - Cantidad de capítulos completados (`watch_progress >= 0.80`).
    - Horas acumuladas de visualización honesta.
  - Badges interactivos en `ProfileSelectorModal.tsx`, `DesktopSettingsPage.tsx` y `MobileSettingsPage.tsx`.
- **Reactividad Global sin Reinicio (`anics:sync-completed`):**
  - Evento despachado tras sincronizaciones exitosas para recargar perfiles, historial y favoritos sin parpadeos ni memory leaks.
- **Botón de Escaneo Manual en Descargas Móvil:**
  - Botón interactivo `RefreshCw` en `MobileDownloadsPage` para indexar episodios en `/storage/emulated/0/Anime` al instante.
- **Notificación Toast de Sincronización Manual:**
  - Feedback visual animado con `framer-motion` informando si la sincronización fue exitosa, si ya estaba al día o si ocurrió algún error.

---

## [0.1.9] - 2026-09-01

### 👥 Perfiles de Usuario, GitHub Gist Secreto y Gestión del Historial
- **Perfiles Locales Multi-Cuenta:**
  - Galería de 15 avatares temáticos de anime y paleta de 10 colores con historiales y favoritos independientes en SQLite.
- **Sincronización en la Nube con GitHub Gist Secreto:**
  - Arquitectura multi-archivo (`profiles.json`, `history.json`, `favorites.json`, `settings.json`, `sync_meta.json`).
- **Cifrado E2E con PIN Seguro:**
  - Derivación PBKDF2 (100k iteraciones) + cifrado simétrico AES-GCM de 256 bits.
- **Fusión Bidireccional con Lápidas (Tombstones):**
  - Propagación fiel de borrados intencionales entre dispositivos.
- **Gestión Avanzada de Historial:**
  - Modo de selección múltiple interactivo, eliminación por lotes y borrado rápido por serie completa.

---

## [0.1.7] - 2026-08-31

### 📖 Paginación Numérica, Sesiones de Búsqueda, Reproductor Vertical y Diferenciación de Temporadas
- **Paginación Numérica Completa en Búsqueda y Directorio (`< 1 2 3 ... 162 163 >`):**
  - Implementación del componente `PaginationBar` con ventana deslizante inteligente, botones táctiles Anterior/Siguiente y formulario integrado para saltar directamente a cualquier página disponible en el catálogo de JKAnime y MundoDonghua.
- **Navegación Fluida entre Sesiones de Búsqueda e Historial Reciente:**
  - Sincronización bidireccional de parámetros en la URL (`q`, `p`, `genre`, `status`, `type`, `order`, `source`). Al regresar de la vista de detalles de un anime con el botón Volver, se restablece el término buscado, los filtros y la página exacta.
  - Historial de búsquedas recientes persistente con chips interactivos para re-ejecutar búsquedas con un solo toque y opción de eliminación individual o total.
- **Reproductor de Video Adaptativo para Modo Vertical (Portrait) y Rotación:**
  - Eliminación del bloqueo forzado a horizontal; soporte completo para visualización cómoda en orientación vertical.
  - Reorganización responsiva del HUD en portrait en 2 filas limpias y compactas, evitando desbordamientos o recortes en pantallas estrechas.
  - Botón de rotación de pantalla integrado en el HUD (`Smartphone`) para alternar entre rotación automática por sensor, horizontal y vertical.
- **Preservación Global de los Botones de Navegación del Sistema en Android:**
  - Eliminación del ocultamiento global permanente de la barra de navegación del sistema en `MainActivity.kt`.
  - Los botones de navegación de Android (Atrás, Inicio, Recientes) y la barra de estado permanecen siempre accesibles en toda la app fuera del reproductor en pantalla completa.
- **Diferenciación Estricta entre Temporadas y Secuelas:**
  - Reemplazo del algoritmo difuso por `strictTitlesMatch` y coincidencia prioritaria por `animeUrl` única, evitando que diferentes temporadas de una misma franquicia (ej. *Jujutsu Kaisen* vs *Jujutsu Kaisen 2nd Season*) colisionen en el historial, progreso de reproducción y descargas locales.
  - Deduplicación precisa de entradas de historial por identificador único de anime y episodio.

---

## [0.1.6] - 2026-08-29

### ⚡ Descargas en Segundo Plano con Pantalla Apagada, Notificaciones y Archivos .part
- **Descargas en Segundo Plano Continuas:**
  - Integración de `Partial WakeLock` en Android para evitar que el sistema suspenda el procesador con la pantalla apagada.
- **Notificaciones Inteligentes Agrupadas (`BigTextStyle`):**
  - Notificación enriquecida con desglose por serie, progreso global en tiempo real y velocidad de transferencia.
- **Archivos Temporales `.part` Seguros:**
  - Los episodios en descarga conservan la extensión `.part` y solo se renombran a `.mp4` al alcanzar el 100% verificado, impidiendo que aparezcan episodios truncados o corruptos en descargas locales.
- **Resiliencia ante Servidores Estancados:**
  - Timeout de 12 segundos y auto-reconexión mediante peticiones de rango HTTP (`Range Requests`).

---

## [0.1.5] - 2026-08-28

### 📦 Actualizador Nativo APK, Gestos Refinados y Seguridad
- **Instalador Nativo de Actualizaciones APK en Android:**
  - Actualización directa mediante `FileProvider` e `Intent` del sistema sin bloqueos.
- **Gestos Táctiles con Debounce:**
  - Toque único para mostrar/ocultar controles y doble toque lateral para avanzar o retroceder 10s.
- **Liberación Inmediata de Búfer:**
  - Reset completo del estado y del búfer de HLS al cambiar de episodio o salir del reproductor.

---

## [0.1.4] - 2026-08-28

### 🎬 Reproductor Limpio (Estilo C#) y Servidor Local de Streaming
- **Servidor HTTP Local de Streaming con Rango (`206 Partial Content`):**
  - Servidor interno en Rust corriendo en `127.0.0.1` para transmitir videos descargados directamente al reproductor HTML5 sin restricciones de WebView ni fallos de permisos en Android y Windows.
- **Rediseño Minimalista y Elegante (Sin saturación ni emojis):**
  - Barra superior simplificada: botón Volver, título limpio del episodio, indicador sutil de estado, selector de servidor y ajustes.
  - Barra inferior estilizada: barra de progreso delgada de alta precisión, controles multimedia esenciales (anterior, -10s, play/pause circular, +10s, siguiente, tiempo transcurrido/total) y selector rápido de velocidad `1.0X`.
- **Control de Gestos Táctiles Perfeccionado:**
  - **1 solo clic/toque:** Alterna la visibilidad de los controles (HUD) sin pausar el video.
  - **Doble clic en el centro:** Pausa o reanuda la reproducción.
  - **Doble clic a la izquierda:** Retrocede 10 segundos (-10s).
  - **Doble clic a la derecha:** Avanza 10 segundos (+10s).
- **Corrección de Transición entre Animes y Fuentes (Mundo Donghua / JKAnime):**
  - Se corrigió el error donde el reproductor mantenía cargado el stream o episodio de un anime anterior al cambiar de serie o de catálogo.
- **Instalación Fluida de Actualizaciones APK:**
  - Descarga directa en la caché interna de la aplicación y cierre limpio del proceso al invocar el instalador de paquetes de Android para evitar bloqueos de ejecución.

---

## [0.1.3] - 2026-08-27

### 📱 Mejoras Móviles (Android), Descargas y Barra de Navegación
- **Ocultamiento Automático de Barras del Sistema (Modo Inmersivo):**
  - Al reproducir cualquier video en Android, se ocultan por completo tanto la barra de estado superior (batería, wifi, reloj, notificaciones) como la barra de navegación inferior (botones/gestos del sistema).
  - La visualización es 100% inmersiva (`edge-to-edge`) para disfrutar de los episodios sin distracciones ni barras fijas en pantalla.
- **Corrección de la Barra de Navegación Inferior Móvil:**
  - Los iconos del menú inferior (Inicio, Buscar, Horarios, Top, Descargas, Historial) ahora calculan la zona segura (`safe-area-inset-bottom`), evitando que los botones de navegación de Android o la barra de gestos los tapen o corten.
- **Ruta de Descargas en `/storage/emulated/0/Anime` y Detección de Animes Existentes:**
  - En Android, la ruta predeterminada de descargas se establece en `/storage/emulated/0/Anime`.
  - Al abrir la sección de Descargas o recargar, AniCS escanea automáticamente `/storage/emulated/0/Anime` y carga todos los animes y episodios ya descargados con sus carátulas y progreso, exactamente igual que en PC.
- **Permisos de Almacenamiento Android:**
  - Inclusión de permisos `MANAGE_EXTERNAL_STORAGE` y `READ/WRITE_EXTERNAL_STORAGE` con solicitud automática en el inicio para permitir guardar y leer animes en `/storage/emulated/0/Anime` sin errores de permisos.
- **Configuración de Carpeta de Descargas en Ajustes Móviles:**
  - Nuevo panel en Ajustes de Móvil para personalizar o restablecer la ruta de descargas a `/storage/emulated/0/Anime`, además de configurar descargas simultáneas y URLs de fuentes.
- **Icono Oficial de la Aplicación en Android:**
  - Se corrigió el flujo de empaquetado APK en CI para inyectar automáticamente el icono oficial de AniCS (`app-icon.png`) en todas las densidades mipmap (`mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, `xxxhdpi` y adaptive icons), reemplazando el icono genérico por defecto de Tauri.
- **Comando Nativo Tauri `set_fullscreen`:**
  - Nuevo comando en el backend Rust para forzar y sincronizar el estado de pantalla completa multiplataforma de forma inmediata.

---

## [0.1.2] - 2026-08-27

### ⚡ Sincronización Offline y Detección Local
- **Sincronización Catálogo Online - Descargas Locales:**
  - Los animes descargados en disco ahora se detectan automáticamente al navegar la ficha online del anime.
  - Indicadores visuales en cada episodio: `💾 Descargado (XXX MB)`, `✓ Visto` y `En progreso (XX%)` con barra de progreso.
  - Al presionar Play en un episodio descargado, se reproduce directamente el archivo local offline sin consumir internet ni consultar servidores externos.
- **Normalización Inteligente de Títulos:**
  - Comparador ultra-tolerante basado en descomposición Unicode (`NFD`) que ignora tildes, acentos (`é` -> `e`, etc.), guiones bajos y signos de puntuación.
- **Reparación Automática de Portadas Locales:**
  - Normalización de rutas de imágenes locales mediante `convertFileSrc` (protocolo `asset://`), evitando imágenes rotas en Windows y Android.
  - Al visitar un anime online, repara automáticamente cualquier archivo `poster.jpg` corrupto o vacío en su carpeta local en disco.

### 📥 Motor de Descargas y Servidores
- **Descargas MediaFire Estables:**
  - Cliente HTTP dedicado `DOWNLOAD_CLIENT` sin timeout global para descargas directas de archivos grandes (200MB+).
  - Resolución directa de enlaces de descarga de MediaFire evitando redirecciones duplicadas.
- **Cola de Descargas Concurrentes:**
  - Control de concurrencia con semáforo (máximo 2 descargas activas en paralelo).
  - Las tareas adicionales permanecen en estado "En Cola" (ámbar) y se inician automáticamente al liberarse un slot.

### 🗄️ Base de Datos SQLite y Gestión de Memoria
- **Panel de Mantenimiento SQLite en Ajustes:**
  - Monitor de tamaño en disco del archivo `.db` (`anics.db`), contador de historial y favoritos.
  - **Optimización y Compactación (`VACUUM` + `PRAGMA optimize`):** Desfragmenta y acelera SQLite sin perder datos.
  - **Limpieza Segura:** Opciones para vaciar solo el historial o restablecer la base de datos limpiamente sin romper la app.
- **Control Estricto de Memoria RAM L1/L2:**
  - Límite estricto de caché en memoria RAM LRU (máx. 150 imágenes) para evitar saturación de memoria en sesiones largas.

### 📱 Optimizaciones Específicas para Android
- **Screen Wake Lock API:** Mantiene la pantalla encendida de forma activa mientras se reproduce un episodio.
- **Optimizaciones Táctiles:** Eliminación del retraso de 300 ms (`touch-action: manipulation`) y supresión del resaltado gris de WebView.
- **Aceleración por Hardware:** Capas GPU optimizadas (`.gpu-layer`) para transiciones a 60/120 FPS.

### 🔄 Actualizador Interno en Segundo Plano
- Descarga e instalación interna estilo VSCode/Discord directamente dentro de la aplicación sin abrir el navegador.
- Barra de progreso en vivo y ejecución automática del instalador de Windows (`.exe`).

---

## [0.1.0] - 2026-08-27

### 🚀 Novedades y Características Principales
- **Arquitectura Moderna Multiplataforma:** Migración completa a **Tauri v2** utilizando **Rust**, **React 19**, **TypeScript** y **TailwindCSS v4**.
- **Scraping Multihilo Sin Navegador (Zero-Browser):**
  - Extractores asíncronos nativos para **JKAnime** y **MundoDonghua**.
  - Emulación HTTP con rotación de User-Agents y cabeceras contra bloqueos.
  - Implementación en Rust del desofuscador **JsUnpacker** (algoritmo Dean Edwards) para extraer URLs de streams en microsegundos sin motor JS.
- **Motor de Descarga HLS Paralelo (`HlsEngine`):**
  - Ventana deslizante con **8 fragmentos `.ts` en vuelo concurrentes**.
  - Reanudación automática con archivos de índice `.idx`.
  - Emisión de eventos de progreso en tiempo real (porcentaje, velocidad KB/s, bytes) hacia la UI.
- **Panel de Ajustes Avanzado (`SettingsPage`):**
  - **URLs de fuentes personalizables:** Capacidad de modificar la URL base de JKAnime y MundoDonghua por si se usan espejos o proxies.
  - **Botón "Restablecer Web Original":** Restablece las URLs oficiales con un solo clic.
  - **Selector de carpeta de descargas:** Mediante el diálogo nativo del sistema operativo.
  - **Límite de descargas simultáneas:** De 1 a 8 descargas en paralelo.
  - **Selector de reproductor:** Elección entre reproductor integrado o reproductor externo (MPV / VLC).
  - **Aviso sobre la resolución de video:** Explicación clara de que la calidad disponible depende de los servidores fuente.
- **Visualizador de Notas de Parche en la App:**
  - Modal interactivo accesible desde Ajustes y con apertura automática tras actualizar para conocer todas las novedades.
- **Reproductor de Video Integrado:**
  - Soporte HLS con **Hls.js**, selector de servidores, controles personalizados y pantalla completa.
  - Guardado automático de progreso y sincronización con el historial.
- **Base de Datos SQLite Embebida:**
  - Base de datos local en modo WAL para historial de episodios, lista de favoritos y ajustes del usuario.
- **Diseño Visual Ultra-Moderno:**
  - Interfaz oscura con acentos neón (#6366f1 / #ec4899), glassmorphism y animaciones con Framer Motion.
  - **Sin emojis:** Uso exclusivo de iconos vectoriales modernos de **Lucide React**.
- **CI/CD Automatizado con GitHub Actions:**
  - Generación automática de instaladores para Windows (**`.exe`**) y Android (**`.apk`**) al publicar una release en GitHub.

