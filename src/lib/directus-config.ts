/**
 * Shared Directus runtime configuration for site content loaders.
 *
 * Behavior contract (LAT-984, hardened by LAT-1078):
 * - DIRECTUS_URL + DIRECTUS_TOKEN configured → Directus is the canonical source.
 *   Network/HTTP failures throw, so builds fail loudly instead of silently
 *   serving stale or fallback content.
 * - Both env vars missing → throw with a clear message naming what is missing.
 *   The legacy ALLOW_LOCAL_CONTENT_FALLBACK escape hatch was removed in
 *   LAT-1078: src/content/_legacy/* is archive, not a runtime source.
 * - DIRECTUS_INCLUDE_DRAFTS=1 → status filter becomes published+draft (preview
 *   mode). Default keeps drafts out of production builds.
 */

export interface DirectusEnv {
    url: string;
    token: string;
    configured: boolean;
    includeDrafts: boolean;
}

export function readDirectusEnv(): DirectusEnv {
    const url = (process.env['DIRECTUS_URL'] || '').trim();
    const token = (process.env['DIRECTUS_TOKEN'] || '').trim();
    const includeDrafts = process.env['DIRECTUS_INCLUDE_DRAFTS'] === '1';
    return {
        url,
        token,
        configured: Boolean(url && token),
        includeDrafts,
    };
}

/**
 * LAT-2779 — één plek voor de Directus-fetchtimeout.
 *
 * Tot nu toe stond een hardcoded 15s-`AbortSignal` ~40x verspreid over
 * src/lib/. Onder VPS-CPU-verzadiging (LAT-2776, 15-min load ~13.8 op 2 vCPU)
 * lopen die 15s-timeouts over en klapt de hele build om op
 * `Failed to call getStaticPaths`. 45s is ruim boven de gemeten piek-latency en
 * is met `DIRECTUS_FETCH_TIMEOUT_MS` per build bij te stellen zonder codewijziging.
 *
 * Ongeldige of niet-positieve waarden vallen stil terug op de default.
 */
export const DIRECTUS_FETCH_TIMEOUT_MS_DEFAULT = 45000;

export function directusFetchTimeoutMs(): number {
    const raw = (process.env['DIRECTUS_FETCH_TIMEOUT_MS'] || '').trim();
    if (!raw) return DIRECTUS_FETCH_TIMEOUT_MS_DEFAULT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        console.warn(
            `[directus-config] DIRECTUS_FETCH_TIMEOUT_MS='${raw}' is geen positief getal — terug naar ${DIRECTUS_FETCH_TIMEOUT_MS_DEFAULT}ms.`,
        );
        return DIRECTUS_FETCH_TIMEOUT_MS_DEFAULT;
    }
    return Math.round(parsed);
}

/**
 * Timeout-signal voor élke Directus-fetch. Vervangt de losse
 * hardcoded 15s-signals. Roep dit per fetch aan: een signal is
 * eenmalig en begint af te tellen op het moment van aanmaken, dus één gedeeld
 * signal over meerdere sequentiële fetches deelt hetzelfde budget.
 */
export function directusSignal(): AbortSignal {
    return AbortSignal.timeout(directusFetchTimeoutMs());
}

/**
 * LAT-2779 — aantal extra pogingen ná de eerste voor de collection-loaders,
 * en de wachttijd ertussen. Bij te stellen via env zonder codewijziging.
 */
export const DIRECTUS_RETRIES_DEFAULT = 2;
export const DIRECTUS_RETRY_BACKOFF_MS_DEFAULT = 2000;

function readPositiveIntEnv(name: string, fallback: number): number {
    const raw = (process.env[name] || '').trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.round(parsed);
}

