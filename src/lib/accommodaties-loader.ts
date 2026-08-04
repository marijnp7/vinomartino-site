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
    withAssetSlot,
    fetchDirectusCollection,
} from './directus-config';
import { DEFAULT_LOCALE, type Locale } from './i18n';
import { localizeRecords, localizeRefsBySlug } from './directus-i18n';

// LAT-2575 — vertaalbare accommodatie-velden (native Directus translations, LAT-2574).
const ACCOMMODATIONS_TRANSLATABLE = ['description', 'why_this_one', 'why_regel', 'prijs_disclaimer', 'meta_title', 'meta_description', 'hero_alt'];

// LAT-3423 — asset-timeout op basis van gemeten transcode-tijd i.p.v. gokwerk.
//
// LAT-3331 zette dit op 3 s onder de aanname dat Directus' DB-pool volliep en
// geen connecties meer accepteerde. Die aanname is weerlegd (meting in
// LAT-3423): Directus antwoordt óók onder 3× buildlast op élk asset-request met
// HTTP 200 — hij wordt alleen trager, want /assets transcodeert CPU-gebonden.
// Gemeten op de live container, verse transcodes van 24 assets:
//
//   concurrency 4  → p50 1409 ms, p95 1692 ms, max 2716 ms,  0 % boven 3 s
//   concurrency 12 → p50 4998 ms, p95 7480 ms, max 10686 ms, 92 % boven 3 s
//
// De 3 s lag dus ónder de normale staart: zodra de ongememoïseerde loaders
// meerdere sweeps tegelijk draaiden (de echte oorzaak, hierboven gefixt) sloeg
// hij 92 % van de downloads af. Die assets verdwenen stil uit de build.
//
// 15 s geeft ~5,5× marge op de gemeten max bij concurrency 4 en begrenst nog
// steeds een écht vastgelopen request. Twee retries met backoff vangen een
// incidentele trage transcode af.
const ASSET_TIMEOUT_MS = 15_000;
const ASSET_ATTEMPTS = 3;
const ASSET_RETRY_BACKOFF_MS = [500, 1500];

const assetFailures = new Set<string>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describeFetchError(err: unknown): string {
    if (!(err instanceof Error)) return String(err);
    const cause = (err as { cause?: unknown }).cause;
    if (cause instanceof Error) {
        const code = (cause as { code?: string }).code;
        return `${err.message} (${code ?? cause.name}: ${cause.message})`;
    }
    return err.message;
}

