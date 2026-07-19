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
 * Schemacontract (LAT-2574 + LAT-2602): junction `<parent>_translations` met
 * `<parent>_id`, `languages_code` en de vertaalbare velden. Sinds LAT-2602 zitten
 * ook de gestructureerde JSON-blobs met leestekst in de translations
 * (main_grapes, cta_blocks, accom_cta_blocks, gyg_tours op streken;
 * main_grapes/cta_blocks op landen; itinerary op routes). Die EN-blobs bevatten
 * bewust ALLÉÉN de vertaalbare keys ("niet dupliceren" van url/coords/slug/
 * partner); daarom leggen we ze via een DEEP-MERGE over de NL-basis i.p.v.
 * wholesale te vervangen (zie mergeTranslatedValue) — anders zou bv. gyg_tours
 * z'n url verliezen en door de render-filter vallen. Beeld-UUID's en de
 * pins-JSON (wijnhuizen/accommodaties) blijven voorlopig buiten scope.
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
 * Leg één vertaalde veldwaarde over de NL-basis. Scalars (string/number/bool)
 * worden simpelweg vervangen door de EN-waarde (identiek aan het oude gedrag).
 * Voor JSON-blobs mergen we DIEP zodat de EN-vertaling — die bewust alléén de
 * leestekst-keys bevat — de niet-vertaalde keys (url, coords, slug, partner) uit
 * de NL-basis behoudt:
 *  - objecten: recursief per key; keys die in EN ontbreken houden hun NL-waarde;
 *  - arrays: element-gewijs op index over de NL-basis (de NL-lengte/volgorde is
 *    leidend want "aantal" is data, geen vertaling); een langere EN-array wordt
 *    afgekapt, een kortere laat de NL-staart intact.
 */
export function mergeTranslatedValue(base: unknown, overlay: unknown): unknown {
    if (Array.isArray(overlay)) {
        const baseArr = Array.isArray(base) ? base : [];
        if (baseArr.length === 0) return overlay;
        return baseArr.map((bv, i) => (i < overlay.length ? mergeTranslatedValue(bv, overlay[i]) : bv));
    }
    if (overlay && typeof overlay === 'object') {
        const baseObj =
            base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
        const out: Record<string, unknown> = { ...baseObj };
        for (const [k, v] of Object.entries(overlay as Record<string, unknown>)) {
            if (v === null || v === undefined) continue;
            if (typeof v === 'string' && v.trim() === '') continue;
            out[k] = mergeTranslatedValue(baseObj[k], v);
        }
        return out;
    }
    return overlay;
}

/**
 * No-translation-guard + overlay. Voor de standaardtaal keert dit de records
 * ongewijzigd terug. Voor een niet-standaard locale worden alléén records met
 * een vertaalrij behouden, met de vertaalde velden diep over de rauwe record
 * heen gelegd (zie mergeTranslatedValue).
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
        const merged: Record<string, unknown> = { ...r };
        for (const [f, v] of Object.entries(translated)) {
            merged[f] = mergeTranslatedValue(r[f], v);
        }
        out.push(merged as T);
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

/**
 * "Zachte" overlay ZONDER no-translation-guard: leg vertaalde velden over de
 * NL-basis, maar HOUD records zonder vertaling met hun NL-waarde. Bedoeld voor
 * de globale nav-dropdown (loadLandenNav/loadStrekenNav): de header moet compleet
 * blijven — een streek zonder EN-naam mag niet uit het menu vallen — en de links
 * blijven sowieso NL-absoluut, dus de NL-naam is een veilige fallback. Anders dan
 * applyTranslationGuard (die dropt) verliest dit dus nooit records.
 */
export function applyTranslationOverlaySoft<T extends Record<string, unknown>>(
    records: T[],
    overlay: Map<string, Record<string, unknown>>,
    locale: Locale,
    recordIdKey = 'id',
): T[] {
    if (locale === DEFAULT_LOCALE) return records;
    return records.map((r) => {
        const translated = overlay.get(String(r[recordIdKey] ?? ''));
        if (!translated) return r;
        const merged: Record<string, unknown> = { ...r };
        for (const [f, v] of Object.entries(translated)) {
            merged[f] = mergeTranslatedValue(r[f], v);
        }
        return merged as T;
    });
}

/**
 * Gemaksfunctie: fetch overlay + zachte merge (geen drop) in één stap.
 */
export async function localizeRecordsSoft<T extends Record<string, unknown>>(
    records: T[],
    opts: TranslationOverlayOptions,
    recordIdKey = 'id',
): Promise<T[]> {
    if (opts.locale === DEFAULT_LOCALE) return records;
    const overlay = await fetchTranslationOverlay(opts);
    return applyTranslationOverlaySoft(records, overlay, opts.locale, recordIdKey);
}
