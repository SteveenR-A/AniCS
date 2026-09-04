# AniCS — Directrices de Desarrollo y Estándares Multiplataforma

Este archivo define las directrices y estándares obligatorios para el desarrollo y mantenimiento del proyecto AniCS (Windows y Android).

---

## 🏛️ Arquitectura del Proyecto

```
AniCS/
├── .agents/
│   └── rules/
│       └── multiplatform-guidelines.md  <-- Reglas de aislamiento PC / Móvil
├── src/
│   ├── components/                      <-- Componentes compartidos y adaptativos
│   ├── pages/
│   │   ├── desktop/                     <-- Vistas exclusivas de Escritorio (PC)
│   │   ├── mobile/                      <-- Vistas exclusivas de Android (Móvil)
│   │   └── PlayerPage.tsx               <-- Reproductor unificado con soporte responsive
│   ├── services/                        <-- Lógica de negocio e invocación Tauri
│   ├── stores/                          <-- Almacenes globales Zustand
│   └── types/                           <-- Tipos e interfaces TypeScript
└── src-tauri/
    ├── src/
    │   ├── commands/                    <-- Comandos Tauri (#[cfg(...)] condicional)
    │   ├── downloader/
    │   │   └── media_server.rs          <-- Servidor HTTP streaming local (Range requests)
    │   └── lib.rs                       <-- Setup y registro de handlers
    └── Cargo.toml                       <-- Dependencias Rust
```

---

## 🔒 Reglas Fundamentales para Agentes

### 1. No Afectar la Versión de PC al Corregir Móvil
- La versión de PC funciona de forma independiente y estable.
- **Nunca** alterar la lógica de escritorio en `src/pages/desktop/` para solucionar problemas de Android en `src/pages/mobile/`.
- Cualquier comando de Rust con comportamiento específico de plataforma debe usar `#[cfg(target_os = "android")]` o `#[cfg(desktop)]`.

### 2. Reproductor de Video
- **Estética limpia**: Sin emojis en ninguna parte de la interfaz; utilizar iconos SVG de Lucide.
- **Gestos**:
  - 1 solo toque/clic = Mostrar/ocultar barra de controles (HUD). No pausa el video.
  - Doble toque en el centro = Play / Pause.
  - Doble toque en los laterales = Retroceder (-10s) o Avanzar (+10s).
- **Ciclo de vida**: Al salir del reproductor o cambiar de episodio, llamar a `resetPlayback()` en `usePlayerStore` para no retener streams anteriores.

### 3. Archivos y Descargas Locales
- En Android y PC, los videos descargados se reproducen a través del servidor local `127.0.0.1:{PORT}/video?path={ENCODED_PATH}` (`media_server.rs`) para soportar Range Requests (`206 Partial Content`) de forma fluida.
- La ruta por defecto de descargas en PC es la carpeta local del sistema (`Videos/AniCS`), mientras que en Android es `/storage/emulated/0/Anime` con fallback al almacenamiento interno de la app.

### 4. Perfiles, Keyring y Sincronización en la Nube
- **Perfiles Locales**: Cada perfil posee su propio historial y favoritos indexados por `profile_id` en SQLite.
- **Almacenamiento Seguro (Keyring v3)**: El token de GitHub se almacena en el gestor de credenciales nativo (`new_with_target("AniCS/{key}", "AniCS", key)` en Windows / Android EncryptedSharedPreferences). Nunca guardar tokens en SQLite en texto plano.
- **Migraciones SQLite**: Mantener estrictamente el orden: `CREATE TABLE IF NOT EXISTS` -> `ALTER TABLE ADD COLUMN` -> `CREATE INDEX IF NOT EXISTS` -> inserción de perfil default para evitar fallos de columnas ausentes en bases de datos existentes.
- **Sincronización Gist**: Multi-archivo (`profiles.json`, `history.json`, `favorites.json`, `settings.json`, `sync_meta.json`) con fusión bidireccional (`mergeSyncData`), lápidas (`tombstones`) para borrados, debounce de 30s y arranque en frío optimizado con ETag.

### 5. Flujo de Git y Compilación
- **No hacer `git push`** a menos que el usuario lo solicite explícitamente.
- Siempre validar cambios con `npm run build` en el frontend y `cargo check` / `cargo test` en `src-tauri`.

### 6. Procedimiento Obligatorio para Creación y Lanzamiento de Nuevas Versiones

Para crear y publicar una nueva versión de AniCS (`major.minor.patch`):

1. **Sincronización Automática con `npm run bump`**:
   - Ejecutar el script automatizado:
     ```bash
     npm run bump <version> "<Título del Release>" "<Mejora 1|Mejora 2|Corrección 3>"
     ```
   - Este comando sincroniza simultáneamente:
     - `package.json` (`version`)
     - `src-tauri/Cargo.toml` (`[package] version`)
     - `src-tauri/tauri.conf.json` (`version`)
     - `src/services/updateService.ts` (`CURRENT_VERSION`)
     - `src/pages/desktop/DesktopSettingsPage.tsx` y `src/pages/mobile/MobileSettingsPage.tsx`
     - `src/data/changelog.json`
     - Genera `RELEASE_NOTES.md` (específico para el release actual).
     - Actualiza `CHANGELOG.md` (historial global acumulado).

2. **Diferenciación entre `RELEASE_NOTES.md` y `CHANGELOG.md`**:
   - **`RELEASE_NOTES.md`**: Archivo conciso exclusivo de la versión en curso. Es utilizado por `.github/workflows/release.yml` para el cuerpo del release en GitHub y consumido por la app en `UpdateAnnouncementModal`. Evita saturar las notas de la versión con el historial histórico.
   - **`CHANGELOG.md`**: Archivo maestro en la raíz que mantiene el historial acumulativo de todas las versiones del proyecto.

3. **Validación Previa Obligatoria**:
   - Frontend: `npm run build` y `npm test`.
   - Backend Rust: `cargo check` y `cargo test` en `src-tauri`.

4. **Flujo de Git y Publicación**:
   - **REGLA ESTRICTA**: No hacer `git push` sin autorización explícita del usuario.
   - Cuando el usuario lo indique:
     ```bash
     git add .
     git commit -m "chore: release v<version>"
     git tag v<version>
     git push origin main --tags
     ```
   - GitHub Actions generará los binarios para Windows (`AniCS-setup.exe`) y Android (`AniCS.apk`), publicándolos junto con `RELEASE_NOTES.md`.

