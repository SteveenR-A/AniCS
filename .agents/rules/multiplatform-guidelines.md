---
trigger: always_on
---

# Reglas y Estándares Multiplataforma (PC vs Móvil) — AniCS

Este documento establece las reglas arquitectónicas y directrices obligatorias para asegurar que los cambios y soluciones a problemas en la versión móvil (Android) no afecten negativamente a la versión de escritorio (Windows/PC), y viceversa.

---

## 1. Principio de Aislamiento de Plataforma

1. **Separación de Vistas (UI)**:
   - Las vistas de escritorio residen exclusivamente en `src/pages/desktop/` y componentes con prefijo Desktop.
   - Las vistas móviles residen exclusivamente en `src/pages/mobile/` y componentes con prefijo Mobile.
   - Las vistas unificadas como `PlayerPage.tsx` utilizan el hook `useResponsive()` para adaptar controles sin alterar la lógica de teclado ni el diseño de ratón/escritorio.
2. **Preservación de la Experiencia en Escritorio**:
   - La versión PC debe mantener siempre sus atajos de teclado completos (Espacio, K, J, L, S, Flechas, C, H, F, M).
   - El soporte para rueda de ratón (volumen a la derecha, brillo a la izquierda) y pantalla completa mediante `window.set_fullscreen` debe permanecer intacto.
   - Las carpetas por defecto en PC (`Videos\AniCS` o `Downloads\AniCS`) no deben ser sobrescritas por rutas móviles.

---

## 2. Backend en Rust y Compilación Condicional

1. **Uso Obligatorio de `#[cfg(...)]`**:
   - Cualquier código o comando dependiente del sistema operativo debe estar aislado con atributos de compilación:
     - `#[cfg(target_os = "android")]` para rutas, almacenamiento o intents específicos de Android.
     - `#[cfg(target_os = "windows")]` para ejecución de instaladores `.exe`, gestión de ventanas o rutas de Windows.
     - `#[cfg(desktop)]` para APIs de ventana de escritorio (`webview_windows()`, maximizar, decorar).
     - `#[cfg(mobile)]` para puntos de entrada y plugins móviles.
2. **Servidor Local de Streaming (`media_server.rs`)**:
   - El servidor HTTP local en `127.0.0.1` es agnóstico a la plataforma y proporciona soporte para cabeceras de rango HTTP (`206 Partial Content`) tanto en PC como en Android.
   - No modificar su lógica de streaming para una plataforma si perjudica a la otra.

---

## 3. Ciclo de Vida del Reproductor y Gestión de Estado

1. **Sincronización de Episodios y Limpieza de Estado**:
   - Siempre invocar `resetPlayback()` al salir del reproductor (`navigate(-1)`) o al seleccionar un nuevo anime/episodio.
   - No asumir que `resolvedMedia` o `selectedServer` pertenecen a la serie actual si ha cambiado la URL o el número de episodio.
   - La clave de sincronización `loadKey = ${url}-${ep}-${source}` debe validar la unicidad antes de cargar streams.
2. **Gestos Táctiles vs Clics de Ratón**:
   - En móvil: 1 solo toque alterna los controles HUD (no pausa); doble toque en centro pausa/reanuda; doble toque a los lados avanza/retrocede 10s.
   - En PC: Clic en pantalla alterna controles; barra espaciadora o clic en botón central pausa/reanuda; doble clic en pantalla conmuta pantalla completa o seek.
3. **Diseño Visual**:
   - Cero uso de emojis en componentes del reproductor; usar siempre iconos vectoriales SVG de Lucide y tipografía estilizada.

---

## 4. Persistencia, Keyring y Sincronización

1. **Gestión de Credenciales en Keyring**:
   - `keyring` v3 en Windows y SecretService en Linux/Android: indexar objetivos mediante `new_with_target("AniCS/{key}", "AniCS", key)` para evitar colisiones.
2. **Migraciones de Base de Datos SQLite**:
   - `CREATE TABLE IF NOT EXISTS` -> `ALTER TABLE ADD COLUMN` -> `CREATE INDEX IF NOT EXISTS` -> inserción inicial.
   - Jamás declarar índices sobre columnas antes de verificar y ejecutar sus respectivas migraciones `ALTER TABLE`.
3. **Sincronización en la Nube y Lápidas (Tombstones)**:
   - Todo borrado intencional de datos debe registrarse en la tabla `tombstones` para propagarse fielmente a través de GitHub Gist.

---

