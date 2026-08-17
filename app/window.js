/**
 * Ventana principal del lector.
 *
 * Barra superior con los menús seleccionables (versión, libro, capítulo y
 * versículo) y el botón "+" para versiones aportadas por el usuario; cuerpo
 * con el visor de capítulos. Comportamiento según especificación:
 *
 *  - Versión: al seleccionarla, si hay libro y capítulo el texto se recarga
 *    en la nueva versión; si no, el texto queda vacío.
 *  - Libro: al seleccionarlo se limpian capítulo, versículo y texto.
 *  - Capítulo: al seleccionarlo se muestra el capítulo completo.
 *  - Versículo: al seleccionarlo el visor hace scroll para centrarlo.
 *  - Versiones premium sin plan Pro: el texto se vacía y se muestra el aviso.
 */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {BOOKS, findBook} from './lib/books.js';
import {
    referencesForVersion,
    removeReference,
    upsertReference,
} from './lib/references.js';
import {writeJsonFile} from './lib/localversions.js';
import {showUpgradeDialog} from './billing.js';
import {MenuButton} from './widgets/menu_button.js';
import {MarkerBar} from './widgets/marker_bar.js';
import {NotesPanel} from './widgets/notes_panel.js';
import {Reader} from './widgets/reader.js';
import {ReferencesSidebar} from './widgets/references_sidebar.js';

const EMPTY_MESSAGE = 'Elige un libro y un capítulo para empezar a leer.';
const LOCKED_MESSAGE = 'Para mostrar todas las versiones disponibles, activa GLogos Pro.';
const ERROR_MESSAGE = 'No se pudo cargar el capítulo. Comprueba tu conexión.';

/** Default width of the references sidebar, as a % of the window width. */
const DEFAULT_REFERENCES_WIDTH = 10;
/** Default width of the notes panel, as a % of the window width. */
const DEFAULT_NOTES_WIDTH = 10;
/** Minimum width of a side panel, as a % of the window width. */
const MIN_SIDE_WIDTH = 5;
/** Maximum width of a side panel, as a % of the window width. */
const MAX_SIDE_WIDTH = 80;
/** Minimum width kept for the Bible text, as a % of the window width. */
const MIN_TEXT_WIDTH = 10;

/**
 * Paned that keeps its split at a fixed ratio of its own width. The ratio
 * follows the drags made by the user on the handle, and the owner is
 * notified of each change so the new widths can be persisted.
 */
const MIN_TRUSTED_RATIO = 0.05;
const MAX_TRUSTED_RATIO = 0.92;

const RatioPaned = GObject.registerClass(
class RatioPaned extends Gtk.Paned {
    _init(ratio) {
        super._init({
            orientation: Gtk.Orientation.HORIZONTAL,
            resize_start_child: false,
            resize_end_child: false,
            shrink_end_child: true,
        });
        this._ratio = ratio;
        this._adjusting = false;
        this._ready = false;
        this._onRatioChanged = null;
        this._stableAllocs = 0;
        this._lastWidth = 0;
        this.connect('notify::position', () => this._onPositionChanged());
    }

    /**
     * Stores the desired ratio. The position is applied by the size-allocate
     * hook, which always runs with the current width (applying it here could
     * use a stale width and let GTK clamp the position to a wrong value).
     */
    setRatio(ratio) {
        this._ratio = ratio;
    }

    /**
     * Follows the position set by the user's drag. Only trusted when the
     * paned width has been stable for a few allocations (transient values
     * from the initial layout are discarded) and the resulting ratio is
     * within sane bounds.
     */
    _onPositionChanged() {
        if (this._adjusting || !this._ready || this._stableAllocs < 2)
            return;
        const alloc = this.get_allocation();
        if (alloc.width <= 1)
            return;
        const ratio = this.get_position() / alloc.width;
        if (ratio < MIN_TRUSTED_RATIO || ratio > MAX_TRUSTED_RATIO)
            return;
        this._ratio = ratio;
        if (this._onRatioChanged)
            this._onRatioChanged(ratio);
    }
    vfunc_size_allocate(width, height, baseline) {
        if (width > 1 && !this._adjusting) {
            const target = Math.round(width * this._ratio);
            if (this.get_position() !== target) {
                this._adjusting = true;
                this.set_position(target);
            }
        }
        super.vfunc_size_allocate(width, height, baseline);
        this._adjusting = false;
        this._stableAllocs = (width === this._lastWidth) ? this._stableAllocs + 1 : 0;
        this._lastWidth = width;
        this._ready = true;
    }
});

