#!/usr/bin/env bash
set -e

# Colores para salida de consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_BIN_DIR="$HOME/.local/bin"
INSTALL_APP_DIR="$HOME/.local/share/applications"
INSTALL_ICON_DIR="$HOME/.local/share/icons/hicolor"

show_help() {
    echo "Uso: $0 [OPCIONES]"
    echo ""
    echo "Opciones:"
    echo "  --no-build     Instala el binario existente sin compilar de nuevo"
    echo "  --uninstall    Elimina AniCS del sistema de usuario (~/.local)"
    echo "  --help         Muestra este mensaje de ayuda"
    echo ""
}

uninstall_anics() {
    echo -e "${YELLOW}Desinstalando AniCS de ~/.local...${NC}"
    rm -f "$INSTALL_BIN_DIR/anics"
    rm -f "$INSTALL_APP_DIR/anics.desktop"
    rm -f "$INSTALL_ICON_DIR/32x32/apps/anics.png"
    rm -f "$INSTALL_ICON_DIR/64x64/apps/anics.png"
    rm -f "$INSTALL_ICON_DIR/128x128/apps/anics.png"
    rm -f "$INSTALL_ICON_DIR/512x512/apps/anics.png"
    
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$INSTALL_APP_DIR" >/dev/null 2>&1 || true
    fi
    echo -e "${GREEN}AniCS ha sido desinstalado correctamente.${NC}"
    exit 0
}

# Procesar argumentos
NO_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --no-build)
            NO_BUILD=true
            ;;
        --uninstall)
            uninstall_anics
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Opción desconocida: $arg${NC}"
            show_help
            exit 1
            ;;
    esac
done

echo -e "${BLUE}==============================================${NC}"
echo -e "${BLUE}       Instalador de AniCS para Linux         ${NC}"
echo -e "${BLUE}==============================================${NC}"

cd "$PROJECT_ROOT"

if [ "$NO_BUILD" = false ]; then
    echo -e "${BLUE}1. Compilando frontend y binario release con Tauri CLI...${NC}"
    npx tauri build --no-bundle
fi

RELEASE_BIN="$PROJECT_ROOT/src-tauri/target/release/anics"
if [ ! -f "$RELEASE_BIN" ]; then
    echo -e "${RED}Error: No se encontró el binario compilado en $RELEASE_BIN${NC}"
    exit 1
fi

echo -e "${BLUE}3. Instalando binario en $INSTALL_BIN_DIR...${NC}"
mkdir -p "$INSTALL_BIN_DIR"
cp "$RELEASE_BIN" "$INSTALL_BIN_DIR/anics"
chmod +x "$INSTALL_BIN_DIR/anics"

echo -e "${BLUE}4. Instalando iconos de alta resolución...${NC}"
mkdir -p "$INSTALL_ICON_DIR/32x32/apps"
mkdir -p "$INSTALL_ICON_DIR/64x64/apps"
mkdir -p "$INSTALL_ICON_DIR/128x128/apps"
mkdir -p "$INSTALL_ICON_DIR/512x512/apps"

cp "$PROJECT_ROOT/src-tauri/icons/32x32.png" "$INSTALL_ICON_DIR/32x32/apps/anics.png" 2>/dev/null || true
cp "$PROJECT_ROOT/src-tauri/icons/64x64.png" "$INSTALL_ICON_DIR/64x64/apps/anics.png" 2>/dev/null || true
cp "$PROJECT_ROOT/src-tauri/icons/128x128.png" "$INSTALL_ICON_DIR/128x128/apps/anics.png" 2>/dev/null || true
cp "$PROJECT_ROOT/src-tauri/icons/icon.png" "$INSTALL_ICON_DIR/512x512/apps/anics.png" 2>/dev/null || true

echo -e "${BLUE}5. Creando archivo de escritorio .desktop...${NC}"
mkdir -p "$INSTALL_APP_DIR"
cat <<EOF > "$INSTALL_APP_DIR/anics.desktop"
[Desktop Entry]
Name=AniCS
Comment=Cliente de streaming y descarga de anime
Exec=$INSTALL_BIN_DIR/anics %u
Icon=anics
Terminal=false
Type=Application
Categories=AudioVideo;Video;Player;Network;
StartupWMClass=anics
Keywords=anime;streaming;player;video;
EOF
chmod 644 "$INSTALL_APP_DIR/anics.desktop"

# Actualizar base de datos de escritorios e iconos si existen las herramientas
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$INSTALL_APP_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$INSTALL_ICON_DIR" >/dev/null 2>&1 || true
fi

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN} ¡AniCS se ha instalado correctamente en tu sistema! ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo -e "• ${YELLOW}Binario:${NC} $INSTALL_BIN_DIR/anics"
echo -e "• ${YELLOW}Acceso de escritorio:${NC} $INSTALL_APP_DIR/anics.desktop"
echo ""
echo -e "Ya puedes buscar ${BLUE}AniCS${NC} directamente en tu lanzador (Rofi, Wofi, Hyprland, etc.)"
echo -e "o ejecutarlo directamente escribiendo ${BLUE}anics${NC} en la terminal."
echo ""
echo -e "Para desinstalar en el futuro: ${YELLOW}bash scripts/install-linux.sh --uninstall${NC}"
