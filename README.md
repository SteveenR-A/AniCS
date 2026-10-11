# AniCS

![Plataformas](https://img.shields.io/badge/Plataformas-Windows%20%7C%20Linux%20%7C%20Android-0078D4?style=flat-square)
![Licencia](https://img.shields.io/badge/Licencia-GNU_GPLv3-blue?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=black)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Rust](https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust&logoColor=white)

AniCS es una aplicación multiplataforma para explorar, reproducir y descargar anime y donghua. Soporta Windows, Linux y Android, con una interfaz adaptada a cada plataforma. Linux puede instalarse desde el código fuente; los próximos releases incluyen AppImage y DEB para x86_64.

## Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Plataformas** | ![Windows](https://img.shields.io/badge/Windows_10%2F11-0078D4?style=flat-square&logo=windows&logoColor=white) ![Android](https://img.shields.io/badge/Android_8.0+-3DDC84?style=flat-square&logo=android&logoColor=white) ![Linux](https://img.shields.io/badge/Linux-x86__64-FCC624?style=flat-square&logo=linux&logoColor=black) |
| **Núcleo Nativo** | ![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white) ![Tauri v2](https://img.shields.io/badge/Tauri_v2-24C8DB?style=flat-square&logo=tauri&logoColor=black) ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white) |
| **Frontend & UI** | ![React 19](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white) ![Zustand](https://img.shields.io/badge/Zustand-443E38?style=flat-square&logoColor=white) |
| **Streaming & Red** | ![HLS.js](https://img.shields.io/badge/HLS.js-FF6F00?style=flat-square&logoColor=white) ![Google Cast](https://img.shields.io/badge/Google_Cast-4285F4?style=flat-square&logo=googlecast&logoColor=white) ![DLNA](https://img.shields.io/badge/DLNA-1B365D?style=flat-square&logoColor=white) |

## Estructura del proyecto

```text
AniCS/
├── src/
│   ├── components/       # Componentes compartidos
│   ├── config/           # Configuración y feature flags
│   ├── hooks/            # Hooks de interfaz y adaptación por plataforma
│   ├── pages/
│   │   ├── desktop/      # Vistas de escritorio
│   │   ├── mobile/       # Vistas móviles
│   │   └── PlayerPage.tsx
│   ├── services/         # Catálogos, descargas, sincronización y servicios
│   ├── stores/           # Estado global con Zustand
│   └── data/             # Datos locales, incluido el changelog
├── src-tauri/
│   ├── src/
│   │   ├── commands/     # Comandos Tauri
│   │   ├── core/         # Modelos y utilidades de dominio
│   │   ├── downloader/   # Descargas HLS y servidor de medios local
│   │   ├── scrapers/     # Adaptadores de catálogos y extractores
│   │   ├── casting/      # Transmisión DLNA/UPnP
│   │   └── storage/      # SQLite, caché y almacenamiento seguro
│   └── capabilities/    # Permisos de Tauri
├── scripts/              # Herramientas de versión y Android
├── CHANGELOG.md          # Historial acumulado
└── RELEASE_NOTES.md      # Notas de la versión actual
```

## Requisitos de desarrollo

- Node.js 22.12 o posterior y npm (CI utiliza Node.js 24).
- Rust estable; en Windows, toolchain MSVC.
- Tauri CLI v2 (incluida como dependencia npm del proyecto).
- Para compilar Android: Android SDK, Android NDK y JDK 17.

## Desarrollo local

Instala las dependencias:

```bash
npm install
```

Inicia la aplicación de escritorio en modo desarrollo:

```bash
npm run tauri dev
```

Inicia la aplicación Android en modo desarrollo, con un dispositivo o emulador configurado:

```bash
npm run tauri android dev
```

Compila el frontend o los paquetes nativos:

```bash
npm run build
npm run tauri build
```

## Instalación en Linux

Instala Rust, Node.js y las dependencias nativas de tu distribución. La lista de desarrollo sigue los [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/); GStreamer proporciona los decodificadores del reproductor integrado.

En Arch Linux / CachyOS:

```bash
sudo pacman -S --needed base-devel webkit2gtk-4.1 gtk3 dbus openssl librsvg \
  gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav
```

En Ubuntu 22.04 o posterior / Debian 12 o posterior:

```bash
sudo apt-get install build-essential pkg-config libwebkit2gtk-4.1-dev \
  libssl-dev libdbus-1-dev librsvg2-dev \
  gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav
```

Desde la raíz del proyecto:

```bash
npm ci
npm run install:linux
```

El instalador compila la versión release, instala el ejecutable en `~/.local/bin/anics` y crea un acceso en el menú. Respeta `XDG_DATA_HOME` para iconos y accesos (por defecto `~/.local/share`). Añade `~/.local/bin` a `PATH` si deseas ejecutar `anics` desde la terminal. No requiere `sudo` para instalar la app.

Antes de compilar o instalar comprueba los plugins multimedia. `gst-libav` por sí
solo no basta: `gst-plugins-good` incluye `qtdemux` para MP4 y `aacparse` para AAC,
necesarios también para los segmentos MP4 usados por HLS. Si faltan componentes,
el instalador muestra cuáles y se detiene. Tras instalar los paquetes, cierra
AniCS por completo y vuelve a abrirlo para que WebKit detecte los plugins.

Opciones para reutilizar un binario compilado, probar una instalación aislada o desinstalar:

```bash
npm run install:linux -- --no-build
npm run install:linux -- --prefix /tmp/anics-install
npm run uninstall:linux
```

La desinstalación conserva la base de datos, los perfiles y las descargas. Para desinstalar una ubicación personalizada, proporciona el mismo `--prefix`.

Los videos se guardan por defecto en la carpeta de videos del usuario (`Videos/AniCS`), con fallback a descargas si el sistema no define esa carpeta. El servidor local proporciona reproducción con peticiones Range. En Wayland/Hyprland/Sway se conserva el ajuste de WebKitGTK para evitar congelamientos y la adaptación de decoraciones de ventana. Puedes utilizar `mpv` como reproductor externo.

Con las cuentas desactivadas (`ENABLE_FIREBASE_AUTH: false`), el uso local de AniCS no requiere GNOME Keyring. El backend conserva soporte Secret Service para las funciones de almacenamiento seguro de la sincronización; no es un requisito de instalación para el modo local.

En Hyprland, AniCS permite que la ventana principal se reduzca por debajo del mínimo de escritorio de 900×600. Así WebKit ajusta su viewport al mosaico del compositor y conserva la correspondencia entre el cursor y los controles al dividir o redimensionar ventanas. El límite de otras plataformas y escritorios se conserva. En Hyprland se mantiene el renderizado acelerado y se aplica `__NV_DISABLE_EXPLICIT_SYNC=1` antes de crear GTK, respetando cualquier valor explícito del entorno. Se reducen desenfoques y sombras repetidas para mejorar el desplazamiento. Si un controlador presenta bloqueos de imagen o vídeo, puedes iniciar `WEBKIT_DISABLE_DMABUF_RENDERER=1 anics` para volver al modo compatible; este modo puede hacer más lento el scroll en ventanas grandes. En otros escritorios Linux se conserva el valor compatible anterior.

Para generar paquetes:

```bash
npm run bundle:appimage
npm run tauri -- build --bundles deb
```

La configuración Linux incluye el framework multimedia en AppImage; el [empaquetado multimedia de Tauri](https://v2.tauri.app/distribute/appimage/#multimedia-support-via-gstreamer) requiere Ubuntu para soporte completo. CI construye en Ubuntu 22.04 para mantener una base de glibc compatible. Los binarios compilados localmente en CachyOS pueden requerir una glibc más reciente.

Las actualizaciones en Linux ofrecen descargar AppImage/DEB desde Ajustes y requieren instalación manual. Para una instalación desde código fuente, actualiza el repositorio y repite `npm ci` y `npm run install:linux`. Windows conserva su instalador automático.

Con Node.js 26, si las pruebas fallan por `localStorage` del runtime, ejecuta:

```bash
NODE_OPTIONS=--no-experimental-webstorage npm test
```

## Versiones y publicación

El proyecto usa Semantic Versioning (`MAJOR.MINOR.PATCH`). Para preparar una versión, el script actualiza las versiones del frontend y Tauri, el changelog de la aplicación y las notas de publicación:

```bash
npm run bump -- <version> "<Título del release>" "<Mejora 1|Mejora 2|Corrección 3>"
```

Por ejemplo:

```bash
npm run bump -- 0.2.11 "Mejoras de estabilidad" "Corrección de reproducción|Ajustes de descargas"
```

Antes de publicar, revisa los cambios generados y las notas de versión, y ejecuta las validaciones del proyecto (`npm run build`, `npm test`, `cargo check` y `cargo test` desde `src-tauri`). El workflow de GitHub Actions valida la versión y construye el instalador de Windows, el APK de Android y los paquetes Linux AppImage/DEB (x86_64) al publicar una etiqueta `v<version>`; la publicación requiere autorización explícita.

Consulta [RELEASE_NOTES.md](RELEASE_NOTES.md) para los cambios de la versión actual y [CHANGELOG.md](CHANGELOG.md) para el historial completo.

## Licencia y contenido

AniCS se distribuye bajo la licencia GNU GPL v3. Consulta [LICENSE](LICENSE). AniCS es un cliente: no aloja ni almacena contenido multimedia en servidores propios; la disponibilidad y los derechos del contenido enlazado dependen de sus respectivas fuentes.
