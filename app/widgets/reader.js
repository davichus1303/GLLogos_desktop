/**
 * Visor de capítulos.
 *
 * Ocupa la parte principal de la ventana y está dividido en secciones
 * invisibles: una por verso. Cada sección muestra el número de verso en
 * negrita en su esquina superior izquierda y el texto a continuación. Soporta
 * scroll automático para centrar verticalmente el verso seleccionado.
 *
 * También gestiona la selección usada para las notas devocionales: un clic
 * selecciona un verso, Shift+clic extiende la selección a un rango (desde el
 * ancla). Las secciones con notas se resaltan en verde (versos/rango) y una
 * nota de capítulo muestra un aviso amarillo en la cabecera.
 *
 * El marcado por colores es un modo alternativo: mientras está activo, cada
 * clic marca el versículo completo con el color elegido (nunca parte del
 * texto) y el cursor cambia a una cruz. El color se guarda en el campo
 * `markedColor` del verso, sin modificar el texto original.
 */

import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {MARK_ERASE} from './marker_bar.js';

/** Minimum text size selectable with the zoom controls (px). */
export const MIN_FONT_SIZE = 5;
/** Maximum text size selectable with the zoom controls (px). */
export const MAX_FONT_SIZE = 30;
/** Text size used when the user has not chosen one yet. */
export const DEFAULT_FONT_SIZE = 14;

