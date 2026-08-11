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

const CC_BY_SA_40 = 'https://creativecommons.org/licenses/by-sa/4.0/';
const CC_BY_SA_30 = 'https://creativecommons.org/licenses/by-sa/3.0/';
const CC_BY_ND_20 = 'https://creativecommons.org/licenses/by-nd/2.0/';

const CREDITS: Record<string, ImageCredit> = {
    // auto-huren-sardinie hero (DAM-1704, Wikimedia Commons)
    '041875c3-418b-4c6d-9389-cfd675f9ce1a': {
        author: '© Gianni Careddu / Wikimedia Commons',
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
    // LAT-2477/LAT-2478 champagne wijnhuis-hero's (Wikimedia Commons, CC BY-SA 4.0).
    // Devaux (a0f1a71a…) is AI-eigen werk → geen attributie vereist, staat hier bewust niet.
    'e3d205b8-6a21-4348-b393-d20d11b108d8': {
        author: '© Pmau / Wikimedia Commons', // Champagne Drappier — Vignoble à Spoy
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_40,
    },
    '5bcd43e5-bb08-4fa9-ae1e-15f2a405e78a': {
        author: '© Siren-Com / Wikimedia Commons', // Champagne Fleury — Cadole te Courteron
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_40,
    },
    '4f03bbe8-d1e0-4164-8e58-6310c70fc0ae': {
        author: '© Pmau / Wikimedia Commons', // Roses de Jeanne / Cédric Bouchard — Vignoble à Spoy
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_40,
    },
    '8ac449cb-e5cb-4c04-ad8d-2a0af0d8b1fb': {
        author: '© Pmau / Wikimedia Commons', // Champagne Marie-Courtin — Vignoble à Spoy
        licenseLabel: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_40,
    },
    // LAT-4804 ribera-del-duero-tempranillo-hoogte hero — officiële beeldbank van
    // het DO-consortium (Gumiel de Mercado, Burgos). CC BY-ND 2.0: attributie is
    // verplicht én bewerken is niet toegestaan, dus dit beeld mag alleen
    // mechanisch geschaald worden (ASSET_TRANSFORM `fit=inside`) en in de
    // hero-container door CSS `object-fit: cover` bijgesneden — nooit
    // kleurgecorrigeerd of gefilterd.
    'ca01bf9e-e3d9-402d-8c23-46d9160a33c6': {
        // LAT-4908: `©` in plaats van "Foto:" — taalneutraal, zodat de credit ook
        // op /en/ klopt; consistent met de zes Wikimedia-entries hierboven.
        author: '© CRDO Ribera del Duero',
        licenseLabel: 'CC BY-ND 2.0',
        licenseUrl: CC_BY_ND_20,
    },
    // LAT-4942 bordeaux-rechterover-entre-deux-mers-na-de-krach hero — het dorp
    // Saint-Michel-de-Fronsac gezien vanuit de wijngaard (2013). Fronsac ligt op de
    // rechteroever, dezelfde commune waar het artikel opent; het enige Bordeaux-beeld
    // dat al in de DAM zat is een Pauillac-kelder (Médoc) die al hero is van het
    // En Primeur-artikel. CC BY-SA 3.0 staat bewerken wél toe, dus dit beeld mag
    // geschaald worden — de attributie is verplicht en staat daarom hier.
    '15fccd27-f785-4abb-b654-aa2084aa8ffe': {
        author: '© Michael bx / Wikimedia Commons',
        licenseLabel: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_30,
    },
};

export function getImageCredit(fileId: string | null | undefined): ImageCredit | null {
    if (!fileId) return null;
    return CREDITS[fileId] ?? null;
}
