# AniCS — Tareas Pendientes y Hoja de Ruta (Roadmap)

Este documento centraliza las tareas pendientes priorizadas para futuras versiones de AniCS (Windows y Android).

---

## 📋 Tareas Pendientes Prioritarias

### 1. 🔔 Notificaciones de Nuevos Episodios
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


---

## ✅ Tareas Completadas

* **Gestor de Descargas por Lotes:** Selección de episodios no vistos, selección manual o por rango, resolución de enlaces y encolado desde las vistas de escritorio y Android.
* **Transmisión DLNA / UPnP a Smart TV en Android:** Descubrimiento SSDP, envío de videos descargados mediante servidor LAN con soporte HTTP Range, y controles remotos de reproducir, pausar, buscar, detener y volumen. El botón de transmisión está oculto en PC.
* **Google Cast en Android (integración inicial):** SDK oficial, selector nativo de televisores y controles de reproducción desde AniCS para enlaces de video compatibles.

## 📋 Pendientes de transmisión

* **Google Cast en Android:** Validar el APK y la reproducción con televisores físicos; comprobar enlaces MP4/HLS de los distintos servidores.
* **Archivos locales mediante Google Cast:** Exponer una URL accesible por el televisor. Actualmente las descargas se transmiten mediante DLNA/UPnP.
* **Google Cast en PC:** Integración pendiente para una versión futura. El icono de transmisión permanece oculto en Windows, incluso en ventanas pequeñas.

---

## 🚫 Tareas Descartadas / No Operativas

* **AniSkip (Detección de Intro/Ending):**
  - **Estado:** Descartado.
  - **Motivo:** El servicio y su API pública ya no se encuentran funcionales ni reciben mantenimiento comunitario.
