/**
 * Bible version catalog for the bible-api.com provider.
 *
 * This mirrors the list published by bible-api.com (verified against the
 * official documentation) and adds the tier (free/premium) used by the
 * reading app's licensing model. No Spanish translation is offered by this
 * provider; the free tier is English for now until a Spanish source is
 * plugged into the provider layer.
 */

export const VERSIONS = [
    {id: 'web', name: 'World English Bible', language: 'English', year: 2000, premium: false},
    {id: 'kjv', name: 'King James Version', language: 'English', year: 1611, premium: false},
    {id: 'asv', name: 'American Standard Version', language: 'English', year: 1901, premium: true},
    {id: 'bbe', name: 'Bible in Basic English', language: 'English', year: 1949, premium: true},
    {id: 'darby', name: 'Darby Bible', language: 'English', year: 1890, premium: true},
    {id: 'dra', name: 'Douay-Rheims 1899 American Edition', language: 'English', year: 1899, premium: true},
    {id: 'oeb-us', name: 'Open English Bible, US Edition', language: 'English (US)', year: 2010, premium: true},
    {id: 'oeb-cw', name: 'Open English Bible, Commonwealth Edition', language: 'English (UK)', year: 2010, premium: true},
    {id: 'webbe', name: 'World English Bible, British Edition', language: 'English (UK)', year: 2000, premium: true},
    {id: 'ylt', name: "Young's Literal Translation", language: 'English', year: 1862, premium: true},
    {id: 'cherokee', name: 'Cherokee New Testament', language: 'Cherokee', year: 1860, premium: true},
    {id: 'cuv', name: 'Chinese Union Version', language: 'Chinese', year: 1919, premium: true},
    {id: 'bkr', name: 'Bible kralická', language: 'Czech', year: 1613, premium: true},
    {id: 'clementine', name: 'Clementine Latin Vulgate', language: 'Latin', year: 1592, premium: true},
    {id: 'almeida', name: 'João Ferreira de Almeida', language: 'Portuguese', year: 1753, premium: true},
    {id: 'rccv', name: 'Protestant Romanian Corrected Cornilescu Version', language: 'Romanian', year: 1924, premium: true},
];

/** Finds a version entry by its provider identifier. */
export function findVersion(id) {
    return VERSIONS.find(version => version.id === id);
}

/**
 * Returns the version's publication year, used for the normalized data
 * format. Falls back to the current year when unknown.
 */
export function yearFor(id) {
    const version = findVersion(id);
    return version ? version.year : new Date().getFullYear();
}

/**
 * Whether a version requires an active Pro plan to be read.
 * Free versions are always readable.
 */
export function isPremium(id) {
    const version = findVersion(id);
    return version ? version.premium : false;
}
