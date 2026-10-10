/**
 * LAT-13099: "Op de proeftafel": Directus-loader voor wijnreviews.
 *
 * Schema: directus/scripts/create-proeftafel-schema.mjs (collecties `wijn_reviews`,
 * `wijn_reviews_translations`, `wijn_inzendingen`).
 *
 * Deploy-safe: de collectie is nieuw. Zolang het schema nog niet is toegepast
 * (400/403/404) of Directus niet geconfigureerd is, levert de loader een lege
 * lijst. Lege Directus = niets renderen; de build breekt er niet op.
 *
 * EN: overlay uit `wijn_reviews_translations` met de no-translation-guard
 * (directus-i18n.ts). Reviews zonder EN-vertaling vallen weg onder /en/.
 */

import { markdownToHtml, normalizeEmDashes } from './markdown';
import { DEFAULT_LOCALE, type Locale } from './i18n';
import { localizeRecords } from './directus-i18n';
import { isAffiliateHref } from './affiliates';
import {
    readDirectusEnv,
    statusFilterQuery,
    assetUrl,
    withAssetSlot,
    fetchDirectusCollection,
} from './directus-config';

export const VERDICTS = ['kopen', 'proberen', 'laten-staan', 'niet-beoordeeld'] as const;
export const KLEUREN = ['rood', 'wit', 'rose', 'mousserend', 'zoet', 'oranje'] as const;
export const PRIJSBANDEN = ['tot-12', '12-25', 'boven-25'] as const;
export type Prijsband = (typeof PRIJSBANDEN)[number];
/** Schrijfrichtlijn v2: herkomstregel bovenaan, verplicht. */
export const HERKOMST = ['zelf_gekocht', 'gekregen'] as const;
/** Schrijfrichtlijn v2: prijsbanen waarop een winkel nomineert (wijn_inzendingen.baan). */
export const BANEN = ['onder_20', 'feestfles'] as const;

export interface WijnReview {
    id: string;
    slug: string;
    titel: string;
    wijn: string;
    producent: string;
    jaargang: string;
    kleur: string;
    streekSlug: string;
    streekName: string;
    wijnhuisSlug: string;
    wijnhuisName: string;
    categorie: string;
    verdict: string;
    prijsEur: number | null;
    winkelNaam: string;
    winkelUrl: string;
    winkelStad: string;
    wijnKort: string;
    seoTitle: string;
    nominatievraag: string;
    affiliateLinks: boolean;
    verdictZin: string;
    deVraagHtml: string;
    lijktOp: string;
    voorWie: string;
    nietVoorWie: string;
    smaakHtml: string;
    leerpuntHtml: string;
    wanneerWaarbijHtml: string;
    drinkvenster: string;
    proefDeStreekHtml: string;
    herkomst: string;
    herkomstNaam: string;
    voorDeLiefhebberHtml: string;
    flesImage: string | null;
    publicatiedatum: string;
}

export interface StreekOptie {
    id: number;
    slug: string;
    name: string;
}

/** Vertaalbare tekstvelden; slug, relaties, prijs, beeld en enums blijven NL-canoniek. */
export const WIJN_REVIEWS_TRANSLATABLE = [
    'titel',
    'seo_title',
    'verdict_zin',
    'de_vraag',
    'lijkt_op',
    'voor_wie',
    'niet_voor_wie',
    'smaak',
    'leerpunt',
    'wanneer_waarbij',
    'drinkvenster',
    'proef_de_streek',
    'voor_de_liefhebber',
    'nominatievraag',
];

const BASE_FIELDS = [
    'id', 'status', 'slug', 'wijn', 'producent', 'jaargang', 'kleur', 'categorie', 'verdict',
    'prijs_eur', 'winkel_naam', 'winkel_url', 'winkel_stad', 'wijn_kort', 'affiliate_links',
    'herkomst', 'herkomst_naam', 'fles_image',
    'publicatiedatum', 'streek.slug', 'streek.name', ...WIJN_REVIEWS_TRANSLATABLE,
].join(',');
const WIJNHUIS_FIELDS = 'wijnhuis.slug,wijnhuis.name';

/** Prijsband voor het filter: < 12, 12 t/m 25, > 25 euro. */
export function prijsband(prijs: number | null): Prijsband | '' {
    if (prijs === null) return '';
    if (prijs < 12) return 'tot-12';
    if (prijs <= 25) return '12-25';
    return 'boven-25';
}

