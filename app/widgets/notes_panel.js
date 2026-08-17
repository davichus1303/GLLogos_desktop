/**
 * Panel de notas devocionales ("Tiempo con Dios").
 *
 * Ocupa el 20% derecho de la ventana y toda su altura. Muestra la referencia
 * de la selección actual, un editor de Markdown, la vista previa renderizada
 * y la lista de notas del capítulo.
 *
 * Comportamiento:
 *  - Al escribir sobre una nota existente, se actualiza (sin duplicarla).
 *  - Pulsar Enter dos veces seguidas crea una nota independiente que hereda
 *    la misma referencia.
 *  - La referencia (capítulo, verso o rango) se captura al crear la nota y
 *    no cambia aunque cambie la selección después.
 *  - Autoguardado con debounce: los cambios se confirman vía el callback
 *    `onNotesChanged`, que la ventana usa para volcar el JSON local.
 */

import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {markdownToPango} from '../lib/markdown.js';
import {
    createChapterNote,
    createVerseNote,
    matchesContext,
    noteRefText,
    pruneEmptyNotes,
} from '../lib/notes.js';

const AUTOSAVE_MS = 800;
const PLACEHOLDER = 'Escribe tu nota (Markdown)…';

export const NotesPanel = GObject.registerClass(
class NotesPanel extends Gtk.Box {
    /**
     * @param {Object} props
     * @param {() => void} props.onNotesChanged - called when notes change so
     *   the window can persist the local Bible and refresh highlights.
     */
    _init(props = {}) {
        super._init({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['glogos-notes-panel'],
        });

        this._onNotesChanged = props.onNotesChanged;

        this._chapter = null;
        this._bookName = '';
        this._chapterNumber = null;
        this._context = null;
        this._activeNote = null;
        this._loading = false;
        this._dirty = false;
        this._saveTimer = null;

        this._buildUi();
    }

    _buildUi() {
        const header = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_start: 12,
            margin_end: 12,
            margin_top: 12,
            margin_bottom: 8,
        });
        this._refLabel = new Gtk.Label({
            label: '',
            xalign: 0,
            wrap: true,
            css_classes: ['glogos-notes-ref'],
        });
        header.append(this._refLabel);
        header.append(new Gtk.Separator());
        this.append(header);

        this._editor = new Gtk.TextView({
            wrap_mode: Gtk.WrapMode.WORD_CHAR,
            accepts_tab: false,
            hexpand: true,
            vexpand: true,
        });
        this._editor.add_css_class('glogos-notes-editor');

        this._placeholder = new Gtk.Label({
            label: PLACEHOLDER,
            xalign: 0,
            valign: Gtk.Align.START,
            halign: Gtk.Align.FILL,
            css_classes: ['dim-label'],
            can_target: false,
            margin_start: 10,
            margin_top: 8,
        });
        const editorOverlay = new Gtk.Overlay({child: this._editor});
        editorOverlay.add_overlay(this._placeholder);

        const editorScroll = new Gtk.ScrolledWindow({
            child: editorOverlay,
            propagate_natural_height: true,
            min_content_height: 120,
        });
        this.append(editorScroll);

        this._preview = new Gtk.Label({
            xalign: 0,
            valign: Gtk.Align.START,
            wrap: true,
            selectable: false,
            use_markup: true,
            css_classes: ['glogos-notes-preview'],
        });
        const previewScroll = new Gtk.ScrolledWindow({
            child: this._preview,
            propagate_natural_height: true,
            vexpand: true,
        });
        this.append(previewScroll);

        const listHeader = new Gtk.Label({
            label: 'Notas del capítulo',
            xalign: 0,
            css_classes: ['glogos-notes-list-header'],
        });
        const listHeaderBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2,
            margin_start: 12,
            margin_end: 12,
            margin_top: 8,
        });
        listHeaderBox.append(listHeader);
        listHeaderBox.append(new Gtk.Separator());
        this.append(listHeaderBox);

        this._list = new Gtk.ListBox({
            selection_mode: Gtk.SelectionMode.NONE,
            css_classes: ['boxed-list'],
        });
        this._list.connect('row-activated', (_list, row) => {
            if (row.glogos_note)
                this._editNote(row.glogos_note);
        });
        const listScroll = new Gtk.ScrolledWindow({
            child: this._list,
            propagate_natural_height: true,
            max_content_height: 220,
        });
        this.append(listScroll);

        this._buffer = this._editor.buffer;
        this._buffer.connect('changed', () => this._onBufferChanged());

        this._keyController = new Gtk.EventControllerKey();
        this._keyController.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
            if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
                if (this._isDoubleEnter()) {
                    this._splitNote();
                    return Gdk.EVENT_STOP;
                }
            }
            return Gdk.EVENT_PROPAGATE;
        });
        this._editor.add_controller(this._keyController);
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    /**
     * Binds the panel to a live chapter object (must be the same object held
     * by the local Bible data) and resets the context.
     * @param {Object} chapter - live chapter object (may hold `notas`).
     * @param {string} bookName - book name as stored in the Bible.
     * @param {number} chapterNumber - chapter number.
     */
    bindChapter(chapter, bookName, chapterNumber) {
        this._flushIfDirty();
        this._chapter = chapter;
        this._bookName = bookName;
        this._chapterNumber = chapterNumber;
        this._context = null;
        this._activeNote = this._resolveActiveNote();
        this._updateRefLabel();
        this._loadIntoEditor(this._activeNote?.nota ?? '');
        this._reloadList();
    }

    /**
     * Changes the selection context (null = chapter, otherwise a verse or
     * range). Pending edits are flushed before switching.
     * @param {{start: number, end: number}|null} context
     */
    setContext(context) {
        this._flushIfDirty();
        this._context = context;
        this._activeNote = this._resolveActiveNote();
        this._updateRefLabel();
        this._loadIntoEditor(this._activeNote?.nota ?? '');
        this._reloadList();
    }

    /** Immediately persists pending edits (called on close). */
    flush() {
        this._flushIfDirty();
    }

    /**
     * Enables or disables the whole panel. While the verse-marking mode is
     * active the panel is disabled so no note can be created or saved.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.sensitive = enabled;
    }

    // ------------------------------------------------------------------
    // Editor / note management
    // ------------------------------------------------------------------

    /** Saves pending edits before a context/note switch. */
    _flushIfDirty() {
        if (this._saveTimer) {
            GLib.source_remove(this._saveTimer);
            this._saveTimer = null;
        }
        if (!this._dirty)
            return;
        this._dirty = false;
        if (this._activeNote)
            this._activeNote.updatedAt = new Date().toISOString();
        pruneEmptyNotes(this._chapter);
        if (this._activeNote && !this._chapter?.notas?.includes(this._activeNote))
            this._activeNote = null;
        if (this._onNotesChanged)
            this._onNotesChanged();
    }

    /** Schedules the debounced autosave. */
    _scheduleSave() {
        this._dirty = true;
        if (this._saveTimer)
            GLib.source_remove(this._saveTimer);
        this._saveTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, AUTOSAVE_MS, () => {
            this._saveTimer = null;
            this._flushIfDirty();
            return GLib.SOURCE_REMOVE;
        });
    }

    /** Finds the note matching the current context (most recent first). */
    _resolveActiveNote() {
        const notes = this._chapter?.notas ?? [];
        const matches = notes
            .filter(note => matchesContext(note, this._context))
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        return matches[0] ?? null;
    }

    /** Loads text into the editor without treating it as user input. */
    _loadIntoEditor(text) {
        this._loading = true;
        this._buffer.text = text;
        this._loading = false;
        this._updatePreview();
    }

    /** Whether the next Enter keypress would create an empty line. */
    _isDoubleEnter() {
        if (this._buffer.cursor_position !== this._buffer.get_char_count())
            return false;
        return this._buffer.text.endsWith('\n');
    }

    /** Splits the current note and starts a new one with the same context. */
    _splitNote() {
        if (!this._activeNote || !this._chapter)
            return;

        const text = this._buffer.text.replace(/\n+$/, '');
        this._activeNote.nota = text;
        this._activeNote.updatedAt = new Date().toISOString();

        const note = this._context
            ? createVerseNote('', this._context.start, this._context.end)
            : createChapterNote('');
        if (!this._chapter.notas)
            this._chapter.notas = [];
        this._chapter.notas.push(note);
        this._activeNote = note;

        this._loadIntoEditor('');
        this._reloadList();
        this._scheduleSave();
        this._editor.grab_focus();
    }

    /** Handles editor content changes (create/update the active note). */
    _onBufferChanged() {
        if (this._loading)
            return;

        this._updatePreview();

        const text = this._buffer.text;
        if (!this._activeNote) {
            if (text.trim() === '')
                return;
            if (!this._chapter || this._chapterNumber === null)
                return;
            this._activeNote = this._context
                ? createVerseNote(text, this._context.start, this._context.end)
                : createChapterNote(text);
            if (!this._chapter.notas)
                this._chapter.notas = [];
            this._chapter.notas.push(this._activeNote);
            this._reloadList();
        } else {
            this._activeNote.nota = text;
            this._activeNote.updatedAt = new Date().toISOString();
        }
        this._scheduleSave();
    }

    /** Loads an existing note into the editor. */
    _editNote(note) {
        if (this._activeNote === note)
            return;
        this._flushIfDirty();
        this._activeNote = note;
        this._loadIntoEditor(note.nota);
        this._reloadList();
        this._editor.grab_focus();
    }

    /** Removes a note and schedules a save. */
    _deleteNote(note) {
        if (!this._chapter?.notas)
            return;
        const index = this._chapter.notas.indexOf(note);
        if (index === -1)
            return;
        this._chapter.notas.splice(index, 1);
        if (this._activeNote === note) {
            this._activeNote = null;
            this._loadIntoEditor('');
        }
        this._reloadList();
        this._scheduleSave();
    }

    // ------------------------------------------------------------------
    // UI helpers
    // ------------------------------------------------------------------

    /** Renders the editor text into the preview label. */
    _updatePreview() {
        this._preview.label = markdownToPango(this._buffer.text);
        this._placeholder.visible = this._buffer.get_char_count() === 0;
    }

    /** Updates the reference shown at the top of the panel. */
    _updateRefLabel() {
        if (!this._bookName || this._chapterNumber === null) {
            this._refLabel.label = '';
            return;
        }
        let text = `${this._bookName} ${this._chapterNumber}`;
        if (this._context) {
            if (this._context.start === this._context.end)
                text += `:${this._context.start}`;
            else
                text += `:${this._context.start}–${this._context.end}`;
        }
        this._refLabel.label = text;
    }

    /** Rebuilds the list of the chapter's notes. */
    _reloadList() {
        while (this._list.get_first_child())
            this._list.remove(this._list.get_first_child());

        for (const note of this._chapter?.notas ?? []) {
            const ref = new Gtk.Label({
                label: noteRefText(note),
                xalign: 0,
                css_classes: ['dim-label', 'glogos-notes-list-ref'],
            });
            const snippet = new Gtk.Label({
                label: note.nota.replace(/\s+/g, ' ').trim() || '(vacía)',
                xalign: 0,
                ellipsize: 0,
                wrap: false,
                single_line_mode: true,
                css_classes: ['glogos-notes-list-snippet'],
            });
            const deleteButton = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                css_classes: ['flat'],
                tooltip_text: 'Eliminar nota',
                valign: Gtk.Align.CENTER,
            });
            deleteButton.connect('clicked', () => this._deleteNote(note));

            const textBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 2,
                hexpand: true,
            });
            textBox.append(ref);
            textBox.append(snippet);

            const rowBox = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                spacing: 6,
                margin_start: 8,
                margin_end: 8,
                margin_top: 6,
                margin_bottom: 6,
            });
            rowBox.append(textBox);
            rowBox.append(deleteButton);

            const row = new Gtk.ListBoxRow({child: rowBox});
            row.glogos_note = note;
            if (note === this._activeNote)
                row.add_css_class('glogos-notes-active');
            this._list.append(row);
        }
    }
});
