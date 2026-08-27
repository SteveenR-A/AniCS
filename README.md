# AniCS — Aplicación Multiplataforma de Anime & Donghua

<p align="center">
  <strong>Cliente moderno, ultrarrápido y sin navegador para streaming y descarga de anime y donghua en Windows y Android.</strong>
</p>

---

## ✨ Características Principales

- ⚡ **Arquitectura de Alto Rendimiento:** Construido con **Tauri v2**, **Rust** para el backend y **React 19 + TypeScript** para el frontend.
- 🌐 **Scraping Multihilo Sin Navegador:** Extracción directa mediante HTTP asíncrono con rotación de `User-Agent` y headers anti-bloqueo para **JKAnime** y **MundoDonghua**.
- 🔓 **JsUnpacker en Rust:** Desofuscación instantánea del algoritmo Dean Edwards en memoria para obtener enlaces directos de video sin navegadores pesados.
- 🚀 **Motor de Descarga HLS Paralelo:** Descargas aceleradas con ventana deslizante de **8 fragmentos concurrentes**, soporte de reanudación y emisión de progreso en tiempo real.
- ⚙️ **Panel de Ajustes Completo:**
  - **Personalización de dominios/espejos** para JKAnime y MundoDonghua.
  - **Botón "Restablecer Web Original"** para volver a los dominios oficiales en un clic.
  - **Selector nativo de carpeta de descargas** y límite de concurrencia.
  - **Selector de reproductor:** Integrado o externo (MPV / VLC).
  - **Aviso de resolución de video:** Información transparente sobre la dependencia del servidor de origen.
  - **Comprobación de actualizaciones en tiempo real** contra GitHub Releases.
- 📜 **Notas de Parche Integradas:** Visualizador interactivo de notas de versión dentro de la app (en Ajustes).
- 🎬 **Reproductor Integrado:** Soporte HLS adaptativo (`Hls.js`), selector de servidores, guardado automático de progreso y pantalla completa.
- 🗄️ **Base de Datos SQLite Embebida (WAL):** Historial, favoritos y ajustes almacenados de forma local y persistente.
- 🎨 **Diseño Moderno & Sin Emojis:** Interfaz oscura neón con **Lucide React** y los iconos originales del proyecto.
- 📦 **CI/CD Automatizado:** GitHub Actions compila automáticamente el instalador Windows (**`.msi`**, **`.exe`**) y el APK de Android (**`.apk`**).

---

## 🛠️ Estructura del Proyecto

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
│   └── stores/                # Estados globales con Zustand
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

## 📌 Manejo de Versiones y Notas de Parche (SemVer)

Este proyecto utiliza **Semantic Versioning** (`MAJOR.MINOR.PATCH`):
- `0.1.0` ➔ **Versión Inicial:** Con todas las características principales implementadas.
- `0.1.1` ➔ **Parche:** Para corrección de errores menores.
- `0.2.0` ➔ **Menor:** Para agregar nuevas funciones o nuevos extractores.
- `1.0.0` ➔ **Mayor:** Para la primera versión 100% estable.

### 🚀 Cómo Cambiar de Versión y Publicar (1 Solo Comando)

Para actualizar la versión en todo el proyecto (`package.json`, `Cargo.toml`, `tauri.conf.json`, `SettingsPage.tsx` y `changelog.json`):

```bash
# Formato: npm run bump -- <version> [titulo] [cambios_separados_por_pipe]
npm run bump -- 0.1.1 "Mejoras de rendimiento" "Arreglo en servidor Desu|Optimización de descargas HLS"
```

Luego publica en GitHub para que el CI/CD cree automáticamente el **MSI** y el **APK**:
```bash
git add .
git commit -m "chore: release v0.1.1"
git tag v0.1.1
git push origin main --tags
```

---

## 💻 Desarrollo Local

### Requisitos Previos
- **Node.js** >= 20
- **Rust** (con `cargo` y toolchain MSVC en Windows)
- **Tauri CLI v2**

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
