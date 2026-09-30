// LAT-12054: beeldcredits zijn datagedreven. `getImageCredit()` leest `licentie`
// en `herkomst` van het DAM-bestand (`directus_files`); er staat geen id-lijst
// meer in de code. Voor `cc-by-*` en `cc-by-sa-*` is naamsvermelding verplicht:
// maker, licentie met link en bronpagina. Alle andere licentiewaarden (cc0,
// publiek-domein, eigen, pexels, unsplash, booking-/pers-onbevestigd, onbekend,
// synthetisch) vragen geen attributie en geven `null`.
// `herkomst` heeft de vorm "Foto: <maker>, <licentie>, via Wikimedia Commons.
// Bron: <url>".

import { loadDamFileMeta } from './dam-file-meta';

export interface ImageCredit {
    /** Auteur + bron, bv. "© Gianni Careddu / Wikimedia Commons". */
    author: string;
    /** Licentielabel zoals getoond, bv. "CC BY-SA 4.0". */
    licenseLabel: string;
    /** Canonieke licentie-URL voor de deeplink op het label. */
    licenseUrl: string;
    /** Bronpagina (bv. de Commons-bestandspagina); null als `herkomst` er geen bevat. */
    sourceUrl?: string | null;
    /** Naam van de bron, bv. "Wikimedia Commons". */
    sourceLabel?: string | null;
    /**
     * CC BY(-SA) 4.0 §3(a)(1)(B) eist dat een bewerking als zodanig wordt aangeduid.
     * Elke accommodatie-/streekfoto gaat door `gradeBuffer` (Warm-preset) en wordt
     * bijgesneden: zet dit op true en de kaart toont `adaptationNoteFor(locale)`.
     */
    adapted?: boolean;
}

// LAT-4911 — licentielabels komen uit de basis-collectie (`streken.hero_credit`),
// die géén *_translations-tegenhanger heeft: er is dus geen veld waar een EN-label
// in kan. Alle labels op de site zijn taalneutrale licentiecodes ("CC BY-SA 4.0")
// op één na — "Publiek domein" rendert Nederlands op /en/ (/en/streken/rioja/).
// Een lookup is genoeg; een schema-wijziging voor één string is dat niet.
const LICENSE_LABEL_EN: Record<string, string> = {
    'Publiek domein': 'Public domain',
};

/** Geeft het licentielabel in `locale`; onbekende/taalneutrale labels ongewijzigd terug. */
export function licenseLabelFor(label: string, locale: string): string {
    if (locale === 'nl') return label;
    return LICENSE_LABEL_EN[label.trim()] ?? label;
}

const ADAPTATION_NOTE: Record<string, string> = {
    nl: 'kleur en uitsnede bewerkt',
    en: 'colour-graded and cropped',
};

/** Bewerkingsaanduiding voor CC-beelden met `adapted: true`, in `locale` (val terug op EN). */
export function adaptationNoteFor(locale: string): string {
    return ADAPTATION_NOTE[locale] ?? ADAPTATION_NOTE.en;
}

/**
 * Accommodatiefoto's staan self-hosted als `/images/accommodaties/<file-uuid>.<ext>`;
 * de bestandsnaam is het Directus file-UUID waarop de DAM-lookup gesleuteld is.
 */
export function fileIdFromAccommodatiePath(src: string | null | undefined): string | null {
    const m = src?.match(/\/images\/accommodaties\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i);
    return m ? m[1].toLowerCase() : null;
}

const LICENSES: Record<string, { label: string; url: string }> = {};
for (const v of ['2.0', '3.0', '4.0']) {
    LICENSES[`cc-by-${v}`] = { label: `CC BY ${v}`, url: `https://creativecommons.org/licenses/by/${v}/` };
    LICENSES[`cc-by-sa-${v}`] = { label: `CC BY-SA ${v}`, url: `https://creativecommons.org/licenses/by-sa/${v}/` };
}

const HERKOMST_RE =
    /^\s*(?:Foto:\s*)?(.+?),\s*CC\s*BY[^,]*?,\s*via\s+(.+?)\.?\s*Bron:\s*(https?:\/\/\S+?)\s*$/is;

