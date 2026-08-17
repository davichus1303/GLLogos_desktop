/**
 * GLogos App — aplicación GTK4/libadwaita.
 *
 * La ventana principal del lector es un proceso independiente de la
 * extensión. Ambas comparten la misma capa de datos (lib/), así que siempre
 * consultan la misma API.
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import {Bibles} from './lib/bibles.js';
import {BibleApiProvider} from './lib/providers/bibleapi.js';
import {Billing} from './billing.js';
import {Storage} from './storage.js';
import {GLogosWindow} from './window.js';

export const APP_ID = 'org.glogos.app';

const GLogosApplication = GObject.registerClass(
class GLogosApplication extends Adw.Application {
    _init() {
        super._init({
            application_id: APP_ID,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
        });

        this._startContext = null;
        this._window = null;

        this.add_main_option('version', 0, GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING, 'Versión bíblica', null);
        this.add_main_option('book', 0, GLib.OptionFlags.NONE,
            GLib.OptionArg.STRING, 'Libro', null);
        this.add_main_option('chapter', 0, GLib.OptionFlags.NONE,
            GLib.OptionArg.INT, 'Capítulo', null);
        this.add_main_option('verse', 0, GLib.OptionFlags.NONE,
            GLib.OptionArg.INT, 'Versículo', null);

        this._bibles = new Bibles(new BibleApiProvider());
        this._billing = new Billing();
        this._storage = new Storage();

        this.connect('startup', () => {
            this._loadStylesheet();
        });
    }

    /** Loads the app's own CSS (reader sections, verse numbers…). */
    _loadStylesheet() {
        const manager = new Gtk.CssProvider();
        const [entryPath] = GLib.filename_from_uri(import.meta.url);
        const cssFile = Gio.File.new_for_path(
            GLib.path_get_dirname(entryPath) + '/stylesheet.css');
        try {
            manager.load_from_file(cssFile);
            Gtk.StyleContext.add_provider_for_display(
                Gdk.Display.get_default(),
                manager,
                Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        } catch (error) {
            console.error('GLogos: no se pudo cargar la hoja de estilos', error);
        }
    }

    /** Handles the command line (context passed by the extension). */
    vfunc_command_line(commandLine) {
        const options = commandLine.get_options_dict();
        const args = commandLine.get_arguments();
        const context = {version: null, book: null, chapter: null, verse: null};

        const readInt = key => {
            const value = options.lookup_value(key, GLib.VariantType.new('i'));
            return value ? value.get_int32() : null;
        };
        context.chapter = readInt('chapter');
        context.verse = readInt('verse');

        // GJS no siempre coloca las opciones string en el dict, así que se
        // reparsean los argumentos restantes por si acaso.
        for (let i = 0; i < args.length; i++) {
            const value = args[i + 1];
            switch (args[i]) {
            case '--version':
                if (value && !value.startsWith('--'))
                    context.version = value;
                i += 1;
                break;
            case '--book':
                if (value && !value.startsWith('--'))
                    context.book = value;
                i += 1;
                break;
            case '--chapter':
                if (value && !Number.isNaN(Number(value)))
                    context.chapter = Number(value);
                i += 1;
                break;
            case '--verse':
                if (value && !Number.isNaN(Number(value)))
                    context.verse = Number(value);
                i += 1;
                break;
            }
        }

        this._startContext = context;
        this.activate();
        return 0;
    }

    /** Shows the window, restoring the last reading context. */
    vfunc_activate() {
        if (!this._window) {
            this._window = new GLogosWindow({
                application: this,
                startContext: this._startContext,
                bibles: this._bibles,
                billing: this._billing,
                storage: this._storage,
            });
        }
        this._window.present();
        this._startContext = null;
    }
});

export {GLogosApplication};
