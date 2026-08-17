/**
 * Biblias locales (aportadas por el usuario).
 *
 * Las versiones bíblicas que el usuario importa (formato JSON del proyecto)
 * viven en XDG_DATA_HOME/glogos/versions. Este módulo es compartido por la
 * app de lectura (botón "+") y por las preferencias de la extensión, para
 * que la versión del versículo diario también pueda ser una Biblia local.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {validateUserVersion} from './bibles.js';

const VERSIONS_DIR = `${GLib.get_user_data_dir()}/glogos/versions`;

/** Normalizes an arbitrary text into a filesystem-safe identifier. */
function slugify(text) {
    return text.trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Reads a JSON file or returns null when it does not exist. */
export function readJsonFile(path) {
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null))
        return null;
    try {
        const [, contents] = file.load_contents(null);
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (error) {
        console.error(`GLogos: no se pudo leer ${path}`, error);
        return null;
    }
}

/** Writes a JSON file atomically. */
export function writeJsonFile(path, data) {
    const file = Gio.File.new_for_path(path);
    const parent = file.get_parent();
    if (parent && !parent.query_exists(null))
        parent.make_directory_with_parents(null);
    const bytes = new TextEncoder().encode(JSON.stringify(data, null, 2));
    file.replace_contents(bytes, null, false,
        Gio.FileCreateFlags.REPLACE_DESTINATION, null);
}

/**
 * Lists the local Bibles present on disk.
 * @returns {Array<{id: string, name: string, path: string, data: Object}>}
 */
export function listLocalVersions() {
    const dir = Gio.File.new_for_path(VERSIONS_DIR);
    if (!dir.query_exists(null))
        return [];

    const versions = [];
    const enumerator = dir.enumerate_children(
        'standard::name', Gio.FileQueryInfoFlags.NONE, null);
    for (const info of enumerator) {
        if (!info.get_name().endsWith('.json'))
            continue;
        const path = `${VERSIONS_DIR}/${info.get_name()}`;
        const data = readJsonFile(path);
        if (data && typeof data.version === 'string' && data.version) {
            versions.push({
                id: slugify(data.version),
                name: data.version,
                path,
                data,
            });
        }
    }
    return versions;
}

/**
 * Imports a local Bible (project JSON format).
 * @param {Object} data - parsed JSON payload.
 * @returns {{ok: boolean, id?: string, errors?: string[]}}
 */
export function addLocalVersion(data) {
    const errors = validateUserVersion(data);
    if (errors.length > 0)
        return {ok: false, errors};

    const id = slugify(data.version);
    writeJsonFile(`${VERSIONS_DIR}/${id}.json`, data);
    return {ok: true, id};
}

/**
 * Picks a random verse from a local Bible (used as the daily verse).
 * @param {Object} data - local Bible in the project format.
 * @returns {Object|null} { text, citation } or null when empty.
 */
export function randomVerse(data) {
    const books = data.books ?? [];
    if (books.length === 0)
        return null;

    const book = books[Math.floor(Math.random() * books.length)];
    const chapters = book.capitulos ?? [];
    if (chapters.length === 0)
        return null;

    const chapter = chapters[Math.floor(Math.random() * chapters.length)];
    const verses = chapter.versos ?? [];
    if (verses.length === 0)
        return null;

    const verse = verses[Math.floor(Math.random() * verses.length)];
    return {
        text: verse.contenido,
        citation: `${book.name} ${chapter.numero}:${verse.numero}`,
    };
}
