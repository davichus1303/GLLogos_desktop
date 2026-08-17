/**
 * bible-api.com provider.
 *
 * Free JSON API, no key required. Endpoints used (verified working):
 *   - Random verse:   GET /?random=1[&translation=ID]
 *   - Chapter:        GET /BOOK CHAPTER?translation=ID
 *   - Single verse:   GET /BOOK CHAPTER:VERSE?translation=ID
 *
 * See https://bible-api.com for the full documentation.
 */

import {BibleProvider} from '../provider.js';
import {VERSIONS} from '../catalog.js';

const BASE_URL = 'https://bible-api.com';

export class BibleApiProvider extends BibleProvider {
    async listVersions() {
        return VERSIONS;
    }

    async getDailyVerse(versionId) {
        const url = `${BASE_URL}/?random=1&translation=${versionId}`;
        return this._requestJson(url);
    }

    async getChapter(versionId, bookId, chapter) {
        const url = `${BASE_URL}/${bookId}+${chapter}?translation=${versionId}`;
        return this._requestJson(url);
    }

    async getVerse(versionId, bookId, chapter, verse) {
        const url = `${BASE_URL}/${bookId}+${chapter}:${verse}?translation=${versionId}`;
        return this._requestJson(url);
    }
}
