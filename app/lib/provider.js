/**
 * Base class for Bible data providers.
 *
 * A provider knows how to talk to a specific remote API and returns the raw
 * responses. The `Bibles` facade (see bibles.js) normalizes those responses
 * into the project-wide JSON format, so the extension and the reading app
 * never deal with provider-specific shapes.
 *
 * HTTP is done with libsoup3, which is available both inside the GNOME Shell
 * process (extensions) and in standalone GJS applications.
 */

import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const USER_AGENT = 'GLogos/1.0';

export class BibleProvider {
    constructor() {
        this._session = new Soup.Session({user_agent: USER_AGENT});
    }

    /**
     * Lists the available versions for this provider.
     * @returns {Promise<Array>} resolved with the version catalog.
     */
    async listVersions() {
        throw new Error('BibleProvider.listVersions() is not implemented');
    }

    /**
     * Fetches one random verse, used as the "verse of the day".
     * @param {string} versionId - Provider version identifier.
     * @returns {Promise<Object>} raw provider response.
     */
    async getDailyVerse(versionId) {
        throw new Error('BibleProvider.getDailyVerse() is not implemented');
    }

    /**
     * Fetches a whole chapter.
     * @param {string} versionId - Provider version identifier.
     * @param {string} bookId - Provider book slug.
     * @param {number} chapter - Chapter number.
     * @returns {Promise<Object>} raw provider response.
     */
    async getChapter(versionId, bookId, chapter) {
        throw new Error('BibleProvider.getChapter() is not implemented');
    }

    /**
     * Performs a GET request and decodes the JSON body.
     * @param {string} url - Absolute URL.
     * @returns {Promise<Object>} parsed JSON.
     */
    async _requestJson(url) {
        const message = Soup.Message.new('GET', url);
        const bytes = await this._send(message);
        const text = new TextDecoder().decode(bytes.get_data());
        return JSON.parse(text);
    }

    /** Sends a message asynchronously and resolves with the body bytes. */
    _send(message) {
        return new Promise((resolve, reject) => {
            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                null,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        resolve(bytes);
                    } catch (error) {
                        reject(error);
                    }
                });
        });
    }
}
