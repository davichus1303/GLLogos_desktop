/**
 * Menú desplegable reutilizable para la barra de la app.
 *
 * Al hacer clic despliega la lista de elementos y emite la selección al
 * callback `onSelect`. Se usa para los menús de versión, libro, capítulo y
 * versículo.
 */

import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

export const MenuButton = GObject.registerClass(
class MenuButton extends Gtk.MenuButton {
    /**
     * @param {string} placeholder - Text shown while nothing is selected.
     * @param {(item: {id: *, label: string}) => void} onSelect
     */
    _init(props = {}) {
        this._onSelect = props.onSelect;
        super._init({
            child: new Gtk.Label({
                label: props.placeholder ?? '',
                xalign: 0,
            }),
            always_show_arrow: false,
            valign: Gtk.Align.CENTER,
        });

        this._items = [];

        this._listBox = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE});
        this._listBox.add_css_class('boxed-list');

        const scroll = new Gtk.ScrolledWindow({
            child: this._listBox,
            max_content_height: 420,
            propagate_natural_height: true,
            propagate_natural_width: true,
        });

        this.popover = new Gtk.Popover({child: scroll});
        this._listBox.connect('row-activated', (_list, row) => {
            this.popover.popdown();
            this._onSelect(row.glogos_item);
        });

        this.setItems([]);
    }

    /**
     * Replaces the menu items and disables the button when empty.
     * @param {Array<{id: *, label: string}>} items
     */
    setItems(items) {
        this._items = items;
        this._clearRows();

        for (const item of items) {
            const label = new Gtk.Label({
                label: item.label,
                xalign: 0,
                margin_start: 12,
                margin_end: 12,
                margin_top: 6,
                margin_bottom: 6,
            });
            const row = new Gtk.ListBoxRow({child: label});
            row.glogos_item = item;
            this._listBox.append(row);
        }

        this.sensitive = items.length > 0;
    }

    /** Sets the text shown on the button itself. */
    setLabel(text) {
        this.child.label = text;
    }

    _clearRows() {
        while (this._listBox.get_first_child())
            this._listBox.remove(this._listBox.get_first_child());
    }
});
