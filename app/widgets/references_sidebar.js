/**
 * Barra lateral de referencias de lectura.
 *
 * Ocupa el 10% izquierdo de la ventana y lista las referencias guardadas
 * (libro + capítulo, sin texto de los versículos). Cada referencia es un
 * elemento interactivo: al activarla se navega al capítulo correspondiente.
 * La referencia del libro que se está leyendo se resalta como activa.
 *
 * El widget no conoce Providers ni Storage: recibe los elementos ya
 * resueltos ({book, chapter, label}) y emite la selección vía onSelect.
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const ReferencesSidebar = GObject.registerClass(
class ReferencesSidebar extends Gtk.Box {
    /**
     * @param {Object} props
     * @param {({book: string, chapter: number}) => void} props.onSelect
     *   - called when a reference is activated.
     * @param {({book: string, chapter: number}) => void} props.onDelete
     *   - called when a reference's delete button is pressed.
     */
    _init(props = {}) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['glogos-references-sidebar'],
        });

        this._onSelect = props.onSelect;
        this._onDelete = props.onDelete;
        this._items = [];
        this._activeBook = null;

        this._buildUi();
    }

    _buildUi() {
        const header = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_start: 8,
            margin_end: 8,
            margin_top: 12,
            margin_bottom: 8,
        });
        header.append(new Gtk.Label({
            label: 'Referencias',
            xalign: 0,
            css_classes: ['glogos-references-header'],
        }));
        header.append(new Gtk.Separator());
        this.append(header);

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this._list.connect('row-activated', (_list, row) => {
            if (row.glogos_reference)
                this._onSelect(row.glogos_reference);
        });
        this.append(this._list);
    }

    /**
     * Replaces the displayed references.
     * @param {Array<{book: string, chapter: number, label: string}>} items
     */
    setReferences(items) {
        this._items = items;
        this._reloadList();
    }

    /**
     * Highlights the saved reference of the book being read (if any).
     * @param {string|null} book - book identifier of the active chapter.
     */
    setActiveBook(book) {
        this._activeBook = book;
        this._reloadList();
    }

    _reloadList() {
        while (this._list.get_first_child())
            this._list.remove(this._list.get_first_child());

        for (const item of this._items) {
            const row = new Gtk.ListBoxRow();
            row.glogos_reference = {book: item.book, chapter: item.chapter};
            if (item.book === this._activeBook)
                row.add_css_class('glogos-references-active');

            const label = new Gtk.Label({
                label: item.label,
                xalign: 0,
                margin_start: 8,
                margin_end: 8,
                margin_top: 6,
                margin_bottom: 6,
                wrap: true,
                hexpand: true,
            });
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Eliminar referencia',
                valign: Gtk.Align.CENTER,
                margin_end: 6,
                visible: false,
            });
            deleteButton.connect('clicked', () => {
                if (row.glogos_reference)
                    this._onDelete(row.glogos_reference);
            });

            const motion = new Gtk.EventControllerMotion();
            motion.connect('enter', () => deleteButton.set_visible(true));
            motion.connect('leave', () => deleteButton.set_visible(false));
            row.add_controller(motion);

            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
            });
            rowBox.append(label);
            rowBox.append(deleteButton);
            row.set_child(rowBox);

            this._list.append(row);
        }
    }
});
