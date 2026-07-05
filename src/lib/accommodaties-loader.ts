/**
 * Directus-loader voor de reisjunk-stijl accommodatie-roundup (LAT-1331,
 * EPIC LAT-1330). Vult het datacontract uit accommodaties.ts (LAT-1332) vanuit
 * de Directus `accommodations`-collectie — volledig CMS-driven, geen hardcoded
 * content of URLs.
 *
 * Schema-velden komen uit directus/scripts/extend-accommodations-schema.mjs:
 * status, location, price_low, price_high, dam_image_ref, streek_id.
 *
 * Foto: de property-foto wordt at-buildtijd uit Directus `hero_image`
 * gedownload (zelfde pijplijn als wijnhuizen) zodat we hosten i.p.v. hotlinken.
 * `dam_image_ref` draagt de ResourceSpace-provenance (rechten-bewuste ingest,
 * LAT-1334).
 *
 * Booking-CTA: de kale Booking.com-URL uit Directus gaat als `bookingUrl` de
 * kaart in; het component bouwt at-render een DIRECTE booking.com-deeplink met
 * Booking-`aid` + CJ-`label` (ad-blocker-bestendig, LAT-1400; unieke clkid per
 * property, LAT-923) via accommodatieBookingHref.
 */

import type {
    AccommodatieKaart,
    AccommodatieRoundup,
} from './accommodaties';
import { clusterKaarten } from './accommodatie-cluster';
import { normalizeStayTier } from './stay-tier';
import { normalizeEmDashes } from './markdown';
import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
    assetUrl,
    assertCollectionReadableOrDegrade,
} from './directus-config';