async function downloadAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'accommodaties');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/accommodaties/${fileName}`;

    for (let attempt = 1; attempt <= ASSET_ATTEMPTS; attempt++) {
        const last = attempt === ASSET_ATTEMPTS;
        try {
            // LAT-3423: het slot moet de héle download omvatten — ophalen,
            // body uitlezen én graden. Stond alleen `fetch()` erin, dan gaf de
            // semafoor het slot al vrij zodra de headers binnen waren, en
            // liepen body-read en het CPU-zware `gradeBuffer` (sharp)
            // ongelimiteerd door elkaar. Met 288 assets verzadigt dat de
            // event-loop van het buildproces zelf, waardoor nieuwe TCP-
            // handshakes niet binnen undici's connectTimeout van 10 s rond
            // komen: `UND_ERR_CONNECT_TIMEOUT (directus:8055, 10000ms)`.
            // Die fout leest als "Directus weigert connecties", maar is
            // client-side uithongering — Directus antwoordt intussen gewoon
            // met 200 (gemeten, zie de tabel hierboven).
            const outcome = await withAssetSlot(async () => {
                const res = await fetch(assetUrl(directusUrl, assetId), {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
                });
                if (!res.ok) return { status: res.status } as const;
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
                return { status: res.status, saved: true } as const;
            });
            if (!outcome.saved) {
                // 4xx is deterministisch (asset bestaat niet / geen rechten) —
                // retryen levert alleen buildtijd-verlies op. 5xx is transient.
                if (outcome.status < 500 || last) {
                    console.warn(`[loadAccommodaties] kon asset ${assetId} niet ophalen: ${outcome.status}`);
                    assetFailures.add(assetId);
                    return null;
                }
                console.warn(`[loadAccommodaties] asset ${assetId} HTTP ${outcome.status} (poging ${attempt}/${ASSET_ATTEMPTS}) — opnieuw`);
                await sleep(ASSET_RETRY_BACKOFF_MS[attempt - 1]);
                continue;
            }
            return `/images/accommodaties/${fileName}`;
        } catch (err) {
            // LAT-3423: undici verpakt élke netwerkfout als de nietszeggende
            // TypeError "fetch failed" en hangt de echte oorzaak onder .cause.
            // Zonder die cause is niet te zien of een mislukte download een
            // timeout, een ECONNRESET of een DNS-fout was — precies het gat
            // waardoor LAT-3331 op de verkeerde oorzaak uitkwam.
            const msg = describeFetchError(err);
            if (last) {
                console.warn(`[loadAccommodaties] asset-download faalde voor ${assetId}: ${msg}`);
                assetFailures.add(assetId);
                return null;
            }
            console.warn(`[loadAccommodaties] asset-download faalde voor ${assetId} (poging ${attempt}/${ASSET_ATTEMPTS}): ${msg} — opnieuw`);
            await sleep(ASSET_RETRY_BACKOFF_MS[attempt - 1]);
        }
    }
    return null;
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

async function fetchAccommodations(url: string, token: string, locale: Locale): Promise<RawAcc[]> {
    const env = readDirectusEnv();
    const headers = { Authorization: `Bearer ${token}` };
    const sort = '&sort=name';
    const tryFetch = (fields: string, withStatus: boolean): Promise<Response> =>
        fetchDirectusCollection(
            'loadAccommodaties',
            `${url}/items/accommodations?limit=-1&fields=${fields}${withStatus ? statusFilterQuery(env) : ''}${sort}`,
            { headers },
        );

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
    const rawRows = ((await res.json()).data || []) as Record<string, unknown>[];
    const rows = await localizeRecords(rawRows, {
        env,
        junction: 'accommodations_translations',
        parentIdField: 'accommodations_id',
        fields: ACCOMMODATIONS_TRANSLATABLE,
        locale,
    });
    // LAT-2829 — de gejoinde streeknaam komt van een vreemd record en vertaalt
    // niet mee met de guard hierboven; zonder overlay draagt elke EN-roundup de
    // NL-streeknaam als kop. Zacht: geen EN-naam → NL blijft staan.
    await localizeRefsBySlug(
        rows.map((r) => (r.streek_id && typeof r.streek_id === 'object' ? (r.streek_id as Record<string, unknown>) : null)),
        {
            env,
            collection: 'streken',
            junction: 'streken_translations',
            parentIdField: 'streken_id',
            fields: ['name'],
            locale,
        },
    );
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
async function fetchAccommodatieRoundupsByStreek(locale: Locale): Promise<Map<string, AccommodatieRoundup>> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadAccommodaties', env);
    const raws = await fetchAccommodations(env.url, env.token, locale);

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
    // LAT-3423: maak weggevallen assets zichtbaar. Vóór deze regel verdwenen
    // afgebroken downloads stil in het log-ruis tussen honderden regels; het
    // aantal is nu één telbaar getal dat een build-gate kan afvangen.
    console.log(
        `[loadAccommodaties] ${kaarten.length} accommodaties → ${out.size} streek-roundups` +
            (assetFailures.size > 0 ? ` — ${assetFailures.size} assets niet opgehaald` : ''),
    );
    return out;
}

const accommodatieRoundupsCache = new Map<Locale, Promise<Map<string, AccommodatieRoundup>>>();

export function loadAccommodatieRoundupsByStreek(locale: Locale = DEFAULT_LOCALE): Promise<Map<string, AccommodatieRoundup>> {
    const cached = accommodatieRoundupsCache.get(locale);
    if (cached) return cached;

    const pending = fetchAccommodatieRoundupsByStreek(locale).then(
        (result) => result,
        (err) => {
            accommodatieRoundupsCache.delete(locale);
            throw err;
        },
    );
    accommodatieRoundupsCache.set(locale, pending);
    return pending;
}