/**
 * LAT-2779 — fetch voor de collection-queries van de loaders mét retry-backoff:
 * streken, landen, routes, articles, wijnhuizen en accommodaties (de zes uit de
 * ticket-scope), plus de overige Directus-collectiequeries die dezelfde
 * body-abort-crash konden oplopen: navigation, ui-strings, atlas, reispakketten,
 * de translations-overlay en het clicks-dashboard.
 *
 * Retryt **alleen** op een geworpen fout: timeout (`TimeoutError` via
 * AbortSignal) of netwerkfout. Een HTTP-antwoord wordt onaangeroerd
 * teruggegeven — ook 4xx/5xx. Dat is bewust: de loaders gebruiken 400/403 als
 * signaal voor "veld/permissie bestaat nog niet" en vallen dan naar een lagere
 * field-tier terug. Retryen zou die tier-logica stukmaken en de build vertragen.
 *
 * Asset-downloads gaan hier bewust niet doorheen: die zijn idempotent en de
 * volgende build pakt een gemiste asset op (streken.ts heeft z'n eigen
 * fetchAssetWithRetry voor 429/5xx).
 *
 * De body wordt hier al volledig ingelezen en als in-memory Response
 * teruggegeven. Dat is essentieel: een AbortSignal breekt niet alleen het
 * verbinden af maar óók het uitlezen van de body. De loaders doen
 * `const json = await res.json()` buiten elke try/catch, dus een `limit=-1`
 * respons die traag binnendruppelt gooide daar een kale
 * "The operation was aborted due to timeout" — precies de crash die
 * `Failed to call getStaticPaths` opleverde. Door de body binnen de retry-lus te
 * bufferen is die fout retry-baar geworden en kan `res.json()` niet meer
 * afbreken.
 */
export async function fetchDirectusCollection(
    loaderName: string,
    url: string,
    init: RequestInit = {},
): Promise<Response> {
    const retries = readPositiveIntEnv('DIRECTUS_FETCH_RETRIES', DIRECTUS_RETRIES_DEFAULT);
    const backoffMs = readPositiveIntEnv('DIRECTUS_RETRY_BACKOFF_MS', DIRECTUS_RETRY_BACKOFF_MS_DEFAULT);
    let lastErr: unknown = new Error('fetch not attempted');
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Per poging een vers signal: het vorige is al verlopen.
            const res = await fetch(url, { ...init, signal: directusSignal() });
            const body = await res.text();
            // 204/205/304 mogen per spec geen body dragen in een Response-constructor.
            const nullBody = res.status === 204 || res.status === 205 || res.status === 304;
            // Alleen content-type overnemen: de transport-headers van het
            // origineel (content-length, content-encoding) slaan niet meer op
            // de al gedecodeerde string.
            const contentType = res.headers.get('content-type');
            return new Response(nullBody ? null : body, {
                status: res.status,
                statusText: res.statusText,
                headers: contentType ? { 'content-type': contentType } : {},
            });
        } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt === retries) break;
            console.warn(
                `[${loaderName}] Directus-fetch mislukt (poging ${attempt + 1}/${retries + 1}): ${msg} — ` +
                    `opnieuw over ${backoffMs}ms. Timeout staat op ${directusFetchTimeoutMs()}ms (LAT-2779).`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
    }
    throw lastErr;
}

/**
 * LAT-2779 — globale concurrency-cap op asset-downloads.
 *
 * De collection-loaders (streken × accommodaties, landen, routes, …) vuren hun
 * asset-downloads af via geneste `Promise.all`, wat neerkomt op ~1600 gelijktijdige
 * `/assets/`-requests op Directus. Die flood laat de build zichzélf DoS'en: op een
 * gedeelde 2-vCPU-host klimt de load tijdens de build van ~2 naar >10, waarna
 * Directus' eigen pressure-limiter `503 Service "api" unavailable — Under pressure`
 * teruggeeft óf de fetches over de timeout heen lopen → `Failed to call
 * getStaticPaths` → build faalt. Bewezen: een rerun startte op load 2.27 (< 3) en
 * viel alsnog om (LAT-2769). "Wachten op een rustig venster" werkt structureel niet
 * omdat de build zélf het lawaai maakt.
 *
 * Een gedeelde semafoor begrenst het totaal aantal parallelle asset-fetches over
 * álle loaders heen. Default 5, bij te stellen via `DIRECTUS_ASSET_CONCURRENCY`
 * zonder codewijziging. Alleen de netwerk-fetch zit in de slot — niet de
 * retry-backoff-sleeps of de image-grading — zodat een wachtende download geen
 * slot bezet houdt terwijl hij niets aan Directus vraagt.
 */
export const DIRECTUS_ASSET_CONCURRENCY_DEFAULT = 5;

function readPositiveNonZeroIntEnv(name: string, fallback: number): number {
    const raw = (process.env[name] || '').trim();
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.round(parsed);
}

let assetSlotsInUse = 0;
const assetSlotWaiters: Array<() => void> = [];

function acquireAssetSlot(limit: number): Promise<void> {
    if (assetSlotsInUse < limit) {
        assetSlotsInUse++;
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        assetSlotWaiters.push(() => {
            assetSlotsInUse++;
            resolve();
        });
    });
}

function releaseAssetSlot(): void {
    assetSlotsInUse--;
    const next = assetSlotWaiters.shift();
    if (next) next();
}