/** Escapes text so it is safe inside Pango markup. */
function escapeMarkup(text) {
    return text
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

export const Reader = GObject.registerClass(
class Reader extends Gtk.ScrolledWindow {
    /**
     * @param {Object} props
     * @param {({start: number, end: number}) => void} props.onSelect - called
     *   after the verse selection changes (single verse or range).
     * @param {({numero: number, contenido: string, markedColor?: string}) => void}
     *   props.onMarked - called after a verse is marked with a color.
     * @param {number|null} props.initialFontSize - saved text size (px), or
     *   null to use the default.
     * @param {(size: number) => void} props.onFontSizeChange - called after
     *   the zoom controls change the text size.
     */
    _init(props = {}) {
        super._init();

        this._onSelect = props.onSelect;
        this._onMarked = props.onMarked;
        this._onFontSizeChange = props.onFontSizeChange;

        this.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC);
        this.set_vexpand(true);

        this._box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 14,
            margin_top: 16,
            margin_bottom: 24,
            margin_start: 28,
            margin_end: 28,
            hexpand: true,
        });

        this.set_child(this._box);

        this._sections = [];
        this._contentLabels = [];
        this._selection = null;
        this._markingColor = null;
        this._chapterNoteBanner = null;
        this._fontProvider = null;

        const initial = Number.isInteger(props.initialFontSize)
            ? props.initialFontSize
            : DEFAULT_FONT_SIZE;
        this._fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, initial));

        this._buildZoomControls();
        this._applyFontProvider();
        this._syncZoomButtons();
    }

    /**
     * Activates or deactivates the verse-marking mode. While active, clicks
     * mark (or erase) the whole verse instead of selecting it.
     * @param {string|null} color - marking color ('red', 'pink', 'green',
     *   'yellow', 'white'), MARK_ERASE to erase marks, or null to leave.
     */
    setMarkingColor(color) {
        this._markingColor = color ?? null;
        this.set_cursor(this._markingColor
            ? Gdk.Cursor.new_from_name('crosshair', null)
            : null);
    }

    /**
     * Sets the text size used for the verse content and refreshes the zoom
     * controls. The size is clamped to the [MIN_FONT_SIZE, MAX_FONT_SIZE]
     * range.
     * @param {number} size - font size in px.
     */
    setFontSize(size) {
        this._fontSize = Math.min(MAX_FONT_SIZE,
            Math.max(MIN_FONT_SIZE, Math.round(size)));
        this._applyFontProvider();
        this._syncZoomButtons();
    }

    /** Builds the zoom controls (- / +) for the separator section. */
    _buildZoomControls() {
        this._zoomOutButton = new Gtk.Button({
            icon_name: 'zoom-out-symbolic',
            css_classes: ['glogos-zoom-button'],
            tooltip_text: 'Reducir el tamaño del texto',
        });
        this._zoomInButton = new Gtk.Button({
            icon_name: 'zoom-in-symbolic',
            css_classes: ['glogos-zoom-button'],
            tooltip_text: 'Aumentar el tamaño del texto',
        });
        this._zoomOutButton.connect('clicked', () => this._changeFontSize(-1));
        this._zoomInButton.connect('clicked', () => this._changeFontSize(1));

        this._zoomControls = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        this._zoomControls.append(this._zoomOutButton);
        this._zoomControls.append(this._zoomInButton);
    }

    /** The container holding the - / + zoom buttons (placed by the owner). */
    getZoomControls() {
        return this._zoomControls;
    }

    /**
     * Applies a one-step zoom (clamped to the allowed range) and notifies the
     * owner so the new size can be persisted right away.
     * @param {number} delta - +1 to grow, -1 to shrink.
     */
    _changeFontSize(delta) {
        const next = Math.min(MAX_FONT_SIZE,
            Math.max(MIN_FONT_SIZE, this._fontSize + delta));
        if (next === this._fontSize)
            return;
        this.setFontSize(next);
        if (this._onFontSizeChange)
            this._onFontSizeChange(this._fontSize);
    }

    /** Applies the current text size to every verse content label. */
    _applyFontProvider() {
        if (this._fontProvider) {
            for (const label of this._contentLabels) {
                label.get_style_context().remove_provider(this._fontProvider);
            }
            this._fontProvider = null;
        }
        if (this._fontSize === null)
            return;

        const provider = new Gtk.CssProvider();
        const css = `.glogos-verse-content { font-size: ${this._fontSize}px; }`;
        provider.load_from_data(css, css.length);
        for (const label of this._contentLabels) {
            label.get_style_context().add_provider(
                provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        this._fontProvider = provider;
    }

    /** Disables each zoom button when the size cannot go further. */
    _syncZoomButtons() {
        this._zoomOutButton.sensitive = this._fontSize > MIN_FONT_SIZE;
        this._zoomInButton.sensitive = this._fontSize < MAX_FONT_SIZE;
    }

    /**
     * Renders a normalized chapter (see lib/bibles.js).
     * @param {Object|null} chapter - Chapter to render, or null to clear.
     */
    setChapter(chapter) {
        this._clearBox();
        this._sections = [];
        this._contentLabels = [];
        this._selection = null;

        const book = chapter?.books?.[0];
        const cap = book?.capitulos?.[0];
        if (!cap)
            return;

        this._chapterNoteBanner = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['glogos-note-chapter'],
            visible: false,
            valign: Gtk.Align.START,
            hexpand: true,
        });
        this._chapterNoteBanner.append(new Gtk.Label({
            label: 'Nota del capítulo',
            css_classes: ['glogos-note-chapter-label'],
            xalign: 0,
        }));
        this._box.append(this._chapterNoteBanner);

        // Optional Bible section headings occupy an extra section each.
        for (const heading of cap._titulos ?? [])
            this._appendHeading(heading);

        for (const verse of cap.versos)
            this._appendVerse(verse);

        this._applyNotes(cap.notas ?? []);
        this.get_vadjustment().set_value(0);
    }

    /**
     * Scrolls so the given verse ends up centered vertically.
     * @param {number} verseNumber
     */
    scrollToVerse(verseNumber) {
        const section = this._sections[verseNumber];
        if (!section)
            return;

        const result = section.translate_coordinates(this._box, 0, 0);
        if (!result)
            return;
        const y = result[2];
        const adjustment = this.get_vadjustment();
        const viewportHeight = this.get_allocation().height;
        const sectionHeight = section.get_allocation().height;
        const target = Math.max(0, y - (viewportHeight - sectionHeight) / 2);
        adjustment.set_value(target);
    }

    /**
     * Sets the note selection context and repaints the highlight.
     * @param {{start: number, end: number}|null} selection - single verse,
     *   range, or null for a chapter-level context.
     */
    setSelection(selection) {
        this._selection = selection;
        this._applySelection();
    }

    /**
     * Re-applies the note highlights (verse/range in green, chapter note
     * banner in yellow) without re-rendering the whole chapter.
     * @param {Array} notas - the chapter's note array.
     */
    updateNotes(notas) {
        this._applyNotes(notas ?? []);
    }

    /** Appends a Bible section heading as its own section. */
    _appendHeading(heading) {
        const label = new Gtk.Label({
            label: escapeMarkup(heading),
            xalign: 0,
            wrap: true,
            css_classes: ['glogos-heading'],
        });
        this._box.append(label);
    }

    /**
     * Appends a verse section: bold number on the top-left, then the text
     * with a small (2 px) separation, per the project spec. The section is
     * clickable: single click selects the verse, Shift+click extends the
     * selection to a range.
     * @param {{numero: number, contenido: string}} verse
     */
    _appendVerse(verse) {
        const numberLabel = new Gtk.Label({
            label: `<b>${verse.numero}</b>`,
            use_markup: true,
            xalign: 0,
            css_classes: ['glogos-verse-number'],
        });
        const contentLabel = new Gtk.Label({
            label: escapeMarkup(verse.contenido),
            xalign: 0,
            wrap: true,
            hexpand: true,
            css_classes: ['glogos-verse-content'],
        });
        if (this._fontProvider) {
            contentLabel.get_style_context().add_provider(
                this._fontProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        this._contentLabels.push(contentLabel);

        const section = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            hexpand: true,
            css_classes: ['glogos-section'],
        });
        section.append(numberLabel);
        section.append(contentLabel);

        // Keep the live verse object so the mark can be applied and read back.
        section.glogos_verse = verse;
        if (verse.markedColor) {
            section.glogos_prevMark = verse.markedColor;
            section.add_css_class('glogos-mark-' + verse.markedColor);
        }

        const controller = new Gtk.EventControllerLegacy();
        controller.connect('event', (_ctrl, event) => {
            if (event.get_event_type() !== Gdk.EventType.BUTTON_PRESS)
                return Gdk.EVENT_PROPAGATE;
            if (event.get_button() !== 1)
                return Gdk.EVENT_PROPAGATE;
            const shift = (event.get_modifier_state() & Gdk.ModifierType.SHIFT_MASK) !== 0;
            this._handleVersePress(verse.numero, shift);
            return Gdk.EVENT_STOP;
        });
        section.add_controller(controller);

        this._box.append(section);
        this._sections[verse.numero] = section;
    }

    /** Handles a press on a verse section (marks or selects). */
    _handleVersePress(verseNumber, shift) {
        if (this._markingColor) {
            this._markVerse(verseNumber);
            return;
        }

        let selection;
        if (shift && this._selection) {
            const anchor = this._selection.start;
            selection = {
                start: Math.min(anchor, verseNumber),
                end: Math.max(anchor, verseNumber),
            };
        } else {
            selection = {start: verseNumber, end: verseNumber};
        }
        this._selection = selection;
        this._applySelection();
        if (this._onSelect)
            this._onSelect(selection);
    }

    /**
     * Marks a whole verse with the active color (or erases its mark), always
     * replacing any previous mark.
     * @param {number} verseNumber
     */
    _markVerse(verseNumber) {
        const section = this._sections[verseNumber];
        const verse = section?.glogos_verse;
        if (!section || !verse)
            return;
        if (section.glogos_prevMark)
            section.remove_css_class('glogos-mark-' + section.glogos_prevMark);
        if (this._markingColor === MARK_ERASE) {
            delete verse.markedColor;
            section.glogos_prevMark = null;
        } else {
            verse.markedColor = this._markingColor;
            section.glogos_prevMark = this._markingColor;
            section.add_css_class('glogos-mark-' + this._markingColor);
        }
        if (this._onMarked)
            this._onMarked(verse);
    }

    /** Repaints the current-selection highlight. */
    _applySelection() {
        for (let number = 0; number < this._sections.length; number++) {
            const section = this._sections[number];
            if (!section)
                continue;
            const selected = this._selection !== null &&
                number >= this._selection.start && number <= this._selection.end;
            if (selected)
                section.add_css_class('glogos-verse-selected');
            else
                section.remove_css_class('glogos-verse-selected');
        }
    }

    /**
     * Applies the note highlights: subtle green for verses inside a
     * verse/range note (stronger on the first and last), and a light-yellow
     * banner for chapter-level notes.
     * @param {Array} notas - the chapter's note array.
     */
    _applyNotes(notas) {
        for (let number = 0; number < this._sections.length; number++) {
            const section = this._sections[number];
            if (!section)
                continue;
            section.remove_css_class('glogos-note-verse');
            section.remove_css_class('glogos-note-edge');
        }

        let chapterNote = false;
        for (const note of notas) {
            if (Number.isInteger(note?.versoInicio) && Number.isInteger(note?.versoFin)) {
                const start = Math.min(note.versoInicio, note.versoFin);
                const end = Math.max(note.versoInicio, note.versoFin);
                for (let number = start; number <= end; number++) {
                    const section = this._sections[number];
                    if (!section)
                        continue;
                    section.add_css_class('glogos-note-verse');
                    if (number === start || number === end)
                        section.add_css_class('glogos-note-edge');
                }
            } else if (note) {
                chapterNote = true;
            }
        }

        if (this._chapterNoteBanner)
            this._chapterNoteBanner.visible = chapterNote;
    }

    _clearBox() {
        while (this._box.get_first_child())
            this._box.remove(this._box.get_first_child());
    }
});
