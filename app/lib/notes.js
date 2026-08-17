/**
 * Notas devocionales ("Tiempo con Dios").
 *
 * Las notas viven dentro del propio JSON de la Biblia local, en un campo
 * opcional `notas` del objeto del capítulo:
 *
 * {
 *   "numero": 3,
 *   "versos": [...],
 *   "notas": [{
 *       "id": "uuid",
 *       "nota": "texto en Markdown",
 *       "createdAt": "ISO-8601",
 *       "updatedAt": "ISO-8601",
 *       "versoInicio": 1,   // opcional: nota de capítulo no lo lleva
 *       "versoFin": 1       // opcional
 *   }]
 * }
 *
 * Una nota de capítulo no tiene `versoInicio`/`versoFin`. Una nota de verso
 * único los lleva iguales. Una nota de rango lleva primero/último. La
 * referencia se captura al crear la nota y nunca cambia después.
 */

import GLib from 'gi://GLib';

/** Generates a unique note id. */
export function newNoteId() {
    return GLib.uuid_string_random();
}

/** Whether a note refers to a verse/range (as opposed to a chapter). */
function isVerseNote(note) {
    return Boolean(note) &&
        Number.isInteger(note.versoInicio) &&
        Number.isInteger(note.versoFin);
}

/** Creates a chapter-level note. */
export function createChapterNote(text) {
    const now = new Date().toISOString();
    return {id: newNoteId(), nota: text, createdAt: now, updatedAt: now};
}

/** Creates a verse/range note (start/end may be in any order). */
export function createVerseNote(text, start, end) {
    const now = new Date().toISOString();
    return {
        id: newNoteId(),
        nota: text,
        createdAt: now,
        updatedAt: now,
        versoInicio: Math.min(start, end),
        versoFin: Math.max(start, end),
    };
}

/**
 * Whether a note belongs to a given selection context.
 * @param {Object} note - a note object.
 * @param {{start: number, end: number}|null} context - selection context,
 *   or null for a chapter-level note.
 * @returns {boolean}
 */
export function matchesContext(note, context) {
    if (!note)
        return false;
    if (!context)
        return !isVerseNote(note);
    return note.versoInicio === context.start && note.versoFin === context.end;
}

/** Human-readable reference for a note (for the notes list). */
export function noteRefText(note) {
    if (!isVerseNote(note))
        return 'Capítulo';
    if (note.versoInicio === note.versoFin)
        return `Versículo ${note.versoInicio}`;
    return `Versículos ${note.versoInicio}–${note.versoFin}`;
}

/**
 * Removes empty notes from a chapter and deletes the `notas` field when
 * nothing remains (keeps the Bible JSON clean).
 * @param {Object} chapter - live chapter object.
 * @returns {boolean} whether the chapter was modified.
 */
export function pruneEmptyNotes(chapter) {
    if (!chapter || !Array.isArray(chapter.notas))
        return false;
    const kept = chapter.notas.filter(
        note => note && typeof note.nota === 'string' && note.nota.trim() !== '');
    if (kept.length === chapter.notas.length)
        return false;
    chapter.notas = kept;
    if (kept.length === 0)
        delete chapter.notas;
    return true;
}
