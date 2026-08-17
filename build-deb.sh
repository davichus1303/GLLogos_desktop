#!/usr/bin/env bash
# Genera el paquete .deb de la app de lectura GLogos (proyecto independiente).
set -euo pipefail

PKG_NAME="glogos-desktop"
VERSION="1.0"
ARCH="all"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE_DIR="$PROJECT_DIR/.build/${PKG_NAME}_${VERSION}"
DIST_DIR="$PROJECT_DIR/dist"
APP_INSTALL_DIR="$STAGE_DIR/usr/share/glogos/app"
CONTROL_DIR="$STAGE_DIR/DEBIAN"

rm -rf "$STAGE_DIR"
mkdir -p "$APP_INSTALL_DIR" "$CONTROL_DIR" "$DIST_DIR"

cp "$PROJECT_DIR/app"/main.js \
   "$PROJECT_DIR/app"/application.js \
   "$PROJECT_DIR/app"/window.js \
   "$PROJECT_DIR/app"/billing.js \
   "$PROJECT_DIR/app"/storage.js \
   "$PROJECT_DIR/app"/stylesheet.css \
   "$APP_INSTALL_DIR/"
cp -r "$PROJECT_DIR/app"/widgets "$PROJECT_DIR/app"/lib "$APP_INSTALL_DIR/"

mkdir -p "$STAGE_DIR/usr/share/applications"
sed "s|%APP_PATH%|/usr/share/glogos/app/main.js|g" \
    "$PROJECT_DIR/app/org.glogos.app.desktop.in" \
    > "$STAGE_DIR/usr/share/applications/org.glogos.app.desktop"

# --- Icono de la app ---------------------------------------------------
mkdir -p "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps"
cp "$PROJECT_DIR/app/org.glogos.app.svg" \
   "$STAGE_DIR/usr/share/icons/hicolor/scalable/apps/org.glogos.app.svg"

# --- Postinst: refrescar el escritorio ---------------------------------
cat > "$CONTROL_DIR/postinst" <<'EOF'
#!/bin/sh
set -e
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
fi
exit 0
EOF
chmod 755 "$CONTROL_DIR/postinst"

INSTALLED_SIZE="$(du -sk "$STAGE_DIR" | cut -f1)"

cat > "$CONTROL_DIR/control" <<EOF
Package: $PKG_NAME
Version: ${VERSION}-1
Architecture: $ARCH
Maintainer: David <david@local>
Depends: gjs, gir1.2-adw-1, gir1.2-gtk-4.0, gir1.2-soup-3.0
Section: gnome
Priority: optional
Installed-Size: $INSTALLED_SIZE
Description: GLogos Desktop - lector de la Biblia
 Lector de la Biblia GTK4/libadwaita con selección de versión, libro,
 capítulo y versículo. Importa versiones propias y guarda referencias y notas.
EOF

dpkg-deb --build --root-owner-group "$STAGE_DIR" "$DIST_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb"

rm -rf "$STAGE_DIR"

echo "Paquete generado: $DIST_DIR/${PKG_NAME}_${VERSION}_${ARCH}.deb"
