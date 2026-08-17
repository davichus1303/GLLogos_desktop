/**
 * Modelo de licencia "Pro" de la app de lectura.
 *
 * Las versiones premium del catálogo solo pueden leerse con un plan Pro
 * activo. El estado Pro se guarda localmente; el proceso de compra real
 * (Stripe/PayPal) se conecta en UpgradeDialog cuando el propietario decida
 * integrarlo — hasta entonces hay una opción de demostración para probar.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {isPremium} from './lib/catalog.js';

const PRO_FILE = `${GLib.get_user_config_dir()}/glogos/pro.json`;

/** Reads and caches whether the user holds an active Pro plan. */
export class Billing {
    constructor() {
        this._pro = this._readPro();
    }

    /** @returns {boolean} whether Pro is active. */
    isPro() {
        return this._pro;
    }

    /** Activates or deactivates Pro locally. */
    setPro(active) {
        this._pro = active;
        this._writePro(active);
    }

    /**
     * Whether a version can be read without Pro.
     * @param {string} versionId
     * @returns {boolean}
     */
    canRead(versionId) {
        return !isPremium(versionId) || this._pro;
    }

    _readPro() {
        try {
            const file = Gio.File.new_for_path(PRO_FILE);
            if (!file.query_exists(null))
                return false;
            const [, contents] = file.load_contents(null);
            const data = JSON.parse(new TextDecoder().decode(contents));
            return data.active === true;
        } catch (error) {
            console.error('GLogos: no se pudo leer el estado Pro', error);
            return false;
        }
    }

    _writePro(active) {
        const file = Gio.File.new_for_path(PRO_FILE);
        const parent = file.get_parent();
        if (parent && !parent.query_exists(null))
            parent.make_directory_with_parents(null);
        const bytes = new TextEncoder().encode(JSON.stringify({active}, null, 2));
        file.replace_contents(bytes, null, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    }
}

/**
 * Diálogo de actualización a GLogos Pro.
 *
 * @param {Billing} billing - billing model to update.
 * @param {Gtk.Window} parent - window to attach the dialog to.
 * @param {() => void} onActivated - callback when Pro becomes active.
 */
export function showUpgradeDialog(billing, parent, onActivated) {
    const dialog = new Adw.Window({
        modal: true,
        default_width: 440,
        title: 'GLogos Pro',
    });
    dialog.set_transient_for(parent);

    const page = new Adw.PreferencesPage();

    const header = new Adw.HeaderBar();
    const closeButton = new Gtk.Button({
        label: 'Cerrar',
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    closeButton.connect('clicked', () => dialog.close());
    header.pack_end(closeButton);
    page.add(header);

    const group = new Adw.PreferencesGroup({
        title: 'Desbloquea todas las versiones',
        description: 'Con GLogos Pro accedes a todas las versiones que ofrece la '
            + 'API: asv, bbe, darby, dra, oeb, ylt, almeida, rccv y muchas más.',
    });

    const plan = new Adw.ActionRow({
        title: 'GLogos Pro — Mensual',
        subtitle: 'Precio pendiente de configurar (Stripe/PayPal).',
    });

    const demo = new Gtk.Button({label: 'Probar demo'});
    demo.connect('clicked', () => {
        billing.setPro(true);
        dialog.close();
        onActivated();
    });
    plan.add_suffix(demo);

    const buy = new Gtk.Button({
        label: 'Comprar',
        css_classes: ['suggested-action'],
    });
    buy.connect('clicked', () => {
        // TODO: conectar el proveedor de pagos real aquí (Stripe/PayPal).
        const alert = new Adw.AlertDialog({
            heading: 'Integración de pago pendiente',
            body: 'Conecta tu proveedor de pagos (Stripe/PayPal) en app/billing.js '
                + 'para habilitar la compra real. Mientras tanto usa "Probar demo".',
        });
        alert.present(dialog);
    });
    plan.add_suffix(buy);

    group.add(plan);
    page.add(group);
    dialog.set_content(page);
    dialog.present();
}
