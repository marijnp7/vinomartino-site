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
    herkomstType: string;
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
];

const BASE_FIELDS = [
    'id', 'status', 'slug', 'wijn', 'producent', 'jaargang', 'kleur', 'categorie', 'verdict',
    'prijs_eur', 'winkel_naam', 'winkel_url', 'herkomst_type', 'herkomst_naam', 'fles_image',
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
        herkomstType: str(r.herkomst_type),
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
