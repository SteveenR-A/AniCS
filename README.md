# AniCS — Aplicación Multiplataforma de Anime & Donghua

<p align="center">
  <strong>Cliente moderno, ultrarrápido y sin navegador para streaming y descarga de anime y donghua en Windows y Android.</strong>
</p>

---

## Características Principales

- **Arquitectura de Alto Rendimiento:** Construido con Tauri v2, Rust para el backend y React 19 + TypeScript para el frontend.
- **Scraping Multihilo Sin Navegador:** Extracción directa mediante HTTP asíncrono con rotación de `User-Agent` y cabeceras anti-bloqueo para JKAnime y MundoDonghua.
- **JsUnpacker en Rust:** Desofuscación instantánea del algoritmo Dean Edwards en memoria para obtener enlaces directos de video sin dependencias de navegadores externos.
- **Motor de Descarga HLS Paralelo:** Descargas aceleradas con ventana deslizante de 8 fragmentos concurrentes, soporte de reanudación y emisión de progreso en tiempo real.
- **Panel de Ajustes Avanzado:**
  - Selector y personalización de dominios/espejos para JKAnime y MundoDonghua.
  - Botón para restablecer los dominios oficiales en un clic.
  - Selector nativo de directorio de descargas y límite de concurrencia.
  - Selector de reproductor: Integrado o externo (MPV / VLC).
  - Información transparente sobre la resolución y limitaciones de servidores de origen.
  - Comprobación de actualizaciones en tiempo real contra GitHub Releases.
- **Motor Multi-Tema Dinámico:** Selector con paletas visuales (Dark, Catppuccin Mocha, Dracula, Tokyo Night, Cyberpunk 2077, Nord y Claro) con persistencia en SQLite.
- **Reproductor Adaptativo Integrado:** Soporte HLS (`Hls.js`), compensación para cámaras/notch en Android, salto de intro (+85s), selector de servidores en caliente y atajos de teclado completos.
- **Base de Datos SQLite Embebida (WAL):** Historial de reproducción, favoritos y configuración almacenados de forma local y persistente.
- **Diseño Limpio:** Interfaz oscura moderna con iconos vectoriales de Lucide React y los recursos gráficos oficiales.
- **CI/CD Automatizado:** GitHub Actions compila automáticamente el instalador de Windows (`.msi`, `.exe`) y el paquete de Android (`.apk`).

---

## Estructura del Proyecto

```
AniCS/
├── .github/workflows/
│   └── release.yml            # CI/CD: Compilación de MSI, EXE y APK en GitHub
├── scripts/
│   └── bump-version.js        # Script de sincronización automática de versiones
├── src/                       # Frontend (React + TS + TailwindCSS v4)
│   ├── components/
│   │   ├── layout/            # AppShell, DesktopSidebar, MobileBottomBar
│   │   └── ChangelogModal.tsx # Visor interactivo de notas de parche
│   ├── data/
│   │   └── changelog.json     # Historial centralizado de versiones
│   ├── pages/                 # HomePage, SearchPage, DetailsPage, SettingsPage, PlayerPage...
│   ├── services/              # Invocaciones IPC de Tauri (Anime, Descargas, Storage)
│   └── stores/                # Estados globales con Zustand (Tema, Descargas, Reproductor)
├── src-tauri/                 # Backend nativo (Rust + Tauri v2)
│   ├── src/
│   │   ├── commands/          # Handlers IPC expuestos al frontend
│   │   ├── core/              # Modelos de dominio y JsUnpacker
│   │   ├── downloader/        # Motor HLS multihilo con ventana deslizante
│   │   ├── scrapers/          # Trait AnimeExtractor, JKAnime y MundoDonghua
│   │   └── storage/           # SQLite (historial, favoritos, ajustes)
│   ├── capabilities/          # Permisos de Tauri v2
│   └── icons/                 # Iconos oficiales (Windows + Android)
├── CHANGELOG.md               # Registro completo de notas de versión
└── package.json
```

---

## Manejo de Versiones y Publicación (SemVer)

Este proyecto utiliza Semantic Versioning (`MAJOR.MINOR.PATCH`):
- `0.1.0` - Versión inicial con arquitectura completa.
- `0.1.1` - Parche de corrección de errores o mantenimiento.
- `0.2.0` - Versión menor con nuevas funciones o extractores.
- `1.0.0` - Versión estable final.

### Actualizar Versión en 1 Solo Comando

Para sincronizar la versión en todos los archivos (`package.json`, `Cargo.toml`, `tauri.conf.json`, `SettingsPage.tsx` y `changelog.json`):

```bash
# Formato: npm run bump -- <version> [titulo] [cambios_separados_por_pipe]
npm run bump -- 0.1.1 "Mejoras de estabilidad" "Arreglo en selector de servidor|Optimización de descargas HLS"
```

Luego publica en GitHub para que el flujo de CI/CD cree automáticamente el MSI y APK:
```bash
git add .
git commit -m "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

---

## Desarrollo Local

### Requisitos Previos
- Node.js >= 20
- Rust (con toolchain MSVC en Windows)
- Tauri CLI v2 (`@tauri-apps/cli`)

### Comandos de Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Ejecutar en Windows (Modo Desarrollo):**
   ```bash
   npm run tauri dev
   ```

3. **Compilar instalador Windows localmente:**
   ```bash
   npm run tauri build
   ```

4. **Ejecutar en Android:**
   ```bash
   npm run tauri android dev
   ```