// LAT-12110 — `herkomst` is een vrij tekstveld en draagt in de praktijk méér dan de
// attributie: een redactionele caption vóór of achter de credit, een LAT-verwijzing,
// een keywords-dump. Die caption is Nederlands, en sinds de credits datagedreven zijn
// lekte hij als fotograafnaam door op /en/ — de i18n-nl gate zag drie Nederlandse
// zinnen op /en/accommodaties/rioja/, /en/streken/rioja/ en het Rioja-artikel.
//
// Het label waarmee de maker wordt ingeleid ("Foto:", "Credit:", "©"). Alles vóór het
// LAATSTE label is aanloop en hoort niet in de naam. Zonder colon is het geen label —
// dat houdt de fotograaf die écht "Foto Fitti" heet intact.
const MAKER_LABEL_G = /(?:©|\(c\)|\b(?:Foto|Photo|Beeld|Afbeelding|Auteur|Author|Credit)\s*:)\s*/gi;
/** Staart na de naam: bronnaam, licentie of URL, achter een scheider of "via". */
const MAKER_TAIL_RE = /\s+(?:[/|]|[—–])\s+[\s\S]*$|\s+via\s+[\s\S]*$|,?\s*CC\s*BY[\s\S]*$/i;

/**
 * Haalt de makersnaam uit een kandidaat-fragment. De regels zijn **structureel**,
 * niet lexicaal: een naam staat achter het laatste label, bevat geen zinsgrens en is
 * kort. Bewust geen NL-woordenlijst — die zou de i18n-gate dupliceren en alleen
 * Nederlands proza tegenhouden, terwijl elke caption hier fout is.
 *
 * Levert de kandidaat geen naam op, dan is `''` het eerlijke antwoord: de kaart toont
 * dan alleen het licentielabel. Dat is minder dan CC BY §3(a)(1) vraagt, maar een
 * caption als naamsvermelding presenteren is een *onjuiste* attributie en dus erger.
 * Zulke bestanden horen in de herkomst-opschoning (LAT-12069-lijn), niet hier.
 */
function makerFromCandidate(candidate: string): string {
    let maker = candidate;

    // 1. Alles tot en met het laatste maker-label weggooien.
    let labelEnd = 0;
    for (const m of maker.matchAll(MAKER_LABEL_G)) labelEnd = m.index + m[0].length;
    maker = maker.slice(labelEnd);

    // 2. Alleen de eerste zin: een caption die ná de credit staat valt zo af.
    maker = maker.split(/(?<=[.!?])\s+(?=\S)/)[0] ?? '';

    // 3. Staart (bron/licentie/URL) en interpunctie eraf.
    maker = maker.replace(MAKER_TAIL_RE, '').replace(/[\s.,;:|/([-]+$/, '').trim();

    // 4. Wat hierna nog lang is, is proza en geen naam.
    if (!maker || maker.split(/\s+/).length > 6) return '';
    if (/^CC[\s-]?BY/i.test(maker)) return '';
    return maker;
}

/** Splitst een `herkomst`-tekst in maker, bronnaam en bron-URL; tolerant voor afwijkende vormen. */
export function parseHerkomst(herkomst: string): { maker: string; sourceLabel: string | null; sourceUrl: string | null } {
    const text = herkomst.replace(/\s+/g, ' ').trim();
    const m = HERKOMST_RE.exec(text);
    if (m) {
        return { maker: makerFromCandidate(m[1]), sourceLabel: m[2].trim().replace(/\.$/, ''), sourceUrl: m[3] };
    }
    const url = /https?:\/\/\S+/.exec(text)?.[0]?.replace(/[.,;]+$/, '') ?? null;
    const maker = makerFromCandidate(text.replace(/\bBron:\s*https?:\/\/\S+/i, '').replace(/[\s.,;]+$/, ''));
    return { maker, sourceLabel: null, sourceUrl: url };
}

/**
 * Credit voor een DAM-bestand, of null als de licentie geen naamsvermelding eist
 * (of het bestand ontbreekt). Bij een cc-by-licentie zonder `herkomst` is er geen
 * maker om te noemen: de credit heeft dan een lege `author` en alleen de licentie.
 * `adapted: true` voor beeld dat build-time is gegradeerd en bijgesneden
 * (accommodatiekaarten, CC BY(-SA) 4.0 §3(a)(1)(B)).
 */
export async function getImageCredit(
    fileId: string | null | undefined,
    opts: { adapted?: boolean } = {},
): Promise<ImageCredit | null> {
    if (!fileId) return null;
    const file = (await loadDamFileMeta()).get(String(fileId).toLowerCase());
    const credit = creditFromFileMeta(file?.licentie, file?.herkomst);
    return credit && opts.adapted ? { ...credit, adapted: true } : credit;
}

export function creditFromFileMeta(
    licentie: string | null | undefined,
    herkomst: string | null | undefined,
): ImageCredit | null {
    const lic = LICENSES[String(licentie ?? '').trim().toLowerCase()];
    if (!lic) return null;
    const parsed = herkomst && herkomst.trim() ? parseHerkomst(herkomst) : null;
    return {
        author: parsed?.maker ? `© ${parsed.maker}` : '',
        licenseLabel: lic.label,
        licenseUrl: lic.url,
        sourceUrl: parsed?.sourceUrl ?? null,
        sourceLabel: parsed?.sourceLabel ?? null,
    };
}