## 5. Reglas de Verificación antes de Cambios

1. **Compilación Frontend**: Todo cambio en TypeScript/React debe validar con `npm run build` sin errores de tipo ni dependencias ausentes.
2. **Compilación Backend**: Todo cambio en Rust debe validar con `cargo check` y `cargo test` en `src-tauri`.
3. **Validación Cruzada**: Antes de dar por resuelto un problema de móvil, verificar que no rompa el flujo de PC, y viceversa.

---

## 6. Procedimiento de Creación de Nuevas Versiones y Releases

1. **Sincronización de Versión**:
   - Usar `npm run bump <version> "<titulo>" "<highlights>"` para sincronizar `package.json`, `Cargo.toml`, `tauri.conf.json`, `updateService.ts`, `changelog.json` y settings.
2. **Separación de Notas de Versión**:
   - `RELEASE_NOTES.md`: Exclusivo del release en curso; consumido por GitHub Actions y por el modal de actualización (`UpdateAnnouncementModal`) para no saturar con el changelog completo.
   - `CHANGELOG.md`: Archivo acumulativo maestro de todo el historial.
3. **Flujo de Git**:
   - NUNCA hacer `git push` sin orden explícita del usuario.
   - Con autorización: `git add .` -> `git commit -m "chore: release vX.Y.Z"` -> `git tag vX.Y.Z` -> `git push origin main --tags`.

---

## 7. Estándares de Scrapers y Extracción Resiliente

1. **Tolerancia a Sintaxis JavaScript en Cliente**:
   - Sitios como Anime-JL incrustan estructuras de datos en scripts JS que no cumplen la especificación estricta de JSON (por ejemplo, comas finales trailing commas `[...,],];`, comillas variadas o arrays sin comillas).
   - **Nunca** asumir que un bloque de script JS es JSON válido consumible por `serde_json::from_str`.
   - Utilizar escaneo regex robusto de dos fases: un patrón de bloque para aislar el contenedor (`var episodes = [(...)];`) y un patrón de elemento iterativo (`EPISODE_ITEM_RE.captures_iter(...)`) para extraer tuplas de forma segura.
2. **Normalización Canónica de URLs**:
   - Toda URL de serie debe depurarse de sufijos de episodios (`/episodio-\d+`, `/capitulo-\d+`), query params (`?`) y fragmentos (`#`) para garantizar claves uniformes de persistencia y caché.
3. **Distinción Estricta entre Póster de Serie y Miniatura de Episodio**:
   - Los pósters oficiales son imágenes verticales canónicas (`/storage/animes_tumbl/...`).
   - Las capturas de episodios son fotos horizontales provisionales (`/storage/episodes_tumbl/...`).
   - En feeds de inicio, asociar cada episodio con el póster oficial si está disponible en la portada.
   - En el frontend (`DesktopDetailsPage.tsx` y `MobileDetailsPage.tsx`), la respuesta de `getDetails()` debe sustituir inmediatamente cualquier captura provisional en el estado local y en caché.

---

## 8. Estándares de Modales, Visores Multimedia e Interfaz (UI/UX)

1. **Estética Limpia Sin Emojis**:
   - Prohibido el uso de emojis en cualquier componente, modal, visor o notificación; emplear siempre iconos vectoriales SVG de `lucide-react` con tipografía limpia y estructurada.
2. **Accesibilidad y Descarte de Modales**:
   - Todo modal o visor flotante (`ImageLightboxModal`, etc.) debe cerrarse automáticamente al presionar la tecla `Escape` y al hacer clic o toque en el fondo exterior (backdrop).
   - Prevenir la propagación de eventos en el contenedor de contenido (`e.stopPropagation()`) para evitar cierres accidentales al interactuar con el contenido o imagen.
3. **Efectos Visuales Modernos y Fluidez**:
   - Utilizar fondos de oscurecimiento profundo (`rgba(0, 0, 0, 0.88)`) combinados con `backdrop-filter: blur(16px)` y `WebkitBackdropFilter`.
   - Implementar transiciones suaves de entrada y salida mediante `framer-motion` y `AnimatePresence`.
4. **Ergonomía Multiplataforma**:
   - En escritorio: cursor interactivo (`zoom-in`), atajos de teclado y tooltips explicativos.
   - En móvil: áreas de toque táctiles amplias, contenedor centrado con límites de escala (`92vw`, `82vh`) y `object-fit: contain` para garantizar una visualización impecable sin desbordamiento.


