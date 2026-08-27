# Registro de Cambios (Changelog) — AniCS

Todas las modificaciones notables de este proyecto estarán documentadas en este archivo.
El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto se adhiere a [Semantic Versioning](https://semver.org/lang/es/).

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
  - **Iconos oficiales:** Integración de los iconos extraídos de `ani-cli-dotnet`.
- **CI/CD Automatizado con GitHub Actions:**
  - Generación automática de instaladores para Windows (**`.msi`**, **`.exe`**) y Android (**`.apk`**) al publicar una release en GitHub.
