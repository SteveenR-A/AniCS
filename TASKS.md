# AniCS — Tareas Pendientes y Hoja de Ruta (Roadmap)

Este documento centraliza las tareas pendientes priorizadas para futuras versiones de AniCS (Windows y Android).

---

## 📋 Tareas Pendientes Prioritarias

### 1. 📥 Gestor de Descargas Avanzado (Batch & Queue)
* **Objetivo:** Facilitar la descarga masiva y ordenada de series completas o temporadas.
* **Características a Implementar:**
  - **Selección Múltiple:** Checkboxes o modo de selección en [DesktopDetailsPage.tsx](file:///c:/Documentos/AniCS/src/pages/desktop/DesktopDetailsPage.tsx) y [MobileDetailsPage.tsx](file:///c:/Documentos/AniCS/src/pages/mobile/MobileDetailsPage.tsx) para elegir episodios específicos.
  - **Descargar Temporada / Lote:** Botón "Descargar todos" o seleccionar rango (ej. Episodios 1 al 12).
  - **Gestión de Cola:** Configuración de descargas simultáneas en ajustes (ej. 1, 2 o 3 en paralelo) para evitar saturación de ancho de banda.
  - **Resolución Automática:** Encolar la resolución de servidores en segundo plano antes de iniciar cada fragmento HLS/MP4.

---

### 2. 🔔 Notificaciones de Nuevos Episodios
* **Objetivo:** Notificar al usuario de forma nativa en Windows y Android cuando un anime en emisión que sigue o tiene en favoritos estrena un nuevo capítulo.
* **Fuente de Datos (Integración con AniGrid):**
  - Utilizar la arquitectura y lógica ya implementada en el proyecto hermano **AniGrid** (`C:\Documentos\AniGrid`), desplegado en Vercel.
  - **Consulta por Lotes va AniList GraphQL:**
    ```graphql
    query ($ids: [Int]) {
      Page(perPage: 50) {
        media(idMal_in: $ids, type: ANIME) {
          idMal
          nextAiringEpisode {
            airingAt
            episode
          }
        }
      }
    }
    ```
    Permite obtener con exactitud de segundos el timestamp Unix del próximo capítulo para hasta 50 animes por solicitud sin agotar límites de peticiones (90 req/min).
  - Cálculo de la hora de estreno adaptada a la zona horaria local del dispositivo.
* **Infraestructura de Notificaciones:**
  - `tauri-plugin-notification` / `@tauri-apps/plugin-notification` (ya pre-configurados en `Cargo.toml`, `package.json` y `capabilities/default.json`).
  - Verificación periódica ligera en segundo plano o al arrancar la app comparando el último episodio registrado con `nextAiringEpisode`.
  - Acción al pulsar la notificación: navegar directamente a la ficha del anime.

---

### 3. 📺 Transmitir a Smart TV (Cast / DLNA)
* **Objetivo:** Permitir enviar la reproducción de anime o donghua a televisores y pantallas conectadas en la red local.
* **Características a Implementar:**
  - **Google Cast / Chromecast:**
    - Soporte para transmisión de flujos HLS (`.m3u8`) y archivos directos `.mp4`.
    - Selector de dispositivos Cast disponibles en la red local.
  - **DLNA / UPnP:**
    - Descubrimiento de Smart TVs (Samsung Tizen, LG webOS, Android TV, etc.) mediante protocolo SSDP.
    - Servir el contenido a través del servidor multimedia local ya integrado en AniCS (`media_server.rs`), asegurando compatibilidad con solicitudes de rango HTTP (`206 Partial Content`).
  - **Controles Remotos en la App:**
    - Barra de control flotante en AniCS para pausar, reanudar, adelantar/retroceder y cambiar volumen en la televisión.

---

## 🚫 Tareas Descartadas / No Operativas

* **AniSkip (Detección de Intro/Ending):**
  - **Estado:** Descartado.
  - **Motivo:** El servicio y su API pública ya no se encuentran funcionales ni reciben mantenimiento comunitario.
