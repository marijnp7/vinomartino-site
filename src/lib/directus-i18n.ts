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
import { fetchDirectusCollection } from './directus-config';

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
    const res = await fetchDirectusCollection(`i18n:${junction}`, url, {
        headers: { Authorization: `Bearer ${env.token}` },
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
 * LAT-2697 — vertaal de weergavenaam van genestelde M2O-parent-objecten
 * (bv. `land_id`/`streek_id` die op een streek/wijnhuis-record hangen). De
 * child-loaders lokaliseren via localizeRecords alléén de EIGEN velden van het
 * record; de naam van de gejoinde parent blijft de rauwe NL-waarde en lekt zo
 * in EN meta-titles/descriptions ("Wine region in Italië"). Deze helper haalt
 * de parent-vertaalrijen op (één query per collectie) en muteert elk parent-
 * object in-place met de vertaalde velden. Voor de standaardtaal een no-op.
 * Ontbreekt een vertaalrij, dan blijft de NL-naam staan (zachte fallback —
 * alleen de weergavenaam verandert, PK/slug/link niet). Spiegelt het
 * softOverlay-patroon uit atlas-data.ts.
 */
export async function localizeJoinedRefs(
    parents: Array<Record<string, unknown> | null | undefined>,
    opts: TranslationOverlayOptions,
): Promise<void> {
    if (opts.locale === DEFAULT_LOCALE) return;
    const overlay = await fetchTranslationOverlay(opts);
    for (const p of parents) {
        if (!p) continue;
        const translated = overlay.get(String(p.id ?? ''));
        if (!translated) continue;
        for (const [f, v] of Object.entries(translated)) p[f] = v;
    }
}

/**
 * LAT-2829 — vertaal refs die via een GENESTE M2M/M2O-hop zijn ingeladen
 * (de cross-linkblokken: `related_articles.articles_id.title`,
 * `related_streken.streken_id.name`, `wijnhuizen.wijnhuizen_id.description`, …).
 *
 * Waarom niet localizeJoinedRefs? Die keyt op de parent-PK, en de geneste
 * field-selecties in de loaders vragen bewust alléén `slug` + de weergavenaam op
 * — geen `id`. Dat `id` alsnog aan die selecties toevoegen zou de degradatie-
 * ladders raken (`withRelations` in landen/streken/routes draagt óók
 * cta_blocks/druiven/practical; één 400 op de tier sleept die mee). Daarom keyen
 * we hier op `slug`: die zit per definitie al in élke ref-selectie, want de
 * cross-link heeft 'm nodig voor de href.
 *
 * De prijs is één extra `id,slug`-indexquery per collectie; die wordt per
 * (collectie, junction, locale, velden) gememoïseerd zodat de zes loaders samen
 * niet zes keer dezelfde index ophalen.
 */
export interface NestedRefOverlayOptions {
    env: DirectusEnv;
    /** Doelcollectie van de ref, bv. `articles` — nodig voor de slug→id-index. */
    collection: string;
    /** Junction-collectie met de vertalingen, bv. `articles_translations`. */
    junction: string;
    /** M2O-veld op die junction dat naar de parent-PK wijst, bv. `articles_id`. */
    parentIdField: string;
    /**
     * Vertaalbare veldnamen. Vraag hier ALLEEN velden op die daadwerkelijk op de
     * junction bestaan: `wijnhuizen_translations`/`accommodations_translations`
     * hebben bewust géén `name` (eigennamen vertalen niet), dus daar hoort
     * `['description']` en niet `['name']`.
     */
    fields: string[];
    locale: Locale;
}

const slugOverlayCache = new Map<string, Promise<Map<string, Record<string, unknown>>>>();

/** Haal de `id,slug`-index van een collectie op (alle statussen). */
async function fetchSlugIndex(env: DirectusEnv, collection: string): Promise<Map<string, string>> {
    const url = `${env.url}/items/${collection}?limit=-1&fields=id,slug`;
    const res = await fetchDirectusCollection(`i18n:index:${collection}`, url, {
        headers: { Authorization: `Bearer ${env.token}` },
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `[i18n] slug-index ${collection} faalde: ${res.status} ${res.statusText}: ${body.slice(0, 200)}`,
        );
    }
    const json = await res.json();
    const out = new Map<string, string>();
    for (const row of (json.data || []) as Record<string, unknown>[]) {
        const id = String(row.id ?? '');
        const slug = row.slug ? String(row.slug) : '';
        if (id && slug) out.set(id, slug);
    }
    return out;
}

/** Vertaalvelden per slug i.p.v. per PK. Gememoïseerd voor de hele build. */
async function fetchSlugKeyedOverlay(
    opts: NestedRefOverlayOptions,
): Promise<Map<string, Record<string, unknown>>> {
    const key = `${opts.collection}|${opts.junction}|${opts.locale}|${opts.fields.join(',')}`;
    const cached = slugOverlayCache.get(key);
    if (cached) return cached;
    const pending = (async () => {
        const [byId, index] = await Promise.all([
            fetchTranslationOverlay({
                env: opts.env,
                junction: opts.junction,
                parentIdField: opts.parentIdField,
                fields: opts.fields,
                locale: opts.locale,
            }),
            fetchSlugIndex(opts.env, opts.collection),
        ]);
        const bySlug = new Map<string, Record<string, unknown>>();
        for (const [id, translated] of byId) {
            const slug = index.get(id);
            if (slug) bySlug.set(slug, translated);
        }
        return bySlug;
    })();
    slugOverlayCache.set(key, pending);
    // Een mislukte fetch mag niet permanent in de cache blijven staan.
    pending.catch(() => slugOverlayCache.delete(key));
    return pending;
}

/**
 * Muteer ref-objecten in-place met hun vertaalde weergavevelden, gekoppeld op
 * `slug`. Zacht: een ref zonder vertaalrij houdt z'n NL-waarde (alleen het label
 * verandert, nooit de slug/href). Faalt de overlay-fetch, dan blijft ALLES NL en
 * gaat er een waarschuwing naar de buildlog — een cross-linklabel mag nooit een
 * build breken.
 */
export async function localizeRefsBySlug(
    refs: Array<Record<string, unknown> | null | undefined>,
    opts: NestedRefOverlayOptions,
): Promise<void> {
    if (opts.locale === DEFAULT_LOCALE) return;
    const targets = refs.filter((r): r is Record<string, unknown> => Boolean(r && r.slug));
    if (targets.length === 0) return;
    let bySlug: Map<string, Record<string, unknown>>;
    try {
        bySlug = await fetchSlugKeyedOverlay(opts);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
            `[i18n] cross-link-overlay ${opts.collection} (${opts.locale}) faalde: ${msg} — NL-labels blijven staan.`,
        );
        return;
    }
    for (const ref of targets) {
        const translated = bySlug.get(String(ref.slug));
        if (!translated) continue;
        for (const [f, v] of Object.entries(translated)) ref[f] = v;
    }
}

/**
 * Verzamel de geneste ref-objecten uit een M2M-lijstveld. Junctionrijen leveren
 * óf `{ <refField>: {...} }` óf — bij een platte selectie — het ref-object zelf;
 * beide vormen worden herkend (spiegelt de unwrap in de loaders). Rijen die
 * alleen een kale id dragen hebben geen te vertalen label en vallen weg.
 */
export function collectNestedRefs(
    records: Array<Record<string, unknown> | null | undefined>,
    listField: string,
    refField: string,
): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    for (const rec of records) {
        if (!rec) continue;
        const list = rec[listField];
        if (!Array.isArray(list)) continue;
        for (const row of list) {
            if (!row || typeof row !== 'object') continue;
            const junction = row as Record<string, unknown>;
            const inner = junction[refField];
            const target = inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : junction;
            if (target.slug) out.push(target);
        }
    }
    return out;
}

/** Gemaksfunctie: verzamel geneste refs + overlay ze in één stap. */
export async function localizeNestedRefs(
    records: Array<Record<string, unknown> | null | undefined>,
    listField: string,
    refField: string,
    opts: NestedRefOverlayOptions,
): Promise<void> {
    if (opts.locale === DEFAULT_LOCALE) return;
    await localizeRefsBySlug(collectNestedRefs(records, listField, refField), opts);
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
