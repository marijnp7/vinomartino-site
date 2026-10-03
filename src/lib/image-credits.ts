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

// Canonieke vorm: "(?:Foto: )<maker>, CC BY-*, via <bron>. Bron: <url>"
// (ook zonder provenance-staart en met of zonder slash-bron in de maker).
const HERKOMST_RE =
    /^\s*(?:Foto:\s*)?(.+?),\s*CC\s*BY[^,]*?,\s*via\s+(.+?)\.?\s*Bron:\s*(https?:\/\/\S+?)\s*$/is;

// Erkende maker-labels in het vrije tekstveld; niet-globale alternatieven © en (c).
const MAKER_LABEL_RE = /\b(?:Foto|Beeld|Credit|Author|Auteur):\s*|©|\(c\)\s*/gi;

/**
 * Knip een segment dat ná een maker-label staat tot de eigennaam.
 * Volgorde: comma-licentie → slash-bron → via-bron → paren-licentie → pipe → zin.
 */
function makerFromSegment(s: string): string {
    s = s.replace(/^[\s,;:]+/, '');
    const ccComma = s.search(/,\s*CC\s+BY/i);
    if (ccComma >= 0) return s.slice(0, ccComma).trim();
    const slash = s.indexOf(' / ');
    if (slash >= 0) return s.slice(0, slash).trim();
    const via = s.search(/\s+via\s+/i);
    if (via >= 0) return s.slice(0, via).trim();
    const ccParen = s.search(/\s+\(CC\s+BY/i);
    if (ccParen >= 0) return s.slice(0, ccParen).trim();
    const pipe = s.indexOf(' | ');
    if (pipe >= 0) return s.slice(0, pipe).trim();
    const sent = /[.]\s/.exec(s);
    if (sent) return s.slice(0, sent.index).trim();
    return s.trim();
}

/** Splitst een `herkomst`-tekst in maker, bronnaam en bron-URL; tolerant voor afwijkende vormen. */
export function parseHerkomst(herkomst: string): { maker: string; sourceLabel: string | null; sourceUrl: string | null } {
    const text = herkomst.replace(/\s+/g, ' ').trim();

    // Fast path: canonieke "(?:Foto: )<maker>, CC BY-*, via <bron>. Bron: <url>" (geen provenance-staart).
    const m = HERKOMST_RE.exec(text);
    if (m) {
        // Group 1 kan een Nederlandse caption bevatten als `(?:Foto:\s*)?` niet matchte (bv. "NL-tekst. Foto: Maker").
        // Zoek dan het laatste maker-label in group 1 en gebruik alleen het stuk erna.
        let maker = m[1].trim();
        MAKER_LABEL_RE.lastIndex = 0;
        let lastInGroup: { end: number } | null = null;
        let lmg: RegExpExecArray | null;
        while ((lmg = MAKER_LABEL_RE.exec(maker)) !== null) {
            lastInGroup = { end: lmg.index + lmg[0].length };
        }
        if (lastInGroup) maker = maker.slice(lastInGroup.end).trim();
        // Knip bronnaam-suffix ("/ Wikimedia Commons"): bronnaam staat al in sourceLabel (group 2).
        maker = makerFromSegment(maker);
        return { maker, sourceLabel: m[2].trim().replace(/\.$/, ''), sourceUrl: m[3] };
    }

    // Bron-URL: Bron:-prefix heeft voorrang, anders eerste https-link.
    const bronM = /\bBron:\s*(https?:\/\/[^\s,;|)]+)/i.exec(text);
    const sourceUrl = bronM
        ? bronM[1].replace(/[.,;]+$/, '')
        : (/(https?:\/\/[^\s,;|)]+)/.exec(text)?.[1]?.replace(/[.,;]+$/, '') ?? null);

    // Bronnaam: uit "via <Bron>" patroon.
    const viaM = /\bvia\s+([A-Z][^\n,.;|(]+?)(?=\s*[|.(]|\s*$)/i.exec(text);
    const sourceLabel = viaM ? viaM[1].trim() : null;

    // Maker: segment ná het LAATSTE erkende label in de tekst.
    let last: { end: number } | null = null;
    let lm: RegExpExecArray | null;
    MAKER_LABEL_RE.lastIndex = 0;
    while ((lm = MAKER_LABEL_RE.exec(text)) !== null) {
        last = { end: lm.index + lm[0].length };
    }
    if (last) return { maker: makerFromSegment(text.slice(last.end)), sourceLabel, sourceUrl };

    // Geen erkend label gevonden → geen maker te herleiden.
    return { maker: '', sourceLabel, sourceUrl };
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