/**
 * Voer een asset-fetch uit binnen de globale concurrency-cap. Wrap alléén de
 * netwerkcall (`fetch`), niet de omliggende retry/backoff of image-processing.
 */
export async function withAssetSlot<T>(fn: () => Promise<T>): Promise<T> {
    const limit = readPositiveNonZeroIntEnv('DIRECTUS_ASSET_CONCURRENCY', DIRECTUS_ASSET_CONCURRENCY_DEFAULT);
    await acquireAssetSlot(limit);
    try {
        return await fn();
    } finally {
        releaseAssetSlot();
    }
}

/**
 * Directus on-the-fly image transform for build-time downloads (LAT-1770).
 * Originals are 3-7 MB; capping at 1600px width / quality 75 keeps heroes crisp
 * on retina while cutting per-asset weight ~95%. JPEG is kept so the `.jpg`
 * filenames and content-type stay unchanged (no template work). `fit=inside`
 * never upscales smaller sources. `format=jpg` is required: without it Directus
 * preserves the source format, so PNG-origin photos stay ~1 MB and serve as
 * image/png under a `.jpg` name.
 */
export const ASSET_TRANSFORM = 'width=1600&quality=75&fit=inside&format=jpg';

/** Append the shared transform to a Directus `/assets/<id>` URL. */
export function assetUrl(directusUrl: string, assetId: string): string {
    return `${directusUrl}/assets/${assetId}?${ASSET_TRANSFORM}`;
}

/** Directus query fragment selecting only publishable rows. */
export function statusFilterQuery(env: DirectusEnv): string {
    return env.includeDrafts
        ? '&filter[status][_in]=published,draft'
        : '&filter[status][_eq]=published';
}

/**
 * Fail the build when Directus is not configured. LAT-1078 removed the local
 * Markdown fallback — src/content/_legacy/* is archive-only and must never be
 * rendered. Loaders call this before any work.
 */
export function assertDirectusConfigured(loaderName: string, env: DirectusEnv): void {
    if (env.configured) return;
    throw new Error(
        `[${loaderName}] DIRECTUS_URL and DIRECTUS_TOKEN are required. ` +
            `Local Markdown under src/content/_legacy/ is archive-only since LAT-1078 ` +
            `and is no longer a runtime fallback. Configure Directus or point the build at a preview Directus instance.`,
    );
}

/**
 * LAT-1768 — is soft-degradation (return [] on a collection-level 403/404) allowed?
 *
 * Production builds must fail loud: a broken Directus/DAM coupling should block
 * the deploy before publication instead of silently shipping empty pages. The
 * only builds permitted to degrade are preview/dev:
 * - preview builds set DIRECTUS_INCLUDE_DRAFTS=1 (deploy.yml), so Marijn can
 *   still review the rest of the site even when one collection's permission is
 *   mid-migration.
 * - local/dev builds can opt in explicitly with ALLOW_CONTENT_DEGRADE=1.
 *
 * Default (production: neither flag set) returns false → callers throw.
 */
export function allowContentDegrade(env: DirectusEnv): boolean {
    return env.includeDrafts || process.env['ALLOW_CONTENT_DEGRADE'] === '1';
}

/**
 * LAT-1768 — handle a collection-level access failure (the build-role cannot
 * read the whole collection: terminal 403/404 after all field-tier fallbacks).
 * In production this throws so the build fails loud; in preview/dev it logs and
 * lets the caller degrade to an empty list. This is distinct from field-tier
 * 400/403 fallbacks, which legitimately mean "field not migrated yet" and must
 * stay tolerant.
 */
export function assertCollectionReadableOrDegrade(
    loaderName: string,
    collection: string,
    status: number,
    env: DirectusEnv,
    bodySnippet = '',
): void {
    const base =
        `[${loaderName}] Directus collection '${collection}' ontoegankelijk voor build-rol (HTTP ${status}).` +
        (bodySnippet ? ` Body: ${bodySnippet}` : '');
    if (allowContentDegrade(env)) {
        console.error(`${base} Preview/dev degradeert naar lege lijst — fix Directus-permissies (LAT-1013).`);
        return;
    }
    throw new Error(
        `${base} Productie-build afgebroken (LAT-1768 fail-loud): een kapotte CMS/DAM-koppeling ` +
            `mag geen lege pagina's publiceren. Fix de Directus-permissie, of zet ALLOW_CONTENT_DEGRADE=1 ` +
            `voor een expliciete preview/dev-build.`,
    );
}
