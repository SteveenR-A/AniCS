# AniCS

![Plataformas](https://img.shields.io/badge/Plataformas-Windows%20%7C%20Android-0078D4?style=flat-square)
![Licencia](https://img.shields.io/badge/Licencia-GNU_GPLv3-blue?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri&logoColor=black)
![React](https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Rust](https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust&logoColor=white)

AniCS es una aplicación multiplataforma para explorar, reproducir y descargar anime y donghua. Está disponible para Windows y Android, con una interfaz adaptada a cada plataforma.

## Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Plataformas** | ![Windows](https://img.shields.io/badge/Windows_10%2F11-0078D4?style=flat-square&logo=windows&logoColor=white) ![Android](https://img.shields.io/badge/Android_8.0+-3DDC84?style=flat-square&logo=android&logoColor=white) |
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

- Node.js 20 o posterior y npm.
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

## Versiones y publicación

El proyecto usa Semantic Versioning (`MAJOR.MINOR.PATCH`). Para preparar una versión, el script actualiza las versiones del frontend y Tauri, el changelog de la aplicación y las notas de publicación:

```bash
npm run bump -- <version> "<Título del release>" "<Mejora 1|Mejora 2|Corrección 3>"
```

Por ejemplo:

```bash
npm run bump -- 0.2.11 "Mejoras de estabilidad" "Corrección de reproducción|Ajustes de descargas"
```

Antes de publicar, revisa los cambios generados y las notas de versión, y ejecuta las validaciones del proyecto (`npm run build`, `npm test`, `cargo check` y `cargo test` desde `src-tauri`). El workflow de GitHub Actions valida la versión y construye el instalador de Windows y el APK de Android al publicar una etiqueta `v<version>`; la publicación requiere autorización explícita.

Consulta [RELEASE_NOTES.md](RELEASE_NOTES.md) para los cambios de la versión actual y [CHANGELOG.md](CHANGELOG.md) para el historial completo.

## Licencia y contenido

AniCS se distribuye bajo la licencia GNU GPL v3. Consulta [LICENSE](LICENSE). AniCS es un cliente: no aloja ni almacena contenido multimedia en servidores propios; la disponibilidad y los derechos del contenido enlazado dependen de sus respectivas fuentes.
