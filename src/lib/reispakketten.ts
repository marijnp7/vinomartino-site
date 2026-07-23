/**
 * Directus-loader voor het "Reizen nareizen"-pakket-content-type (LAT-2023).
 *
 * Een reispakket is een redactionele, boekbare reisgids voor één wijnstreek:
 * introductie + dag-tot-dag route + de te boeken wijnhuizen + accommodaties
 * (via de bestaande AccommodatieKaart) + reismoment + CTA. Het leest volledig
 * uit de Directus `reispakketten`-collectie (schema:
 * directus/scripts/create-reispakketten-schema.mjs).
 *
 * M2M-relaties:
 *   - wijnhuizen    → junction `reispakketten_wijnhuizen`  (wijnhuizen_id)
 *   - accommodaties → junction `reispakketten_accommodations` (accommodations_id)
 *
 * Deploy-safe: de query degradeert netjes (retry zonder M2M-velden) zolang
 * DevOps de collectie/relaties nog niet heeft aangemaakt, zodat een ontbrekend
 * veld de site-build niet breekt. Foto's worden at-buildtijd uit Directus
 * gedownload (zelfde pijplijn als de andere loaders) i.p.v. gehotlinkt.
 */

import type { AccommodatieKaart } from './accommodaties';
import { markdownToHtml as renderMarkdown, normalizeEmDashes } from './markdown';
import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
    assetUrl,
    directusSignal,
    withAssetSlot,
    fetchDirectusCollection,
} from './directus-config';

export interface PakketWijnhuis {
    slug: string;
    name: string;
    description: string;
}

export interface ReisPakket {
    slug: string;
    titel: string;
    tagline: string;
    status: string;
    pubDate: string;
    streekSlug: string;
    streekName: string;
    introHtml: string;
    dagTotDagHtml: string;
    wijnhuizen: PakketWijnhuis[];
    accommodaties: AccommodatieKaart[];
    reismoment: string;
    ctaHeading: string;
    ctaTekst: string;
    heroImage: string | null;
    metaTitle: string;
    metaDescription: string;
}

async function downloadAsset(
    assetId: string,
    directusUrl: string,
    token: string,
    subdir: string,
): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', subdir);
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/${subdir}/${fileName}`;
    try {
        const res = await withAssetSlot(() =>
            fetch(assetUrl(directusUrl, assetId), {
                headers: { Authorization: `Bearer ${token}` },
                signal: directusSignal(),
            }),
        );
        if (!res.ok) {
            console.warn(`[loadReispakketten] kon asset ${assetId} niet ophalen: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadReispakketten] grading-preset overgeslagen voor ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        return `/images/${subdir}/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadReispakketten] asset-download faalde voor ${assetId}: ${msg}`);
        return null;
    }
}

function toIntOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
}

// M2M-junctionrijen leveren óf een genest object ({wijnhuizen_id: {...}}) óf een
// kale id. Alleen genest-met-slug is bruikbaar voor de kaart; rest wordt genegeerd.
function unwrapJunction(row: unknown, key: string): Record<string, unknown> | null {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const inner = rec[key];
    if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
    return null;
}

function mapWijnhuizen(val: unknown): PakketWijnhuis[] {
    if (!Array.isArray(val)) return [];
    const out: PakketWijnhuis[] = [];
    for (const row of val) {
        const inner = unwrapJunction(row, 'wijnhuizen_id');
        if (!inner || !inner.slug) continue;
        out.push({
            slug: String(inner.slug),
            name: normalizeEmDashes(String(inner.name || inner.slug)),
            description: normalizeEmDashes(String(inner.description || '')),
        });
    }
    return out;
}

async function mapAccommodaties(
    val: unknown,
    url: string,
    token: string,
): Promise<AccommodatieKaart[]> {
    if (!Array.isArray(val)) return [];
    const inners = val
        .map((row) => unwrapJunction(row, 'accommodations_id'))
        .filter((r): r is Record<string, unknown> => Boolean(r && r.slug));
    return Promise.all(
        inners.map(async (inner) => {
            const foto = inner.hero_image
                ? await downloadAsset(String(inner.hero_image), url, token, 'accommodaties')
                : null;
            const kaart: AccommodatieKaart = {
                naam: normalizeEmDashes(String(inner.name || '')),
                slug: String(inner.slug || ''),
                plaats: normalizeEmDashes(String(inner.location || '')),
                tier: null,
                lat: toFloatOrNull(inner.lat),
                lng: toFloatOrNull(inner.lng),
                beschrijving: normalizeEmDashes(String(inner.description || '')),
                foto,
                fotoAlt: null,
                prijsLaag: toIntOrNull(inner.price_low),
                prijsHoog: toIntOrNull(inner.price_high),
                bookingUrl: inner.booking_url ? String(inner.booking_url) : null,
            };
            return kaart;
        }),
    );
}

