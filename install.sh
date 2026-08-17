#!/usr/bin/env bash
# Instala la app de lectura GLogos solo para el usuario actual.
# (El proyecto GLogos Desktop es independiente de la extensión.)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/.local/share/glogos/app"
DESKTOP_DIR="$HOME/.local/share/applications"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp "$PROJECT_DIR/app"/main.js \
   "$PROJECT_DIR/app"/application.js \
   "$PROJECT_DIR/app"/window.js \
   "$PROJECT_DIR/app"/billing.js \
   "$PROJECT_DIR/app"/storage.js \
   "$PROJECT_DIR/app"/stylesheet.css \
   "$APP_DIR/"
cp -r "$PROJECT_DIR/app"/widgets "$PROJECT_DIR/app"/lib "$APP_DIR/"

mkdir -p "$DESKTOP_DIR"
sed "s|%APP_PATH%|$APP_DIR/main.js|g" \
    "$PROJECT_DIR/app/org.glogos.app.desktop.in" \
    > "$DESKTOP_DIR/org.glogos.app.desktop"

# --- Icono de la app ---------------------------------------------------
mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
cp "$PROJECT_DIR/app/org.glogos.app.svg" \
   "$HOME/.local/share/icons/hicolor/scalable/apps/org.glogos.app.svg"
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" \
    -f -t 2>/dev/null || true

echo "GLogos Desktop instalado. La app: 'GLogos' en el escritorio."
