// LAT-2575 (T2): collectie-agnostische kern voor native Directus translations.
//
// Schema (LAT-2574): elke publieke content-collectie heeft een O2M-alias
// `translations` naar `<collectie>_translations` met `languages_code` (nl/en) +
// vertaalbare velden. Deze module levert drie dingen:
//   1. translationsFragment() — bouwt het Directus `fields=`-fragment zodat een
//      loader de translations in één call meeneemt.
//   2. pickTranslation() — kiest het translations-record voor een locale.
//   3. overlayTranslation() — legt vertaalde velden over de basis-Directus-rij
//      heen en meldt of er een bruikbare vertaling bestaat (voor de 404-guard).
//
// Contract: NL (DEFAULT_LOCALE) is een no-op. Loaders die geen locale doorgeven
// (of 'nl' doorgeven) draaien byte-identiek aan vóór i18n — geen extra fetch,
// geen overlay. Alleen de EN-tak raakt deze code. Zo blijft de primaire NL-site
// gegarandeerd ongewijzigd tot de launch-gate (LAT-2570) omgaat.

import type { Locale } from './i18n';
import { DEFAULT_LOCALE } from './i18n';

/**
 * Eén translations-rij zoals Directus die teruggeeft. `languages_code` kan een
 * string zijn (`fields=translations.languages_code`) of een genest object
 * (`fields=translations.languages_code.code`), afhankelijk van de query. Beide
 * worden ondersteund door {@link translationLangCode}.
 */
export interface TranslationRow {
    languages_code?: string | { code?: string | null } | null;
    [field: string]: unknown;
}

/**
 * Bouw het `fields=`-fragment voor de translations-alias. Voeg dit toe aan de
 * bestaande veldlijst van een loader, bijv.:
 *   `fields=slug,name,${translationsFragment(['name','body'])}`
 * `languages_code` wordt altijd meegevraagd zodat {@link pickTranslation} de
 * juiste rij kan matchen.
 */
export function translationsFragment(fields: readonly string[]): string {
    const unique = Array.from(new Set(fields.filter((f) => f && f.trim() !== '')));
    return ['translations.languages_code', ...unique.map((f) => `translations.${f}`)].join(',');
}

/** Normaliseer de `languages_code` van een translations-rij naar een string of null. */
export function translationLangCode(row: TranslationRow): string | null {
    const code = row.languages_code;
    if (typeof code === 'string') return code || null;
    if (code && typeof code === 'object' && typeof code.code === 'string') return code.code || null;
    return null;
}

/**
 * Kies het translations-record voor een locale uit een (mogelijk ontbrekende)
 * translations-array. Geeft null als de array ontbreekt of geen match heeft.
 */
export function pickTranslation(translations: unknown, locale: Locale): TranslationRow | null {
    if (!Array.isArray(translations)) return null;
    for (const row of translations as TranslationRow[]) {
        if (row && translationLangCode(row) === locale) return row;
    }
    return null;
}

/** Resultaat van {@link overlayTranslation}. */
export interface OverlayResult<T> {
    /** De (mogelijk) vertaalde rij. Voor NL identiek aan de invoer. */
    value: T;
    /**
     * Of er een bruikbare vertaling is voor de gevraagde locale. NL is altijd
     * true. Voor EN: true zodra minstens één opgegeven `requiredFields`-veld (of,
     * bij afwezigheid daarvan, één willekeurig veld) een niet-lege string bevat.
     * De 404-guard in de page-loaders (LAT-2570 harde randvoorwaarde 5) gebruikt
     * dit om een EN-route wél/niet te genereren: geen vertaling → geen lege of
     * NL-gemengde EN-pagina.
     */
    hasTranslation: boolean;
}

/**
 * Leg vertaalde velden over een basis-Directus-rij heen.
 *
 * @param base   De basisrij (Directus-veldnamen, vóór domein-mapping).
 * @param translations  De `translations`-array van die rij.
 * @param locale De doel-locale.
 * @param fields De vertaalbare Directus-veldnamen (zoals in het T1-schema).
 * @param requiredFields  Optioneel: de velden die minimaal vertaald moeten zijn
 *   om `hasTranslation` true te maken (bv. de H1/titel + body van een pagina).
 *   Leeg = elk niet-leeg vertaald veld telt.
 *
 * Alleen niet-lege strings overschrijven; een lege vertaling laat het NL-veld
 * staan i.p.v. de pagina leeg te maken. Voor NL wordt niets aangeraakt.
 */
export function overlayTranslation<T extends Record<string, unknown>>(
    base: T,
    translations: unknown,
    locale: Locale,
    fields: readonly string[],
    requiredFields: readonly string[] = [],
): OverlayResult<T> {
    if (locale === DEFAULT_LOCALE) return { value: base, hasTranslation: true };

    const row = pickTranslation(translations, locale);
    if (!row) return { value: base, hasTranslation: false };

    const out: Record<string, unknown> = { ...base };
    let overlaidAny = false;
    const required = new Set(requiredFields);
    let requiredMet = required.size === 0 ? false : true;

    for (const field of fields) {
        const translated = row[field];
        if (typeof translated === 'string' && translated.trim() !== '') {
            out[field] = translated;
            overlaidAny = true;
        } else if (required.has(field)) {
            requiredMet = false;
        }
    }

    const hasTranslation = required.size === 0 ? overlaidAny : requiredMet && overlaidAny;
    return { value: out as T, hasTranslation };
}