/** `{naam}`-placeholders invullen (ui.t() kent geen interpolatie). */
export function fill(template: string, vars: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export const UTM_PARAMS = {
    utm_source: 'vinomartino',
    utm_medium: 'referral',
    utm_campaign: 'op-de-proeftafel',
} as const;

/**
 * Schrijfrichtlijn v2: "te koop bij"-link met UTM per aflevering, zodat elke winkel
 * maandelijks een klikoverzicht krijgt. Bestaande query-params blijven staan; staat er
 * al een utm_-param in de URL, dan voegen we niets toe (de redactie heeft hem bewust gezet).
 * Geen geldige http(s)-URL = ongewijzigd teruggeven.
 */
export function shopUrlWithUtm(rawUrl: string, slug: string): string {
    const raw = (rawUrl || '').trim();
    if (!/^https?:\/\//i.test(raw)) return raw;
    let u: URL;
    try { u = new URL(raw); } catch { return raw; }
    for (const k of u.searchParams.keys()) if (k.toLowerCase().startsWith('utm_')) return raw;
    for (const [k, v] of Object.entries(UTM_PARAMS)) u.searchParams.append(k, v);
    if (slug) u.searchParams.append('utm_content', slug);
    return u.toString();
}

export const REVIEW_TITLE_TEMPLATE_NL = '{categorie} bij {winkel} in {stad}: {wijn} voor {prijs}, kopen of laten staan?';

export function formatEuro(n: number | null, locale: Locale = DEFAULT_LOCALE): string {
    if (n === null || !Number.isFinite(n)) return '';
    return new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'nl-NL', { style: 'currency', currency: 'EUR' })
        .format(n)
        .replace(/\u00a0/g, '');
}

type TitleInput = Pick<WijnReview, 'seoTitle' | 'titel' | 'wijn' | 'wijnKort' | 'winkelNaam' | 'winkelStad' | 'prijsEur' | 'categorie'>;

/**
 * Sitetitel volgens de formule uit de schrijfrichtlijn: winkel, stad, prijs en de vraag.
 * `seo_title` wint altijd. Ontbreekt winkel of prijs, dan valt de formule terug op
 * de redactionele titel (een halve formule is erger dan geen); dat geldt ook voor de categorie. Ontbreekt alleen de
 * stad, dan vervalt " in {stad}".
 */
export function reviewTitle(
    r: TitleInput,
    opts: { template?: string; categorieLabel?: string; locale?: Locale } = {},
): string {
    if (r.seoTitle) return r.seoTitle;
    const fallback = r.titel || r.wijn;
    const prijs = formatEuro(r.prijsEur, opts.locale);
    const wijn = r.wijnKort || r.wijn;
    const categorie = opts.categorieLabel || r.categorie.replace(/-/g, ' ');
    if (!r.winkelNaam || !prijs || !wijn || !categorie) return fallback;
    let tpl = opts.template || REVIEW_TITLE_TEMPLATE_NL;
    if (!r.winkelStad) tpl = tpl.replace(/\s+in\s+\{stad\}/, '');
    const out = fill(tpl, { categorie, winkel: r.winkelNaam, stad: r.winkelStad, wijn, prijs });
    return out.charAt(0).toUpperCase() + out.slice(1);
}

/**
 * Bevat de review affiliate links? Dan staat de vaste affiliate-melding bovenaan.
 * Redactieveld `affiliate_links` OF een affiliate-href (CJ/Booking/Stay22) in de
 * winkellink of in een van de gerenderde tekstblokken.
 */
export function hasAffiliateLinks(
    r: Pick<WijnReview, 'affiliateLinks' | 'winkelUrl'> & Partial<Record<'proefDeStreekHtml' | 'deVraagHtml' | 'smaakHtml' | 'leerpuntHtml' | 'wanneerWaarbijHtml' | 'voorDeLiefhebberHtml', string>>,
): boolean {
    if (r.affiliateLinks || isAffiliateHref(r.winkelUrl)) return true;
    const html = [r.proefDeStreekHtml, r.deVraagHtml, r.smaakHtml, r.leerpuntHtml, r.wanneerWaarbijHtml, r.voorDeLiefhebberHtml].join(' ');
    for (const m of html.matchAll(/href="([^"]+)"/g)) if (isAffiliateHref(m[1].replace(/&amp;/g, '&'))) return true;
    return false;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : normalizeEmDashes(String(v)).trim());
const rel = (v: unknown, key: string): string =>
    v && typeof v === 'object' ? str((v as Record<string, unknown>)[key]) : '';

async function md(v: unknown): Promise<string> {
    const s = str(v);
    return s ? markdownToHtml(s) : '';
}

async function downloadFles(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'proeftafel');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/proeftafel/${fileName}`;
    try {
        return await withAssetSlot(async () => {
            const res = await fetch(assetUrl(directusUrl, assetId), {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(3000),
            });
            if (!res.ok) {
                console.warn(`[loadWijnReviews] kon fles-asset ${assetId} niet ophalen: ${res.status}`);
                return null;
            }
            mkdirSync(outDir, { recursive: true });
            // Geen kleurgrading: een flesfoto moet het etiket tonen zoals het is.
            writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
            return `/images/proeftafel/${fileName}`;
        });
    } catch (err) {
        console.warn(`[loadWijnReviews] fles-asset ${assetId} faalde: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

async function fetchRows(): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    if (!env.configured) {
        console.warn('[loadWijnReviews] Directus niet geconfigureerd: geen proeftafel-reviews.');
        return [];
    }
    const headers = { Authorization: `Bearer ${env.token}` };
    const q = (fields: string) =>
        fetchDirectusCollection(
            'loadWijnReviews',
            `${env.url}/items/wijn_reviews?limit=-1&fields=${fields}${statusFilterQuery(env)}&sort=-publicatiedatum`,
            { headers },
        );
    try {
        let res = await q(`${BASE_FIELDS},${WIJNHUIS_FIELDS}`);
        if (!res.ok && (res.status === 400 || res.status === 403)) res = await q(BASE_FIELDS);
        if (!res.ok) {
            console.warn(`[loadWijnReviews] wijn_reviews niet leesbaar (HTTP ${res.status}); schema/permissie nog niet toegepast? Geen reviews gebuild.`);
            return [];
        }
        return ((await res.json()).data || []) as Record<string, unknown>[];
    } catch (err) {
        console.warn(`[loadWijnReviews] fetch faalde: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
}

async function mapRow(r: Record<string, unknown>, url: string, token: string): Promise<WijnReview> {
    const prijs = r.prijs_eur === null || r.prijs_eur === undefined || r.prijs_eur === '' ? null : Number(r.prijs_eur);
    return {
        id: String(r.id ?? ''),
        slug: str(r.slug),
        titel: str(r.titel),
        wijn: str(r.wijn),
        producent: str(r.producent),
        jaargang: str(r.jaargang),
        kleur: str(r.kleur),
        streekSlug: rel(r.streek, 'slug'),
        streekName: rel(r.streek, 'name'),
        wijnhuisSlug: rel(r.wijnhuis, 'slug'),
        wijnhuisName: rel(r.wijnhuis, 'name'),
        categorie: str(r.categorie),
        verdict: str(r.verdict) || 'niet-beoordeeld',
        prijsEur: prijs !== null && Number.isFinite(prijs) ? prijs : null,
        winkelNaam: str(r.winkel_naam),
        winkelUrl: str(r.winkel_url),
        winkelStad: str(r.winkel_stad),
        wijnKort: str(r.wijn_kort),
        seoTitle: str(r.seo_title),
        nominatievraag: str(r.nominatievraag),
        affiliateLinks: r.affiliate_links === true,
        verdictZin: str(r.verdict_zin),
        deVraagHtml: await md(r.de_vraag),
        lijktOp: str(r.lijkt_op),
        voorWie: str(r.voor_wie),
        nietVoorWie: str(r.niet_voor_wie),
        smaakHtml: await md(r.smaak),
        leerpuntHtml: await md(r.leerpunt),
        wanneerWaarbijHtml: await md(r.wanneer_waarbij),
        drinkvenster: str(r.drinkvenster),
        proefDeStreekHtml: await md(r.proef_de_streek),
        herkomst: (HERKOMST as readonly string[]).includes(str(r.herkomst)) ? str(r.herkomst) : '',
        herkomstNaam: str(r.herkomst_naam),
        voorDeLiefhebberHtml: await md(r.voor_de_liefhebber),
        flesImage: r.fles_image ? await downloadFles(String(r.fles_image), url, token) : null,
        publicatiedatum: str(r.publicatiedatum),
    };
}

const cache = new Map<Locale, Promise<WijnReview[]>>();

/** Gepubliceerde reviews voor `locale`, nieuwste eerst. Gecachet per build. */
export function loadWijnReviews(locale: Locale = DEFAULT_LOCALE): Promise<WijnReview[]> {
    const hit = cache.get(locale);
    if (hit) return hit;
    const p = (async () => {
        const env = readDirectusEnv();
        let rows = await fetchRows();
        if (rows.length && locale !== DEFAULT_LOCALE) {
            try {
                rows = await localizeRecords(rows, {
                    env,
                    junction: 'wijn_reviews_translations',
                    parentIdField: 'wijn_reviews_id',
                    fields: WIJN_REVIEWS_TRANSLATABLE,
                    locale,
                } as Parameters<typeof localizeRecords>[1]);
            } catch (err) {
                console.warn(`[loadWijnReviews] EN-overlay faalde, geen EN-reviews: ${err instanceof Error ? err.message : String(err)}`);
                rows = [];
            }
        }
        const mapped = await Promise.all(rows.map((r) => mapRow(r, env.url, env.token)));
        return mapped.filter((r) => r.slug && r.wijn);
    })();
    cache.set(locale, p);
    return p;
}

/** Streken voor de dropdown op het insturen-formulier (id is nodig voor de M2O). */
export async function loadStreekOpties(): Promise<StreekOptie[]> {
    const env = readDirectusEnv();
    if (!env.configured) return [];
    try {
        const res = await fetchDirectusCollection(
            'loadStreekOpties',
            `${env.url}/items/streken?limit=-1&fields=id,slug,name&filter[status][_eq]=published&sort=name`,
            { headers: { Authorization: `Bearer ${env.token}` } },
        );
        if (!res.ok) return [];
        const rows = ((await res.json()).data || []) as Record<string, unknown>[];
        return rows
            .map((r) => ({ id: Number(r.id), slug: str(r.slug), name: str(r.name) }))
            .filter((s) => Number.isFinite(s.id) && s.name);
    } catch {
        return [];
    }
}