const GLogosWindow = GObject.registerClass(
class GLogosWindow extends Adw.ApplicationWindow {
    /**
     * @param {Object} params
     * @param {Gtk.Application} params.application
     * @param {Object} params.startContext - context passed by the extension.
     * @param {Object} params.bibles - shared Bibles facade.
     * @param {Object} params.billing - Pro license model.
     * @param {Object} params.storage - local state and custom versions.
     */
    _init({application, startContext, bibles, billing, storage}) {
        super._init({
            application,
            title: 'GLogos',
            icon_name: 'org.glogos.app',
            default_width: 940,
            default_height: 720,
        });

        this._bibles = bibles;
        this._billing = billing;
        this._storage = storage;

        this._customVersions = storage.listCustomVersions();
        this._providerVersions = [];
        this._webNotes = storage.loadWebNotes();

        const saved = storage.loadState();
        this._version = startContext?.version ?? saved.version ?? 'web';
        this._book = startContext?.book ?? saved.book ?? null;
        this._chapter = startContext?.chapter ?? saved.chapter ?? null;
        this._verse = startContext?.verse ?? saved.verse ?? null;
        this._currentChapter = null;
        this._currentChapterObject = null;
        this._notesContext = null;
        this._markingColor = null;
        this._references = storage.loadReferences();
        this._settings = storage.loadSettings();
        this._referencesWidth = this._loadWidthSetting(
            this._settings.referencesWidth, DEFAULT_REFERENCES_WIDTH);
        this._notesWidth = this._loadWidthSetting(
            this._settings.notesWidth, DEFAULT_NOTES_WIDTH);
        if (this._referencesWidth + this._notesWidth > 100 - MIN_TEXT_WIDTH)
            this._notesWidth = 100 - MIN_TEXT_WIDTH - this._referencesWidth;
        this._textWidth = 100 - this._referencesWidth - this._notesWidth;
        this._settingsTimer = null;
        this._navResizePending = false;

        this._buildUi();
        this._syncReferencesSidebar();
        this._loadProviderVersions().then(() => this._applyState());
    }

    // ------------------------------------------------------------------
    // UI construction
    // ------------------------------------------------------------------

    _buildUi() {
        this._versionMenu = new MenuButton({
            placeholder: 'Versión',
            onSelect: item => this._onVersionSelected(item.id),
        });
        this._bookMenu = new MenuButton({
            placeholder: 'Libro',
            onSelect: item => this._onBookSelected(item.id),
        });
        this._chapterMenu = new MenuButton({
            placeholder: 'Capítulo',
            onSelect: item => this._onChapterSelected(item.id),
        });
        this._verseMenu = new MenuButton({
            placeholder: 'Versículo',
            onSelect: item => this._onVerseSelected(item.id),
        });

        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            tooltip_text: 'Importar una versión propia',
            css_classes: ['flat'],
        });
        addButton.connect('clicked', () => this._onImportVersion());

        const header = new Adw.HeaderBar();
        header.pack_start(this._versionMenu);
        header.pack_start(this._bookMenu);
        header.pack_start(this._chapterMenu);
        header.pack_start(this._verseMenu);
        header.pack_end(addButton);

        this._subtitle = new Gtk.Label({
            label: '',
            css_classes: ['dim-label'],
            xalign: 0,
        });
        header.title_widget = new Adw.WindowTitle({
            title: 'GLogos',
        });
        header.title_widget.subtitle = this._subtitle.get_text();

        this._reader = new Reader({
            onSelect: selection => this._onReaderSelect(selection),
            onMarked: () => this._onVerseMarked(),
            initialFontSize: Number.isInteger(this._settings.fontSize)
                ? this._settings.fontSize
                : null,
            onFontSizeChange: size => this._onFontSizeChange(size),
        });
        this._emptyView = this._buildMessageView(EMPTY_MESSAGE);
        this._lockedView = this._buildLockedView();
        this._errorView = this._buildMessageView(ERROR_MESSAGE);
        this._spinner = new Gtk.Spinner({halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER});

        this._stack = new Gtk.Stack({
            transition_type: Gtk.StackTransitionType.CROSSFADE,
        });
        this._stack.add_named(this._reader, 'reader');
        this._stack.add_named(this._emptyView, 'empty');
        this._stack.add_named(this._lockedView, 'locked');
        this._stack.add_named(this._errorView, 'error');
        this._stack.add_named(this._spinner, 'loading');

        this._notesPanel = new NotesPanel({
            onNotesChanged: () => this._onNotesChanged(),
        });
        this._notesPanel.set_visible(false);

        this._markerBar = new MarkerBar({
            onColorSelected: color => this._onMarkColorSelected(color),
        });
        this._markerBar.set_visible(false);

        // The marker bar sits below the Bible text box and spans its full
        // width, so the reader is stacked in a column with the bar beneath.
        // The "Separador" bar sits at the top of that column: it always has
        // the same width as the Bible text (never the notes panel).
        this._stack.set_vexpand(true);

        const separatorBar = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['glogos-separator-bar'],
            margin_start: 12,
            margin_end: 12,
            margin_top: 8,
        });
        this._separatorButton = this._buildSeparatorButton();
        this._separatorButton.hexpand = true;
        separatorBar.append(this._separatorButton);
        separatorBar.append(this._reader.getZoomControls());

        // Chapter navigation bars (< regresar, > adelantar) flanking the
        // biblical text box at its extremes, with its full height.
        this._prevChapterBar = this._buildChapterNavBar('<', true);
        this._nextChapterBar = this._buildChapterNavBar('>', false);

        this._chapterNavRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
        });
        this._chapterNavRow.append(this._prevChapterBar);
        this._chapterNavRow.append(this._stack);
        this._chapterNavRow.append(this._nextChapterBar);

        const readingColumn = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });
        readingColumn.append(separatorBar);
        readingColumn.append(this._chapterNavRow);
        readingColumn.append(this._markerBar);

        // The notes panel keeps its saved share of the window width: the
        // inner paned spans the width left by the sidebar, so its ratio is
        // compensated for the sidebar.
        this._split = new RatioPaned(this._splitRatio());
        this._split.set_start_child(readingColumn);
        this._split.set_end_child(this._notesPanel);

        this._sidebar = new ReferencesSidebar({
            onSelect: reference => this._onReferenceSelected(reference),
            onDelete: reference => this._onReferenceDeleted(reference),
        });

        // The references sidebar takes its saved share of the window width;
        // the reading area (with the notes panel) uses the rest.
        this._outerSplit = new RatioPaned(this._referencesWidth / 100);
        this._outerSplit.set_start_child(this._sidebar);
        this._outerSplit.set_end_child(this._split);

        this._outerSplit._onRatioChanged =
            ratio => this._onSidebarRatioChanged(ratio);
        this._split._onRatioChanged =
            ratio => this._onNotesRatioChanged(ratio);

        const toolbar = new Adw.ToolbarView({content: this._outerSplit});
        toolbar.add_top_bar(header);
        this.set_content(toolbar);

        this.connect('close-request', () => {
            this._notesPanel.flush();
            this._persistState();
            this._flushSettings();
        });
    }

    /** Re-sizes the chapter navigation bars whenever the window changes. */
    vfunc_size_allocate(width, height, baseline) {
        super.vfunc_size_allocate(width, height, baseline);
        // Changing a width-request here (mid-allocation) would re-enter the
        // layout pass, so the sizing is deferred to an idle callback.
        if (this._navResizePending)
            return;
        this._navResizePending = true;
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._navResizePending = false;
            this._updateChapterNavBarWidth();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Width of each navigation bar: 5% of the biblical text box, which is
     * the stack width minus the two bars.
     */
    _updateChapterNavBarWidth() {
        if (!this._chapterNavRow || !this._stack)
            return;
        const stackWidth = this._stack.get_allocation().width;
        const barWidth = this._prevChapterBar.visible
            ? Math.max(1, Math.round(stackWidth * 0.05 / 1.1))
            : 0;
        if (this._prevChapterBar.width_request !== barWidth) {
            this._prevChapterBar.width_request = barWidth;
            this._nextChapterBar.width_request = barWidth;
        }
    }

    /** Builds the "Separador" control (icon + label as a single button). */
    _buildSeparatorButton() {
        const content = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
        });
        content.append(new Gtk.Image({icon_name: 'bookmark-new-symbolic'}));
        content.append(new Gtk.Label({label: 'Separador'}));

        const button = new Gtk.Button({
            child: content,
            css_classes: ['flat'],
            tooltip_text: 'Guardar la referencia de lectura actual',
        });
        button.connect('clicked', () => this._onSeparatorPressed());
        return button;
    }

    /**
     * Builds a full-height chapter navigation bar: "<" to go back one
     * chapter and ">" to go forward, placed at the extremes of the biblical
     * text box.
     * @param {string} symbol - '<' or '>'.
     * @param {boolean} isPrevious - whether the bar goes back a chapter.
     */
    _buildChapterNavBar(symbol, isPrevious) {
        const bar = new Gtk.Button({
            child: new Gtk.Label({
                label: symbol,
                css_classes: ['glogos-chapter-nav-label'],
            }),
            css_classes: ['glogos-chapter-nav'],
            valign: Gtk.Align.FILL,
            visible: false,
            sensitive: false,
        });
        bar.connect('clicked', () => this._onChapterNavClicked(isPrevious));
        return bar;
    }

    /** Navigates one chapter backward/forward via the < > bars. */
    _onChapterNavClicked(isPrevious) {
        if (!this._book || !this._chapter)
            return;
        const total = this._chapterItems().length;
        const target = isPrevious ? this._chapter - 1 : this._chapter + 1;
        if (target < 1 || target > total)
            return;
        this._onChapterSelected(target);
    }

    /** Shows/hides the chapter navigation bars and enables/disables them. */
    _updateChapterNavState() {
        const loaded = this._book != null &&
            this._chapter != null &&
            this._stack.get_visible_child_name() === 'reader';
        this._prevChapterBar.visible = loaded;
        this._nextChapterBar.visible = loaded;
        if (!loaded) {
            this._prevChapterBar.sensitive = false;
            this._nextChapterBar.sensitive = false;
            return;
        }
        const total = this._chapterItems().length;
        this._prevChapterBar.sensitive = this._chapter > 1;
        this._nextChapterBar.sensitive = this._chapter < total;
        this._updateChapterNavBarWidth();
    }

    /** Builds a centered message view used for empty/error states. */
    _buildMessageView(text) {
        const label = new Gtk.Label({
            label: text,
            wrap: true,
            css_classes: ['dim-label'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 48,
            margin_end: 48,
        });
        return label;
    }

    /** Builds the paywall message with the upgrade button. */
    _buildLockedView() {
        const box = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            margin_top: 24,
            margin_bottom: 24,
            margin_start: 48,
            margin_end: 48,
        });
        box.append(new Gtk.Label({label: LOCKED_MESSAGE, wrap: true, justify: Gtk.Justification.CENTER}));

        const upgrade = new Gtk.Button({
            label: 'Activar Pro',
            css_classes: ['suggested-action'],
        });
        upgrade.connect('clicked', () => {
            showUpgradeDialog(this._billing, this, () => {
                if (this._book && this._chapter)
                    this._loadChapter();
                else
                    this._showEmpty();
            });
        });
        box.append(upgrade);
        return box;
    }

    // ------------------------------------------------------------------
    // Version catalog
    // ------------------------------------------------------------------

    /** Loads the provider version list and merges user-contributed ones. */
    async _loadProviderVersions() {
        this._providerVersions = await this._bibles.listVersions();
        this._refreshVersionMenu();
    }

    /** All known versions: user-contributed first, then the provider. */
    _allVersions() {
        const custom = this._customVersions.map(version => ({
            id: version.id,
            name: `${version.name} (personalizada)`,
            custom: true,
        }));
        const provider = this._providerVersions.map(version => ({
            id: version.id,
            name: version.name,
            custom: false,
        }));
        return [...custom, ...provider];
    }

    _refreshVersionMenu() {
        const items = this._allVersions().map(version => ({
            id: version.id,
            label: version.name,
        }));
        this._versionMenu.setItems(items);
        const current = this._allVersions().find(v => v.id === this._version);
        if (current)
            this._versionMenu.setLabel(current.name);
    }

    /** Whether the active version was contributed by the user. */
    _customVersionData() {
        return this._customVersions.find(v => v.id === this._version)?.data;
    }

    /** The full local-version entry (id, name, path, data), if any. */
    _customVersionEntry() {
        return this._customVersions.find(v => v.id === this._version) ?? null;
    }

    /** The books selectable for the active version. */
    _bookItems() {
        const data = this._customVersionData();
        if (data) {
            return data.books.map(book => ({id: book.name, label: book.name}));
        }
        return BOOKS.map(book => ({id: book.id, label: book.name}));
    }

    /** The chapter numbers selectable for the active book. */
    _chapterItems() {
        const data = this._customVersionData();
        if (data) {
            const book = data.books.find(entry => entry.name === this._book);
            return Array.from(
                {length: book?.capitulos?.length ?? 0},
                (_, index) => ({id: index + 1, label: `Capítulo ${index + 1}`}));
        }
        const count = findBook(this._book)?.chapters ?? 0;
        return Array.from({length: count},
            (_, index) => ({id: index + 1, label: `Capítulo ${index + 1}`}));
    }

    // ------------------------------------------------------------------
    // Selection handling
    // ------------------------------------------------------------------

    /** Selects a version; reloads the current chapter when possible. */
    _onVersionSelected(versionId) {
        this._version = versionId;
        this._refreshVersionMenu();
        this._refreshBookMenu();
        this._syncReferencesSidebar();

        if (this._book && this._chapter) {
            if (this._billing.canRead(versionId))
                this._loadChapter();
            else
                this._showLocked();
        } else {
            this._showEmpty();
        }
        this._persistState();
    }

    /** Selects a book; clears chapter, verse and the text. */
    _onBookSelected(bookId) {
        this._clearMarkingMode();
        this._book = bookId;
        this._chapter = null;
        this._verse = null;
        this._currentChapter = null;
        this._currentChapterObject = null;
        this._notesContext = null;

        this._bookMenu.setLabel(this._bookItems().find(b => b.id === bookId)?.label ?? bookId);
        this._chapterMenu.setItems(this._chapterItems());
        this._chapterMenu.setLabel('Capítulo');
        this._verseMenu.setItems([]);
        this._verseMenu.setLabel('Versículo');

        this._showEmpty();
        this._persistState();
        this._syncReferencesSidebar();
    }

    /** Selects a chapter; loads and shows the full chapter. */
    _onChapterSelected(chapterNumber) {
        this._chapter = chapterNumber;
        this._verse = null;
        this._notesContext = null;
        this._chapterMenu.setLabel(`Capítulo ${chapterNumber}`);
        this._loadChapter();
        this._persistState();
        this._syncReferencesSidebar();
    }

    /** Selects a verse; scrolls the reader to center it. */
    _onVerseSelected(verseNumber) {
        this._verse = verseNumber;
        this._verseMenu.setLabel(`Versículo ${verseNumber}`);
        this._setNoteContext({start: verseNumber, end: verseNumber});
        this._reader.scrollToVerse(verseNumber);
        this._persistState();
    }

    /** Selection changed from the reader (click or shift+click range). */
    _onReaderSelect(selection) {
        this._verse = selection.end;
        this._verseMenu.setLabel(`Versículo ${selection.end}`);
        this._setNoteContext(selection);
        this._reader.scrollToVerse(selection.end);
        this._persistState();
    }

    // ------------------------------------------------------------------
    // Reading references ("Separador")
    // ------------------------------------------------------------------

    /**
     * Saves the current reading position as a reference. If the book already
     * has one, it is updated instead of duplicated.
     */
    _onSeparatorPressed() {
        if (!this._book || !this._chapter)
            return;
        this._references = upsertReference(this._references, {
            version: this._version,
            book: this._book,
            chapter: this._chapter,
        });
        this._storage.saveReferences(this._references);
        this._syncReferencesSidebar();
    }

    /** Navigates to the book/chapter of the activated reference. */
    _onReferenceSelected(reference) {
        this._navigateTo(reference.book, reference.chapter);
    }

    /** Removes a saved reference and persists the change immediately. */
    _onReferenceDeleted(reference) {
        this._references = removeReference(this._references, {
            version: this._version,
            book: reference.book,
        });
        this._storage.saveReferences(this._references);
        this._syncReferencesSidebar();
    }

    /**
     * The reader changed its text size: persists it right away, without any
     * confirmation.
     * @param {number} size - new text size in px.
     */
    _onFontSizeChange(size) {
        this._settings = {...this._settings, fontSize: size};
        this._storage.saveSettings(this._settings);
    }

    /** Reads a width (in % of the window) from settings with fallback. */
    _loadWidthSetting(value, fallback) {
        if (!Number.isFinite(value))
            return fallback;
        return Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, Math.round(value)));
    }

    /** Ratio that gives the notes panel its saved share of the window. */
    _splitRatio() {
        const remaining = 100 - this._referencesWidth;
        return remaining > 0 ? (remaining - this._notesWidth) / remaining : 0.5;
    }

    /** Applies new panel widths, keeping the text column at least MIN_TEXT_WIDTH. */
    _updateWidths({refs = null, notes = null} = {}) {
        let r = refs !== null
            ? Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, refs))
            : this._referencesWidth;
        let n = notes !== null
            ? Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, notes))
            : this._notesWidth;
        if (r + n > 100 - MIN_TEXT_WIDTH)
            n = 100 - MIN_TEXT_WIDTH - r;
        this._referencesWidth = r;
        this._notesWidth = n;
        this._textWidth = 100 - r - n;
    }

    /** The user dragged the sidebar handle: store the width and re-tune the notes. */
    _onSidebarRatioChanged(ratio) {
        const refs = Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, Math.round(ratio * 100)));
        if (refs === this._referencesWidth)
            return;
        this._updateWidths({refs});
        this._outerSplit.setRatio(refs / 100);
        this._split.setRatio(this._splitRatio());
        this._scheduleSettingsSave();
    }

    /** The user dragged the notes handle: store the new notes width. */
    _onNotesRatioChanged(ratio) {
        const refs = this._referencesWidth;
        const notes = Math.round((1 - ratio) * (100 - refs));
        if (notes === this._notesWidth)
            return;
        this._updateWidths({notes});
        this._split.setRatio(this._splitRatio());
        this._scheduleSettingsSave();
    }

    /** Debounces the settings write after the paned drags. */
    _scheduleSettingsSave() {
        if (this._settingsTimer)
            GLib.source_remove(this._settingsTimer);
        this._settingsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
            this._settingsTimer = null;
            this._saveSettingsNow();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Writes the settings immediately (used when the window closes). */
    _flushSettings() {
        if (this._settingsTimer) {
            GLib.source_remove(this._settingsTimer);
            this._settingsTimer = null;
        }
        this._saveSettingsNow();
    }

    _saveSettingsNow() {
        this._settings = {
            ...this._settings,
            referencesWidth: this._referencesWidth,
            textWidth: this._textWidth,
            notesWidth: this._notesWidth,
        };
        this._storage.saveSettings(this._settings);
    }

    /** Selects a book and opens its chapter in one step. */
    _navigateTo(book, chapter) {
        this._book = book;
        const bookItem = this._bookItems().find(entry => entry.id === book);
        this._bookMenu.setLabel(bookItem?.label ?? book);
        this._chapterMenu.setItems(this._chapterItems());
        this._onChapterSelected(chapter);
    }

    /** Refreshes the sidebar with the references of the active version. */
    _syncReferencesSidebar() {
        const items = referencesForVersion(this._references, this._version)
            .map(reference => ({
                book: reference.book,
                chapter: reference.chapter,
                label: this._referenceLabel(reference),
            }));
        this._sidebar.setReferences(items);
        this._sidebar.setActiveBook(this._book);
    }

    /** Renders the display name of a reference (book + chapter). */
    _referenceLabel(reference) {
        const book = this._bookItems().find(entry => entry.id === reference.book);
        const name = book?.label ?? reference.book;
        return `${name} ${reference.chapter}`;
    }

    // ------------------------------------------------------------------
    // Chapter loading
    // ------------------------------------------------------------------

    /** Fetches and renders the selected chapter, honoring the paywall. */
    async _loadChapter() {
        if (!this._book || !this._chapter)
            return;

        this._clearMarkingMode();

        if (!this._billing.canRead(this._version)) {
            this._showLocked();
            return;
        }

        this._stack.set_visible_child_name('loading');
        this._spinner.start();

        try {
            let chapterData;
            const custom = this._customVersionData();
            if (custom) {
                chapterData = this._storage.readChapter(
                    custom, this._book, this._chapter);
                this._currentChapterObject = custom.books
                    ?.find(entry => entry.name === this._book)
                    ?.capitulos?.find(entry => entry.numero === this._chapter) ?? null;
            } else {
                const webKey = `${this._book}|${this._chapter}`;
                if (!this._webNotes[webKey])
                    this._webNotes[webKey] = {notas: []};
                this._currentChapterObject = this._webNotes[webKey];
                chapterData = await this._bibles.getChapter(
                    this._version, this._book, this._chapter);
            }

            if (!chapterData)
                throw new Error('Capítulo no encontrado');

            this._currentChapter = chapterData;
            const chapter = chapterData.books[0].capitulos[0];
            this._verseMenu.setItems(chapter.versos.map(verse => ({
                id: verse.numero,
                label: `Versículo ${verse.numero}`,
            })));

            this._reader.setChapter(chapterData);
            this._stack.set_visible_child_name('reader');
            this._updateChapterNavState();

            this._syncNotesPanel();

            if (this._verse) {
                this._verseMenu.setLabel(`Versículo ${this._verse}`);
                this._reader.scrollToVerse(this._verse);
            }
            this._updateSubtitle();
        } catch (error) {
            console.error('GLogos: error al cargar el capítulo', error);
            this._currentChapterObject = null;
            this._markerBar.set_visible(false);
            this._stack.set_visible_child_name('error');
            this._updateChapterNavState();
        } finally {
            this._spinner.stop();
        }
    }

    /** Shows/hides the notes panel and marker bar, binding them for locals. */
    _syncNotesPanel() {
        const chapter = this._currentChapterObject;
        if (!chapter) {
            this._notesPanel.set_visible(false);
            this._markerBar.set_visible(false);
            return;
        }
        this._notesPanel.set_visible(true);
        this._markerBar.set_visible(true);
        this._notesPanel.bindChapter(
            chapter,
            this._currentChapter.books[0].name,
            this._currentChapter.books[0].capitulos[0].numero);
        this._reader.updateNotes(chapter.notas ?? []);

        if (this._verse)
            this._setNoteContext({start: this._verse, end: this._verse});
        else
            this._setNoteContext(null);
    }

    /** Updates the note context for the notes panel and the reader. */
    _setNoteContext(context) {
        this._notesContext = context;
        this._reader.setSelection(context);
        if (this._currentChapterObject)
            this._notesPanel.setContext(context);
    }

    // ------------------------------------------------------------------
    // User-contributed versions ("+")
    // ------------------------------------------------------------------

    /** Opens the import dialog for a user-contributed Bible (JSON). */
    _onImportVersion() {
        const filter = new Gtk.FileFilter();
        filter.add_pattern('*.json');
        filter.set_name('Biblia (JSON)');

        const fileDialog = new Gtk.FileDialog({
            title: 'Importar una versión propia',
            accept_label: 'Importar',
            default_filter: filter,
        });

        fileDialog.open(this, null, (_dialog, result) => {
            try {
                const file = fileDialog.open_finish(result);
                const [, contents] = file.load_contents(null);
                const data = JSON.parse(new TextDecoder().decode(contents));

                const outcome = this._storage.importUserVersion(data);
                if (!outcome.ok) {
                    this._showAlert('No se pudo importar',
                        outcome.errors.join('\n'));
                    return;
                }

                this._customVersions = this._storage.listCustomVersions();
                this._refreshVersionMenu();
                this._onVersionSelected(outcome.id);
                this._showAlert('Importada',
                    `La versión "${outcome.id}" quedó disponible en la app.`);
            } catch (error) {
                console.error('GLogos: error al importar versión', error);
                this._showAlert('No se pudo importar',
                    'El archivo no es un JSON válido.');
            }
        });
    }

    /** Shows a simple informational dialog. */
    _showAlert(title, body) {
        const alert = new Adw.AlertDialog({heading: title, body});
        alert.present(this);
    }

    // ------------------------------------------------------------------
    // State helpers
    // ------------------------------------------------------------------

    _updateSubtitle() {
        const book = this._bookItems().find(b => b.id === this._book)?.label ?? this._book;
        let text = `${this._version} · ${book}`;
        if (this._chapter)
            text += ` ${this._chapter}`;
        if (this._verse)
            text += `:${this._verse}`;
        this._subtitle.text = text;
        this._subtitle.set_visible(true);
    }

    _persistState() {
        this._storage.saveState({
            version: this._version,
            book: this._book,
            chapter: this._chapter,
            verse: this._verse,
        });
    }

    /** Restores the saved/startup context once versions are loaded. */
    _applyState() {
        const current = this._allVersions().find(v => v.id === this._version);
        if (current)
            this._versionMenu.setLabel(current.name);

        this._refreshBookMenu();

        if (this._book && this._chapter) {
            if (this._billing.canRead(this._version))
                this._loadChapter();
            else
                this._showLocked();
        } else {
            this._showEmpty();
        }
    }

    /** Rebuilds the book menu for the active version. */
    _refreshBookMenu() {
        const items = this._bookItems();
        this._bookMenu.setItems(items);
        if (this._book) {
            const current = items.find(book => book.id === this._book);
            if (current)
                this._bookMenu.setLabel(current.label);
            else
                this._book = null;
        }
        if (!this._book) {
            this._bookMenu.setLabel('Libro');
            this._chapterMenu.setItems([]);
            this._chapterMenu.setLabel('Capítulo');
        }
    }

    _showEmpty() {
        this._spinner.stop();
        this._currentChapterObject = null;
        this._notesPanel.set_visible(false);
        this._markerBar.set_visible(false);
        this._stack.set_visible_child_name('empty');
        this._updateChapterNavState();
    }

    _showLocked() {
        this._spinner.stop();
        this._notesPanel.set_visible(false);
        this._markerBar.set_visible(false);
        this._stack.set_visible_child_name('locked');
        this._updateChapterNavState();
    }

    // ------------------------------------------------------------------
    // Notes persistence
    // ------------------------------------------------------------------

    /** Notes changed: persist the local Bible and refresh highlights. */
    _onNotesChanged() {
        const entry = this._customVersionEntry();
        if (entry && this._currentChapterObject) {
            writeJsonFile(entry.path, entry.data);
            this._reader.updateNotes(this._currentChapterObject.notas ?? []);
        } else if (this._currentChapterObject) {
            this._storage.saveWebNotes(this._webNotes);
            this._reader.updateNotes(this._currentChapterObject.notas ?? []);
        }
    }

    // ------------------------------------------------------------------
    // Verse marking (marcadores de color)
    // ------------------------------------------------------------------

    /**
     * Starts the marking mode with the chosen color. The notes panel is
     * locked while marking so no note can be created or saved; a verse click
     * marks the whole verse and leaves the mode.
     * @param {string} color - 'red', 'pink', 'green' or 'yellow'.
     */
    _onMarkColorSelected(color) {
        this._markingColor = color;
        this._markerBar.setActiveColor(color);
        this._notesPanel.flush();
        this._notesPanel.setEnabled(false);
        this._reader.setMarkingColor(color);
    }

    /** A verse was marked: persist the local Bible and stop marking. */
    _onVerseMarked() {
        const entry = this._customVersionEntry();
        if (entry && this._currentChapterObject)
            writeJsonFile(entry.path, entry.data);
        this._clearMarkingMode();
    }

    /** Leaves the marking mode: unlocks the notes and restores the cursor. */
    _clearMarkingMode() {
        if (this._markingColor === null)
            return;
        this._markingColor = null;
        this._markerBar.setActiveColor(null);
        this._notesPanel.setEnabled(true);
        this._reader.setMarkingColor(null);
    }
});

export {GLogosWindow};
