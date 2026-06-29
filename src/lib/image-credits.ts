// LAT-1687: on-page beeldcredits voor hero-afbeeldingen waarvan de licentie een
// verplichte attributie eist (bv. Wikimedia Commons CC BY-SA). Unsplash-hero's
// vereisen géén attributie en staan hier bewust niet — die blijven enkel in
// public/images/IMAGE_CREDITS.md gedocumenteerd. Registry is gesleuteld op het
// Directus file-UUID (articles.hero_image), zodat de credit het beeld volgt en
// niet het artikel/slug.

export interface ImageCredit {
    /** Auteur + bron, bv. "© Gianni Careddu / Wikimedia Commons". */
    author: string;
    /** Licentielabel zoals getoond, bv. "CC BY-SA 4.0". */
    licenseLabel: string;
    /** Canonieke licentie-URL voor de deeplink op het label. */
    licenseUrl: string;
}

const CREDITS: Record<string, ImageCredit> = {
    // auto-huren-sardinie hero (DAM-1704, Wikimedia Commons)
    '041875c3-418b-4c6d-9389-cfd675f9ce1a': {
        author: '© Gianni Careddu / Wikimedia Commons',
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
};

export function getImageCredit(fileId: string | null | undefined): ImageCredit | null {
    if (!fileId) return null;
    return CREDITS[fileId] ?? null;
}
