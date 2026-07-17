/**
 * LAT-2575 — locale-overlay voor native Directus translations.
 *
 * Ontwerp: de bestaande, diep-getierde NL-fetch per collectie blijft ONGEWIJZIGD
 * (nul NL-regressierisico). Voor een niet-standaard locale (EN) halen we de
 * `<parent>_translations`-junction op in één simpele query, leggen we de
 * vertaalde tekstvelden over de rauwe records heen, en passen we de
 * no-translation-guard toe: records zónder vertaling worden weggelaten zodat
 * `getStaticPaths` er geen /en/-pagina voor genereert (404 i.p.v. NL-lek).
 *
 * Schemacontract (LAT-2574): junction `<parent>_translations` met
 * `<parent>_id`, `languages_code` en de vertaalbare velden. Beeld-UUID's en
 * gestructureerde JSON-velden (cta_blocks, gyg_tours, main_grapes, stops,
 * proefnotities, pins) zitten NIET in de translations — dat is de bekende
 * launch-gate-gap (aparte beslissing/afhandeling).
 */

import { DEFAULT_LOCALE, type Locale } from './i18n';
import type { DirectusEnv } from './directus-config';

export interface TranslationOverlayOptions {
    env: DirectusEnv;
    /** Junction-collectie, bijv. `streken_translations`. */
    junction: string;
    /** M2O-veld op de junction dat naar de parent-PK wijst, bijv. `streken_id`. */
    parentIdField: string;
    /** Vertaalbare veldnamen (identiek aan de parent-veldnamen). */
    fields: string[];
    locale: Locale;
}

/**
 * Haal de vertaalrijen voor `locale` op en bouw een Map van parent-id → vertaalde
 * (niet-lege) velden. Voor de standaardtaal (NL) is dit een no-op (lege Map).
 */
export async function fetchTranslationOverlay(
    opts: TranslationOverlayOptions,
): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (opts.locale === DEFAULT_LOCALE) return map;

    const { env, junction, parentIdField, fields, locale } = opts;
    const fieldList = [parentIdField, ...fields].join(',');
    const url = `${env.url}/items/${junction}?limit=-1&filter[languages_code][_eq]=${encodeURIComponent(locale)}&fields=${fieldList}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.token}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `[i18n] translations-fetch ${junction} (${locale}) faalde: ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
        );
    }
    const json = await res.json();
    const rows = (json.data || []) as Record<string, unknown>[];
    for (const row of rows) {
        const pid = row[parentIdField];
        const key =
            pid && typeof pid === 'object'
                ? String((pid as Record<string, unknown>).id ?? '')
                : String(pid ?? '');
        if (!key) continue;
        const translated: Record<string, unknown> = {};
        for (const f of fields) {
            const v = row[f];
            if (v === null || v === undefined) continue;
            if (typeof v === 'string' && v.trim() === '') continue;
            translated[f] = v;
        }
        map.set(key, translated);
    }
    return map;
}

/**
 * No-translation-guard + overlay. Voor de standaardtaal keert dit de records
 * ongewijzigd terug. Voor een niet-standaard locale worden alléén records met
 * een vertaalrij behouden, met de vertaalde velden over de rauwe record heen.
 */
export function applyTranslationGuard<T extends Record<string, unknown>>(
    records: T[],
    overlay: Map<string, Record<string, unknown>>,
    locale: Locale,
    recordIdKey = 'id',
): T[] {
    if (locale === DEFAULT_LOCALE) return records;
    const out: T[] = [];
    for (const r of records) {
        const key = String(r[recordIdKey] ?? '');
        const translated = overlay.get(key);
        if (!translated) continue; // geen vertaling → geen /en/-pagina
        out.push({ ...r, ...translated });
    }
    return out;
}

/**
 * Gemaksfunctie: fetch overlay + pas guard toe in één stap.
 */
export async function localizeRecords<T extends Record<string, unknown>>(
    records: T[],
    opts: TranslationOverlayOptions,
    recordIdKey = 'id',
): Promise<T[]> {
    if (opts.locale === DEFAULT_LOCALE) return records;
    const overlay = await fetchTranslationOverlay(opts);
    return applyTranslationGuard(records, overlay, opts.locale, recordIdKey);
}
