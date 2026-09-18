# Tareas Pendientes: Anime-JL (Episodios y Portadas) y Visor de Imágenes

Este documento detalla los hallazgos técnicos, causas raíces y la guía de implementación para abordar en una próxima sesión.

---

## 1. Extracción de Lista de Episodios en Anime-JL

### Diagnóstico del Problema
- **Síntoma**: Al seleccionar un anime proveniente de Anime-JL, la vista de detalles se queda cargando indefinidamente o muestra `Próximamente / 0 episodios`.
- **Causa Raíz en `src-tauri/src/scrapers/animejl.rs`**:
  En el HTML servido por Anime-JL, los episodios no se renderizan en etiquetas `<li>` estáticas, sino en un bloque de script JavaScript del cliente con la estructura:
  ```javascript
  var anime_info = ["2517","Enn Enn no Shouboutai Temporada 3 Castellano","fire-force-season-3-castellano-7","","Anime"];
  var episodes = [[25,"episodio-25","episodes_tumbl/episode-25-cover-lbi6q.jpg",""],...,[1,"episodio-1","episodes_tumbl/episode-1-cover-m3vpl.jpg",""],];
  ```
  Nótese que después del último episodio `[1, ...]`, existe una coma final trailing antes del cierre: `],];`.
  1. La expresión regular `r#"var\s+episodes\s*=\s*(\[\[.*?\]\]);"#` buscaba `]]` contiguos, por lo que **nunca coincidía** con `],];`.
  2. Incluso si capturaba el texto, `serde_json::from_str` no admite comas finales (especificación estricta de JSON), fallando con error de sintaxis.

### Solución Diseñada
Reemplazar el parser JSON por un escaneo regex de dos fases resiliente a comas finales y formato variable:
```rust
static EPISODES_BLOCK_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"(?s)var\s+episodes\s*=\s*\[(.*?)\]\s*;"#).unwrap()
});

static EPISODE_ITEM_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\[\s*(\d+)\s*,\s*["']([^"']*)["']\s*(?:,\s*["']([^"']*)["'])?"#).unwrap()
});
```
Con esto, al extraer cada coincidencia:
- Grupo 1: Número de episodio (`25`).
- Grupo 2: Slug o ruta (`episodio-25`).
- Grupo 3: Ruta de miniatura (`episodes_tumbl/episode-25-cover-lbi6q.jpg`).
- URL de episodio: `format!("{}/{}", series_url, ep_slug)`.

---

## 2. Diferenciación entre Miniatura de Episodio y Póster del Anime

### Diagnóstico del Problema
- **Síntoma**: Las tarjetas mostradas en el feed de inicio muestran capturas de pantalla del episodio más reciente en vez del póster oficial del anime.
- **Causa Raíz**:
  En Anime-JL existen dos secciones en la portada:
  1. `<ul class="ListEpisodios">`: Tarjetas de episodios agregados recientemente. Su `<img>` apunta a `/storage/episodes_tumbl/...` (screenshot horizontal del capítulo).
  2. `<ul class="ListAnimes">` y `/animes`: Tarjetas de series. Su `<img>` apunta a `/storage/animes_tumbl/...` (póster vertical oficial del anime).

### Solución Diseñada
1. **Extracción combinada en `get_latest` (`animejl.rs`)**:
   Extraer las series de `<ul class="ListAnimes">` en la portada para asociar cada serie con su póster oficial (`/storage/animes_tumbl/...`). Si un episodio de `ListEpisodios` coincide en serie, usar la URL del póster en lugar de la captura del episodio.
2. **Actualización de estado en el Frontend**:
   En `DesktopDetailsPage.tsx` y `MobileDetailsPage.tsx`, al invocar `getDetails()`, el scraper ya obtiene el póster canónico (`/storage/animes_tumbl/...`). Asegurar que el estado local reemplace de inmediato la miniatura provisional proveniente del feed de navegación.

---

## 3. Visor de Portada Ampliada (Lightbox / Zoom Modal)

### Objetivo
Permitir que el usuario haga clic o toque sobre el póster de portada en cualquier pantalla de detalles (PC y Móvil) para visualizarlo en grande o pantalla completa.

### Especificaciones Técnicas
1. **Componente Reutilizable**: `src/components/ImageLightboxModal.tsx`
   - Recibe: `isOpen: boolean`, `onClose: () => void`, `imageUrl: string`, `title: string`.
   - Animación con `framer-motion` (fade in con scale suave).
   - Fondo: `rgba(0, 0, 0, 0.85)` con `backdrop-filter: blur(16px)`.
   - Botón de cierre en esquina superior derecha con icono SVG Lucide (`X`) sin emojis.
   - Atajos de teclado: cerrar con tecla `Escape` y cierre al hacer clic en el backdrop.
2. **Integración**:
   - `DesktopDetailsPage.tsx`: envolver `<motion.div>` del póster con `onClick={() => setShowCoverZoom(true)}` y cursor tipo `zoom-in`.
   - `MobileDetailsPage.tsx`: toque en el póster principal para abrir el visor adaptable.
