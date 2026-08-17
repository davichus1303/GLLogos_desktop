/**
 * Project-wide data model and provider facade.
 *
 * All Bible content is normalized into a single JSON shape so the extension
 * and the reading app are decoupled from any particular remote API:
 *
 * {
 *   "version": "web",
 *   "Year": 2000,
 *   "books": [{
 *       "name": "john",
 *       "capitulos": [{
 *           "numero": 3,
 *           "versos": [{ "numero": 1, "contenido": "..." }]
 *       }]
 *   }]
 * }
 */

import {yearFor} from './catalog.js';

/**
 * Normalizes a provider chapter response into the project format.
 * @param {Object} raw - Raw provider response.
 * @param {string} versionId - Version the chapter was fetched with.
 * @param {string} bookId - Book slug the chapter belongs to.
 * @returns {Object} chapter in the normalized format.
 */
export function normalizeChapter(raw, versionId, bookId) {
    const verses = (raw.verses ?? []).map(verse => ({
        numero: verse.verse,
        contenido: verse.text.trim(),
    }));

    const chapterNumber = raw.verses?.[0]?.chapter ?? null;

    return {
        version: versionId,
        Year: yearFor(versionId),
        books: [{
            name: bookId,
            capitulos: [{
                numero: chapterNumber,
                versos: verses,
            }],
        }],
    };
}

/**
 * Normalizes a provider "daily verse" response.
 * @param {Object} raw - Raw provider response (single verse).
 * @param {string} versionId - Version the verse was fetched with.
 * @returns {Object} { text, citation, version }.
 */
export function normalizeDailyVerse(raw, versionId) {
    const verse = raw.verses?.[0] ?? null;
    return {
        text: verse ? verse.text.trim() : '',
        citation: raw.reference ?? '',
        version: versionId,
    };
}

/**
 * Validates arbitrary JSON as a user-contributed Bible (project format).
 * Used by the reading app's "+" import feature.
 *
 * @param {Object} data - Parsed JSON payload.
 * @returns {string[]} list of validation errors; empty when valid.
 */
export function validateUserVersion(data) {
    const errors = [];
    const isNumber = value => typeof value === 'number' && Number.isInteger(value);
    const isText = value => typeof value === 'string' && value.trim().length > 0;

    if (!data || typeof data !== 'object')
        return ['El archivo no es un objeto JSON válido.'];
    if (!isText(data.version))
        errors.push('Falta el campo "version".');
    if (!isNumber(data.Year))
        errors.push('Falta el campo "Year" (año de publicación).');
    if (!Array.isArray(data.books) || data.books.length === 0)
        errors.push('Falta el campo "books" o está vacío.');

    for (const [bookIndex, book] of (data.books ?? []).entries()) {
        if (!book || typeof book !== 'object' || !isText(book.name)) {
            errors.push(`El libro ${bookIndex + 1} no tiene un "name" válido.`);
            continue;
        }
        if (!Array.isArray(book.capitulos) || book.capitulos.length === 0) {
            errors.push(`El libro "${book.name}" no tiene capítulos.`);
            continue;
        }
        for (const [chapterIndex, chapter] of book.capitulos.entries()) {
            if (!chapter || !isNumber(chapter.numero)) {
                errors.push(`El capítulo ${chapterIndex + 1} de "${book.name}" no tiene un "numero" válido.`);
                continue;
            }
            if (!Array.isArray(chapter.versos) || chapter.versos.length === 0) {
                errors.push(`El capítulo ${chapter.numero} de "${book.name}" no tiene versos.`);
                continue;
            }
            for (const [verseIndex, verse] of chapter.versos.entries()) {
                if (!verse || !isNumber(verse.numero) || !isText(verse.contenido)) {
                    errors.push(`El verso ${verseIndex + 1} del capítulo ${chapter.numero} de "${book.name}" no es válido.`);
                    break;
                }
            }
        }
    }

    return errors;
}

/**
 * High-level entry point shared by the extension and the app.
 * Wraps a provider and exposes only normalized data.
 */
export class Bibles {
    constructor(provider) {
        this._provider = provider;
    }

    /** @returns {Promise<Array>} the provider's version catalog. */
    listVersions() {
        return this._provider.listVersions();
    }

    /**
     * Fetches the verse of the day.
     * @param {string} versionId
     * @returns {Promise<Object>} normalized daily verse.
     */
    async getDailyVerse(versionId) {
        const raw = await this._provider.getDailyVerse(versionId);
        return normalizeDailyVerse(raw, versionId);
    }

    /**
     * Fetches and normalizes a chapter.
     * @param {string} versionId
     * @param {string} bookId
     * @param {number} chapter
     * @returns {Promise<Object>} normalized chapter.
     */
    async getChapter(versionId, bookId, chapter) {
        const raw = await this._provider.getChapter(versionId, bookId, chapter);
        return normalizeChapter(raw, versionId, bookId);
    }
}
