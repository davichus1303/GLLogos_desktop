/**
 * Referencias de lectura (barra lateral "Separador").
 *
 * Una referencia es la posición de lectura que el usuario guarda con el
 * control Separador: {version, book, chapter}. Las referencias se guardan
 * por versión bíblica (el identificador de libro depende de la versión:
 * slugs del catálogo en las remotas, nombres tal cual en las locales), por
 * lo que nunca existe más de una referencia por libro en una misma versión.
 *
 * Este módulo contiene únicamente lógica de dominio. La persistencia la
 * gestiona Storage (app/storage.js) y la UI se limita a presentar y emitir
 * selecciones.
 */

/**
 * Creates or updates the reference for the given book within its version.
 * Returns a new array (the original is not mutated).
 * @param {Array<{version: string, book: string, chapter: number,
 *   createdAt: string, updatedAt: string}>} references
 * @param {{version: string, book: string, chapter: number}} position
 * @returns {Array} the updated references array.
 */
export function upsertReference(references, position) {
    const index = references.findIndex(reference =>
        reference.version === position.version &&
        reference.book === position.book);
    const now = new Date().toISOString();

    if (index !== -1) {
        const updated = [...references];
        updated[index] = {
            ...updated[index],
            chapter: position.chapter,
            updatedAt: now,
        };
        return updated;
    }

    return [...references, {
        version: position.version,
        book: position.book,
        chapter: position.chapter,
        createdAt: now,
        updatedAt: now,
    }];
}

/**
 * Removes the reference of the given book within its version.
 * Returns a new array (the original is not mutated).
 * @param {Array<{version: string, book: string, chapter: number,
 *   createdAt: string, updatedAt: string}>} references
 * @param {{version: string, book: string}} reference
 * @returns {Array} the references array without the removed reference.
 */
export function removeReference(references, reference) {
    return references.filter(item =>
        !(item.version === reference.version && item.book === reference.book));
}

/**
 * Filters the references belonging to a given Bible version.
 * @param {Array} references - all stored references.
 * @param {string} version - version identifier.
 * @returns {Array} references for that version.
 */
export function referencesForVersion(references, version) {
    return references.filter(reference => reference.version === version);
}
