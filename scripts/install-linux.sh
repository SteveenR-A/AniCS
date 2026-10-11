#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_PREFIX="$HOME/.local"
INSTALL_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
NO_BUILD=false
UNINSTALL=false

show_help() {
    cat <<EOF
Uso: $0 [OPCIONES]
  --no-build       Instala el binario release existente sin compilar
  --prefix RUTA    Instala binario, iconos y acceso en RUTA (absoluta)
  --uninstall      Elimina la instalación, conservando datos y descargas
  --help          Muestra esta ayuda

Por defecto: ~/.local/bin y \$XDG_DATA_HOME (o ~/.local/share).
Ejecuta npm ci antes de compilar. Consulta README.md para dependencias Linux.
EOF
}

while (($#)); do
    case "$1" in
        --no-build) NO_BUILD=true; shift ;;
        --uninstall) UNINSTALL=true; shift ;;
        --prefix)
            if (($# < 2)) || [[ "$2" != /* ]]; then
                echo "Error: --prefix requiere una ruta absoluta." >&2
                exit 1
            fi
            INSTALL_PREFIX="${2%/}"
            INSTALL_DATA_DIR="$INSTALL_PREFIX/share"
            shift 2
            ;;
        --help|-h) show_help; exit 0 ;;
        *) echo "Opción desconocida: $1" >&2; show_help; exit 1 ;;
    esac
done

if [[ "$(uname -s)" != Linux ]]; then
    echo "Este instalador solo admite Linux." >&2
    exit 1
fi

INSTALL_BIN_DIR="$INSTALL_PREFIX/bin"
INSTALL_APP_DIR="$INSTALL_DATA_DIR/applications"
INSTALL_ICON_DIR="$INSTALL_DATA_DIR/icons/hicolor"
# Evitar sintaxis de campos/expansiones en la línea Exec del archivo .desktop.
if [[ "$INSTALL_BIN_DIR" == *['\\"`$%']* || "$INSTALL_BIN_DIR" == *$'\n'* ]]; then
    echo "La ruta de instalación contiene caracteres no admitidos en el acceso .desktop." >&2
    exit 1
fi

refresh_desktop() {
    if command -v update-desktop-database >/dev/null 2>&1 && [[ -d "$INSTALL_APP_DIR" ]]; then
        update-desktop-database "$INSTALL_APP_DIR" >/dev/null 2>&1 || true
    fi
    if command -v gtk-update-icon-cache >/dev/null 2>&1 && [[ -d "$INSTALL_ICON_DIR" ]]; then
        gtk-update-icon-cache -f -t "$INSTALL_ICON_DIR" >/dev/null 2>&1 || true
    fi
}

if [[ "$UNINSTALL" == true ]]; then
    rm -f "$INSTALL_BIN_DIR/anics" "$INSTALL_APP_DIR/anics.desktop"
    for size in 32x32 64x64 128x128 512x512; do
        rm -f "$INSTALL_ICON_DIR/$size/apps/anics.png"
    done
    refresh_desktop
    echo "AniCS desinstalado. Se conservaron los datos y las descargas."
    exit 0
fi

# Compilation can succeed with WebKitGTK development libraries while the media
# plugins are absent. Check containers/parsers as well as the H.264 decoder.
if ! command -v gst-inspect-1.0 >/dev/null 2>&1; then
    echo "Falta gst-inspect-1.0; instala GStreamer y sus plugins base, good, bad y libav antes de instalar AniCS." >&2
    exit 1
fi
MISSING_MEDIA_PLUGINS=()
for plugin in playbin qtdemux h264parse aacparse avdec_h264 avdec_aac; do
    if ! gst-inspect-1.0 "$plugin" >/dev/null 2>&1; then
        MISSING_MEDIA_PLUGINS+=("$plugin")
    fi
done
if ((${#MISSING_MEDIA_PLUGINS[@]})); then
    echo "Faltan componentes multimedia: ${MISSING_MEDIA_PLUGINS[*]}" >&2
    echo "Arch/Manjaro: sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav" >&2
    echo "Debian/Ubuntu: sudo apt-get install gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav" >&2
    exit 1
fi

cd "$PROJECT_ROOT"
if [[ "$NO_BUILD" == false ]]; then
    for tool in node npm cargo rustc pkg-config cc; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "Falta $tool. Consulta los requisitos Linux en README.md." >&2
            exit 1
        fi
    done
    if ! pkg-config --exists gtk+-3.0 webkit2gtk-4.1 dbus-1; then
        echo "Faltan dependencias de desarrollo GTK 3, WebKitGTK 4.1 o D-Bus. Consulta README.md." >&2
        exit 1
    fi
    if [[ ! -x node_modules/.bin/tauri ]]; then
        echo "Faltan dependencias del proyecto. Ejecuta npm ci y vuelve a intentarlo." >&2
        exit 1
    fi
    echo "Compilando AniCS para Linux..."
    npm run tauri -- build --no-bundle
fi

# Cargo puede usar un target_directory distinto mediante variables o config.toml.
TARGET_DIR="$PROJECT_ROOT/src-tauri/target"
if command -v cargo >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
    TARGET_DIR="$(cd "$PROJECT_ROOT/src-tauri" && cargo metadata --offline --no-deps --format-version 1 |
        node -e 'let data=""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(data).target_directory));')"
fi
RELEASE_BIN="$TARGET_DIR/${CARGO_BUILD_TARGET:+$CARGO_BUILD_TARGET/}release/anics"
if [[ ! -x "$RELEASE_BIN" ]]; then
    echo "No se encontró un binario ejecutable en $RELEASE_BIN" >&2
    exit 1
fi

# Sustituir de forma atómica permite actualizar un ejecutable que esté en uso.
mkdir -p "$INSTALL_BIN_DIR" "$INSTALL_APP_DIR"
TEMP_BIN="$(mktemp "$INSTALL_BIN_DIR/.anics.XXXXXX")"
trap 'rm -f "$TEMP_BIN"' EXIT
install -m755 "$RELEASE_BIN" "$TEMP_BIN"
mv -f "$TEMP_BIN" "$INSTALL_BIN_DIR/anics"

for size in 32x32 64x64 128x128; do
    install -Dm644 "$PROJECT_ROOT/src-tauri/icons/$size.png" "$INSTALL_ICON_DIR/$size/apps/anics.png"
done
install -Dm644 "$PROJECT_ROOT/src-tauri/icons/icon.png" "$INSTALL_ICON_DIR/512x512/apps/anics.png"
cat > "$INSTALL_APP_DIR/anics.desktop" <<EOF
[Desktop Entry]
Name=AniCS
Comment=Cliente de streaming y descarga de anime
Exec="$INSTALL_BIN_DIR/anics"
Icon=anics
Terminal=false
Type=Application
Categories=AudioVideo;Video;Player;
StartupWMClass=anics
Keywords=anime;streaming;player;video;
EOF
chmod 644 "$INSTALL_APP_DIR/anics.desktop"
refresh_desktop

echo "AniCS instalado en $INSTALL_BIN_DIR/anics"
echo "Acceso de escritorio: $INSTALL_APP_DIR/anics.desktop"
if [[ ":$PATH:" != *":$INSTALL_BIN_DIR:"* ]]; then
    echo "Añade $INSTALL_BIN_DIR a PATH para ejecutar anics desde la terminal."
fi
