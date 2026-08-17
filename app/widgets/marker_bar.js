/**
 * Barra de marcadores de versículos.
 *
 * Se muestra inmediatamente debajo del recuadro del texto bíblico y ocupa el
 * 100% de su ancho. En el extremo izquierdo hay un pincel meramente
 * decorativo; a continuación los botones circulares (rojo, rosa, verde,
 * amarillo y blanco) con los que se elige el color de marcado activo, y al
 * final un botón con una X que quita el marcado del versículo elegido.
 *
 * El color/tool elegido se notifica vía `onColorSelected`; la ventana se
 * encarga de activar el modo de marcado en el lector y de bloquear las notas.
 */

import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

/** Colors available for marking, in display order. */
const MARK_COLORS = ['red', 'pink', 'green', 'yellow', 'white'];

/** Marker tool that erases the verse mark instead of applying a color. */
export const MARK_ERASE = 'erase';

/** Display labels used in tooltips. */
const COLOR_LABELS = {
    red: 'rojo',
    pink: 'rosa',
    green: 'verde',
    yellow: 'amarillo',
    white: 'blanco',
};

/** The active color button gets this CSS class as visual feedback. */
const ACTIVE_CLASS = 'glogos-mark-color-active';

export const MarkerBar = GObject.registerClass(
class MarkerBar extends Gtk.Box {
    /**
     * @param {Object} props
     * @param {(color: string) => void} props.onColorSelected - called with
     *   the selected color identifier ('red', 'pink', 'green', 'yellow' or
     *   'white') or with MARK_ERASE to remove a verse mark.
     */
    _init(props = {}) {
        super._init({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
            css_classes: ['glogos-marker-bar'],
            margin_top: 4,
        });

        this._onColorSelected = props.onColorSelected;
        this._buttons = new Map();

        this._buildUi();
    }

    _buildUi() {
        const brush = new Gtk.Image({
            paintable: Gdk.Texture.new_from_filename(this._brushPath()),
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Marcar versículos por colores',
        });
        this.append(brush);

        for (const color of MARK_COLORS) {
            const button = new Gtk.Button({
                css_classes: ['glogos-mark-color', color],
                tooltip_text: `Marcar en ${COLOR_LABELS[color] ?? color}`,
                valign: Gtk.Align.CENTER,
            });
            button.connect('clicked', () => {
                this._onColorSelected?.(color);
            });
            this._buttons.set(color, button);
            this.append(button);
        }

        const eraseButton = new Gtk.Button({
            css_classes: ['glogos-mark-color', 'glogos-mark-erase'],
            tooltip_text: 'Quitar el marcado del versículo',
            valign: Gtk.Align.CENTER,
            child: new Gtk.Image({icon_name: 'window-close-symbolic'}),
        });
        eraseButton.connect('clicked', () => {
            this._onColorSelected?.(MARK_ERASE);
        });
        this._buttons.set(MARK_ERASE, eraseButton);
        this.append(eraseButton);
    }

    /**
     * Highlights the button of the active marking tool, if any.
     * @param {string|null} color - active color, MARK_ERASE, or null.
     */
    setActiveColor(color) {
        for (const [name, button] of this._buttons) {
            if (name === color)
                button.add_css_class(ACTIVE_CLASS);
            else
                button.remove_css_class(ACTIVE_CLASS);
        }
    }

    /** Absolute path of the decorative brush icon next to this file. */
    _brushPath() {
        const [uri] = GLib.filename_from_uri(import.meta.url);
        return GLib.build_filenamev([
            GLib.path_get_dirname(uri),
            'brush.svg',
        ]);
    }
});
