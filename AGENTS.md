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
