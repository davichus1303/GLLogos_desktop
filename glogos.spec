# GLogos Desktop — RPM spec (app de lectura, proyecto independiente)
#
#   rpmbuild -bb glogos.spec

Name:           glogos-desktop
Version:        1.0
Release:        1%{?dist}
Summary:        GLogos Desktop — lector de la Biblia para GNOME
License:        MIT
URL:            https://github.com/david/glogos-desktop
Source0:        glogos-desktop-%{version}.tar.gz

BuildArch:      noarch
Requires:       gjs
Requires:       libadwaita
Requires:       gtk4
Requires:       libsoup3

%description
GLogos Desktop es un lector de la Biblia GTK4/libadwaita con selección de
versión, libro, capítulo y versículo. Permite importar versiones propias
(botón +) y guarda referencias y notas. Es independiente de la extensión
de GNOME Shell; solo comparten la carpeta de versiones locales.

%prep
%setup -q -n GLogos%20Desktop

%install
install -d %{buildroot}%{_datadir}/glogos/app
install -d %{buildroot}%{_datadir}/applications
install -d %{buildroot}%{_datadir}/icons/hicolor/scalable/apps

cp app/main.js \
   app/application.js \
   app/window.js \
   app/billing.js \
   app/storage.js \
   app/stylesheet.css \
   %{buildroot}%{_datadir}/glogos/app/
cp -r app/widgets %{buildroot}%{_datadir}/glogos/app/
cp -r app/lib %{buildroot}%{_datadir}/glogos/app/

sed "s|%APP_PATH%|%{_datadir}/glogos/app/main.js|g" \
    app/org.glogos.app.desktop.in \
    > %{buildroot}%{_datadir}/applications/org.glogos.app.desktop

cp app/org.glogos.app.svg %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/

%post
update-desktop-database %{_datadir}/applications >/dev/null 2>&1 || :
gtk-update-icon-cache %{_datadir}/icons/hicolor -f -t >/dev/null 2>&1 || :

%files
%{_datadir}/glogos/app/
%{_datadir}/applications/org.glogos.app.desktop
%{_datadir}/icons/hicolor/scalable/apps/org.glogos.app.svg

%changelog
* Sat Aug 15 2026 David <david@local> - 1.0-1
- Primera versión.