const CORE_FIELDS =
    'id,slug,titel,tagline,status,pub_date,introductie,dag_tot_dag,reismoment,cta_heading,cta_tekst,meta_title,meta_description,hero_image,streek_id.name,streek_id.slug';
const WIJNHUIS_FIELDS =
    'wijnhuizen.wijnhuizen_id.slug,wijnhuizen.wijnhuizen_id.name,wijnhuizen.wijnhuizen_id.description';
const ACC_FIELDS =
    'accommodaties.accommodations_id.slug,accommodaties.accommodations_id.name,accommodaties.accommodations_id.location,accommodaties.accommodations_id.description,accommodaties.accommodations_id.price_low,accommodaties.accommodations_id.price_high,accommodaties.accommodations_id.booking_url,accommodaties.accommodations_id.hero_image,accommodaties.accommodations_id.lat,accommodaties.accommodations_id.lng';

async function fetchPakketten(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const headers = { Authorization: `Bearer ${token}` };
    const filterSort = `${statusFilterQuery(env)}&sort=titel`;
    const tryFetch = (fields: string): Promise<Response> =>
        fetchDirectusCollection(
            'loadReispakketten',
            `${url}/items/reispakketten?limit=-1&fields=${fields}${filterSort}`,
            { headers },
        );

    // Voorkeursquery met M2M-relaties; degradeer wanneer de junctions nog niet
    // bestaan (DevOps-migratie) zodat de build niet breekt.
    let res = await tryFetch(`${CORE_FIELDS},${WIJNHUIS_FIELDS},${ACC_FIELDS}`);
    if (!res.ok && (res.status === 400 || res.status === 403)) {
        console.warn(`[loadReispakketten] M2M-velden nog niet in Directus (HTTP ${res.status}) — retry zonder wijnhuizen/accommodaties.`);
        res = await tryFetch(CORE_FIELDS);
    }
    if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
            console.error(`[loadReispakketten] collectie 'reispakketten' ontoegankelijk voor build-rol (HTTP ${res.status}). Geen /reizen-nareizen/* pages gebuild — DevOps moet create-reispakketten-schema.mjs draaien + read-permissie zetten.`);
            return [];
        }
        const body = await res.text().catch(() => '');
        throw new Error(`[loadReispakketten] Directus gaf ${res.status}: ${body.slice(0, 300)}`);
    }
    return ((await res.json()).data || []) as Record<string, unknown>[];
}

async function mapPakket(
    r: Record<string, unknown>,
    url: string,
    token: string,
): Promise<ReisPakket> {
    const streek = (r.streek_id && typeof r.streek_id === 'object' ? r.streek_id : {}) as Record<string, unknown>;
    const introHtml = r.introductie ? await renderMarkdown(String(r.introductie)) : '';
    const dagTotDagHtml = r.dag_tot_dag ? await renderMarkdown(String(r.dag_tot_dag)) : '';
    const heroImage = r.hero_image
        ? await downloadAsset(String(r.hero_image), url, token, 'reispakketten')
        : null;
    const titel = normalizeEmDashes(String(r.titel || ''));
    return {
        slug: String(r.slug || ''),
        titel,
        tagline: normalizeEmDashes(String(r.tagline || '')),
        status: String(r.status || 'draft'),
        pubDate: String(r.pub_date || ''),
        streekSlug: String(streek.slug || ''),
        streekName: normalizeEmDashes(String(streek.name || '')),
        introHtml,
        dagTotDagHtml,
        wijnhuizen: mapWijnhuizen(r.wijnhuizen),
        accommodaties: await mapAccommodaties(r.accommodaties, url, token),
        reismoment: normalizeEmDashes(String(r.reismoment || '')),
        ctaHeading: normalizeEmDashes(String(r.cta_heading || '')),
        ctaTekst: normalizeEmDashes(String(r.cta_tekst || '')),
        heroImage,
        metaTitle: String(r.meta_title || titel),
        metaDescription: normalizeEmDashes(String(r.meta_description || r.tagline || '')),
    };
}

export async function loadReispakketten(): Promise<ReisPakket[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadReispakketten', env);
    const data = await fetchPakketten(env.url, env.token);
    const items = await Promise.all(data.map((r) => mapPakket(r, env.url, env.token)));
    console.log(`[loadReispakketten] fetched ${items.length} reispakketten from Directus`);
    return items;
}
