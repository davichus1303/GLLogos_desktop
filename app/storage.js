/**
 * Almacenamiento local de la app de lectura.
 *
 * Persiste el contexto de lectura (versión, libro, capítulo, versículo) en
 * XDG_CONFIG_HOME. Las biblias locales (aportadas por el usuario) viven en
 * XDG_DATA_HOME y las gestiona el módulo compartido lib/localversions.js,
 * que también usa la extensión para el versículo diario.
 */

import GLib from 'gi://GLib';

import {
    readJsonFile,
    writeJsonFile,
    listLocalVersions,
    addLocalVersion,
} from './lib/localversions.js';

const STATE_DIR = `${GLib.get_user_config_dir()}/glogos`;

/**
 * Persistence helper for the reading state and user-contributed versions.
 */
export class Storage {
    /**
     * @returns {Object} the last reading context
     *   ({version, book, chapter, verse}).
     */
    loadState() {
        const state = readJsonFile(`${STATE_DIR}/state.json`) ?? {};
        return {
            version: typeof state.version === 'string' ? state.version : null,
            book: typeof state.book === 'string' ? state.book : null,
            chapter: Number.isInteger(state.chapter) ? state.chapter : null,
            verse: Number.isInteger(state.verse) ? state.verse : null,
        };
    }

    /**
     * Persists the reading context.
     * @param {Object} state - {version, book, chapter, verse}.
     */
    saveState(state) {
        writeJsonFile(`${STATE_DIR}/state.json`, state);
    }

    /**
     * Loads the saved reading references (see lib/references.js).
     * @returns {Array<{version: string, book: string, chapter: number,
     *   createdAt: string, updatedAt: string}>}
     */
    loadReferences() {
        const data = readJsonFile(`${STATE_DIR}/references.json`);
        return Array.isArray(data) ? data : [];
    }

    /**
     * Persists the reading references.
     * @param {Array} references - references to store.
     */
    saveReferences(references) {
        writeJsonFile(`${STATE_DIR}/references.json`, references);
    }

    /**
     * Loads the app settings (e.g. the reader text size).
     * @returns {Object} the saved settings ({} when none).
     */
    loadSettings() {
        const data = readJsonFile(`${STATE_DIR}/settings.json`);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }

    /**
     * Persists the app settings.
     * @param {Object} settings - settings to store.
     */
    saveSettings(settings) {
        writeJsonFile(`${STATE_DIR}/settings.json`, settings);
    }

    /**
     * Lists the local Bibles present on disk.
     * @returns {Array<{id: string, name: string, path: string}>}
     */
    listCustomVersions() {
        return listLocalVersions();
    }

    /**
     * Imports a local Bible (project JSON format).
     * @param {Object} data - parsed JSON payload.
     * @returns {{ok: boolean, id?: string, errors?: string[]}}
     */
    importUserVersion(data) {
        return addLocalVersion(data);
    }

    /**
     * Loads devotional notes for web (non-local) versions.
     * Stored in a separate file keyed by book+chapter.
     * @returns {Object} map of "book|chapter" → {notas: [...]}.
     */
    loadWebNotes() {
        const data = readJsonFile(`${STATE_DIR}/web_notes.json`);
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }

    /**
     * Persists the full web notes map.
     * @param {Object} webNotes - the full map to save.
     */
    saveWebNotes(webNotes) {
        writeJsonFile(`${STATE_DIR}/web_notes.json`, webNotes);
    }

    /**
     * Extracts a chapter from user-contributed data.
     * @param {Object} data - user Bible in the project format.
     * @param {string} bookId - book name as stored in the data.
     * @param {number} chapterNumber - chapter to read.
     * @returns {Object|null} the chapter in the normalized format.
     */
    readChapter(data, bookId, chapterNumber) {
        const book = data.books?.find(entry => entry.name === bookId);
        const chapter = book?.capitulos?.find(
            entry => entry.numero === chapterNumber);
        if (!chapter)
            return null;

        return {
            version: data.version,
            Year: data.Year,
            books: [{
                name: book.name,
                capitulos: [{
                    numero: chapter.numero,
                    versos: chapter.versos,
                    notas: chapter.notas,
                }],
            }],
        };
    }
}
