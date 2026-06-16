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
 * kaart in; het component wikkelt die at-render met de CJ-deeplink (PID
 * 101734849 + unieke SID per property, LAT-923) via accommodatieBookingHref.
 */

import type {
    AccommodatieKaart,
    AccommodatieSubgroep,
    AccommodatieRoundup,
} from './accommodaties';
import { normalizeEmDashes } from './markdown';
import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
} from './directus-config';

function slugifyPlaats(plaats: string): string {
    return plaats.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'overig';
}

async function downloadAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'accommodaties');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/accommodaties/${fileName}`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadAccommodaties] kon asset ${assetId} niet ophalen: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
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

const BASE_FIELDS =
    'id,slug,name,location,description,price_low,price_high,booking_url,hero_image,dam_image_ref,streek_id.name,streek_id.slug';

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

    // Voorkeursquery: status-filter + streek-join. Tot DevOps de migratie draait
    // (extend-accommodations-schema.mjs) degradeert dit netjes i.p.v. de
    // streek-build te breken.
    let res = await tryFetch(`${BASE_FIELDS},status`, true);
    if (!res.ok && (res.status === 400 || res.status === 403)) {
        console.warn(`[loadAccommodaties] voorkeursquery geweigerd (HTTP ${res.status}) — retry zonder status/streek-velden.`);
        res = await tryFetch('id,slug,name,location,description,price_low,price_high,booking_url,hero_image,dam_image_ref', false);
        if (!res.ok && (res.status === 400 || res.status === 403)) {
            res = await tryFetch('id,slug,name,description,booking_url,hero_image', false);
        }
    }
    if (!res.ok) {
        if (res.status === 403 || res.status === 404) {
            console.error(`[loadAccommodaties] collectie 'accommodations' ontoegankelijk voor build-rol (HTTP ${res.status}). Geen reisjunk-kaarten gebuild.`);
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
 * streek_id worden gegroepeerd; binnen een streek vormen ze subgroepen per
 * plaats (sub-bestemming), gesorteerd op de Directus-naamsortering.
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
                beschrijving: normalizeEmDashes(String(row.description || '')),
                foto,
                fotoAlt: null,
                prijsLaag: toIntOrNull(row.price_low),
                prijsHoog: toIntOrNull(row.price_high),
                bookingUrl: row.booking_url ? String(row.booking_url) : null,
            };
            return { streekSlug, streekName, plaats, kaart };
        }),
    );

    const byStreek = new Map<string, { regio: string; subs: Map<string, AccommodatieSubgroep> }>();
    for (const { streekSlug, streekName, plaats, kaart } of kaarten) {
        if (!streekSlug) continue;
        if (!byStreek.has(streekSlug)) byStreek.set(streekSlug, { regio: streekName, subs: new Map() });
        const bucket = byStreek.get(streekSlug)!;
        const groupKey = plaats || bucket.regio;
        if (!bucket.subs.has(groupKey)) {
            bucket.subs.set(groupKey, { plaats: groupKey, slug: slugifyPlaats(groupKey), kaarten: [] });
        }
        bucket.subs.get(groupKey)!.kaarten.push(kaart);
    }

    const out = new Map<string, AccommodatieRoundup>();
    for (const [streekSlug, { regio, subs }] of byStreek) {
        out.set(streekSlug, { regio, subgroepen: [...subs.values()] });
    }
    console.log(`[loadAccommodaties] ${kaarten.length} accommodaties → ${out.size} streek-roundups`);
    return out;
}
