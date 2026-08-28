# Registro de Cambios (Changelog) — AniCS

Todas las modificaciones notables de este proyecto estarán documentadas en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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