async function downloadAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'accommodaties');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/accommodaties/${fileName}`;
    try {
        const res = await fetch(assetUrl(directusUrl, assetId), {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadAccommodaties] kon asset ${assetId} niet ophalen: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadAccommodaties] grading-preset overgeslagen voor ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        return `/images/accommodaties/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadAccommodaties] asset-download faalde voor ${assetId}: ${msg}`);
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

// Kernvelden die de reisjunk-kaart altijd nodig heeft (region-grouping +
// publish-gate). De curatie-velden (tier/lat/lng, LAT-1406) komen apart erbij
// zodat de query nog vóór de Directus-migratie netjes degradeert: ontbreken
// die velden, dan vallen we terug op KERN (streek + status blijven behouden).
const BASE_FIELDS_CORE =
    'id,slug,name,location,description,price_low,price_high,booking_url,hero_image,dam_image_ref,streek_id.name,streek_id.slug';
const CURATIE_FIELDS = 'tier,lat,lng,why_regel';
const BASE_FIELDS = `${BASE_FIELDS_CORE},${CURATIE_FIELDS}`;

interface RawAcc {
    row: Record<string, unknown>;
    streekSlug: string;
    streekName: string;
}

async function fetchAccommodations(url: string, token: string): Promise<RawAcc[]> {
    const env = readDirectusEnv();
    const headers = { Authorization: `Bearer ${token}` };
    const sort = '&sort=name';
    const tryFetch = (fields: string, withStatus: boolean): Promise<Response> =>
        fetch(`${url}/items/accommodations?limit=-1&fields=${fields}${withStatus ? statusFilterQuery(env) : ''}${sort}`, {
            headers,
            signal: AbortSignal.timeout(15000),
        });

    // Voorkeursquery: curatie-velden + status-filter + streek-join. Tot DevOps de
    // migratie draait (extend-accommodations-schema.mjs) degradeert dit netjes
    // i.p.v. de streek-build te breken: eerst de nieuwe curatie-velden laten
    // vallen (streek + status blijven), dan pas status, dan minimaal.
    let res = await tryFetch(`${BASE_FIELDS},status`, true);
    if (!res.ok && (res.status === 400 || res.status === 403)) {
        console.warn(`[loadAccommodaties] curatie-velden (${CURATIE_FIELDS}) nog niet in Directus (HTTP ${res.status}) — retry zonder tier/lat/lng.`);
        res = await tryFetch(`${BASE_FIELDS_CORE},status`, true);
    }
    if (!res.ok && (res.status === 400 || res.status === 403)) {
        console.warn(`[loadAccommodaties] voorkeursquery geweigerd (HTTP ${res.status}) — retry zonder status/streek-velden.`);
        res = await tryFetch('id,slug,name,location,description,price_low,price_high,booking_url,hero_image,dam_image_ref', false);
        if (!res.ok && (res.status === 400 || res.status === 403)) {
            res = await tryFetch('id,slug,name,description,booking_url,hero_image', false);
        }
    }
    if (!res.ok) {
        // LAT-1768: collection-level 403/404 → productie fail-loud, alleen
        // preview/dev degradeert naar lege lijst.
        if (res.status === 403 || res.status === 404) {
            const rbody = await res.text().catch(() => '');
            assertCollectionReadableOrDegrade('loadAccommodaties', 'accommodations', res.status, env, rbody.slice(0, 200));
            return [];
        }
        const body = await res.text().catch(() => '');
        throw new Error(`[loadAccommodaties] Directus gaf ${res.status}: ${body.slice(0, 300)}`);
    }
    const rows = ((await res.json()).data || []) as Record<string, unknown>[];
    return rows.map((row) => {
        const streek = (row.streek_id && typeof row.streek_id === 'object' ? row.streek_id : {}) as Record<string, unknown>;
        return { row, streekSlug: String(streek.slug || ''), streekName: String(streek.name || '') };
    });
}

/**
 * Levert de reisjunk-roundup per streek-slug. Alleen accommodaties met een
 * streek_id worden gegroepeerd; binnen een streek vormen ze 40-min-clusters
 * (LAT-1406): verblijven die binnen ~40 min rijden van elkaar liggen komen in
 * één blok, plaatsen door elkaar gemengd. Ontbreekt lat/lng nog, dan valt het
 * cluster terug op groeperen per plaats.
 */
export async function loadAccommodatieRoundupsByStreek(): Promise<Map<string, AccommodatieRoundup>> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadAccommodaties', env);
    const raws = await fetchAccommodations(env.url, env.token);

    // Eerst de fotos downloaden (parallel), dan groeperen.
    const kaarten = await Promise.all(
        raws.map(async ({ row, streekSlug, streekName }) => {
            const foto = row.hero_image ? await downloadAsset(String(row.hero_image), env.url, env.token) : null;
            const plaats = normalizeEmDashes(String(row.location || ''));
            const kaart: AccommodatieKaart = {
                naam: normalizeEmDashes(String(row.name || '')),
                slug: String(row.slug || ''),
                plaats,
                tier: normalizeStayTier(row.tier),
                lat: toFloatOrNull(row.lat),
                lng: toFloatOrNull(row.lng),
                beschrijving: normalizeEmDashes(String(row.description || '')),
                whyRegel: row.why_regel ? normalizeEmDashes(String(row.why_regel)) : null,
                foto,
                fotoAlt: null,
                prijsLaag: toIntOrNull(row.price_low),
                prijsHoog: toIntOrNull(row.price_high),
                bookingUrl: row.booking_url ? String(row.booking_url) : null,
            };
            return { streekSlug, streekName, plaats, kaart };
        }),
    );

    const byStreek = new Map<string, { regio: string; kaarten: AccommodatieKaart[] }>();
    for (const { streekSlug, streekName, kaart } of kaarten) {
        if (!streekSlug) continue;
        if (!byStreek.has(streekSlug)) byStreek.set(streekSlug, { regio: streekName, kaarten: [] });
        byStreek.get(streekSlug)!.kaarten.push(kaart);
    }

    const out = new Map<string, AccommodatieRoundup>();
    for (const [streekSlug, { regio, kaarten: streekKaarten }] of byStreek) {
        out.set(streekSlug, { regio, clusters: clusterKaarten(streekKaarten, regio) });
    }
    console.log(`[loadAccommodaties] ${kaarten.length} accommodaties → ${out.size} streek-roundups`);
    return out;
}
