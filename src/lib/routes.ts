import { stripEditorialHeader, type RelatedRef } from './articles';
import { getCtaStructure, type CtaStructure } from './cta-blocks';

// LAT-1635 — een stop mét coördinaten voor de geografische routekaart
// (RouteGeoMap). Komt uit het Directus-veld routes.stops_geo (JSON-array van
// {naam,lat,lng}). Onafhankelijk van het bestaande tekstuele `stops`-veld zodat de
// schematische RouteMap blijft werken als stops_geo (nog) leeg/afwezig is.
export interface RouteStopGeo {
    naam: string;
    lat: number;
    lng: number;
}

export interface WijnRoute {
    slug: string;
    title: string;
    description: string;
    duration: string;
    transport: string;
    style: string;
    streekSlug: string;
    highlights: string[];
    stops: string[];
    stopsGeo: RouteStopGeo[];
    heroImage: string | null;
    ogImage: string | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
    relatedArticles: RelatedRef[];
    cta: CtaStructure;
}

function mapRelatedArticles(val: unknown): RelatedRef[] {
    if (!Array.isArray(val)) return [];
    const out: RelatedRef[] = [];
    for (const row of val) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const inner = rec.articles_id && typeof rec.articles_id === 'object'
            ? rec.articles_id as Record<string, unknown>
            : rec;
        const slug = inner.slug ? String(inner.slug) : '';
        const name = inner.title ? String(inner.title) : slug;
        if (!slug) continue;
        out.push({ slug, name: normalizeEmDashes(name) });
    }
    return out;
}

import { markdownToHtml as renderMarkdown, normalizeEmDashes } from './markdown';

function markdownToHtml(markdown: string): Promise<string> {
    return renderMarkdown(markdown, { stripFirstH1: true });
}

import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
} from './directus-config';

const assetDebug: Array<Record<string, unknown>> = [];

async function downloadAsset(assetId: string, directusUrl: string, token: string, prefix = ''): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'routes');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/routes/${fileName}`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadRoutes] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: buf.byteLength });
        return `/images/routes/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadRoutes] asset download failed for ${assetId}: ${msg}`);
        assetDebug.push({ assetId, prefix, error: msg });
        return null;
    }
}

async function writeAssetDebug(pathTaken: string): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'public');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'build-debug-routes.json'),
        JSON.stringify({ asOf: new Date().toISOString(), pathTaken, entries: assetDebug }, null, 2),
    );
}

function parseJsonField(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
}

// LAT-1635 — tolerant parser voor routes.stops_geo. Accepteert zowel een echte
// JSON-array als een JSON-string en negeert rijen zonder geldige coördinaten, zodat
// half-gevulde data de build nooit breekt (RouteGeoMap rendert toch alleen bij ≥2).
function parseStopsGeo(val: unknown): RouteStopGeo[] {
    let arr: unknown = val;
    if (typeof val === 'string') {
        try { arr = JSON.parse(val); } catch { return []; }
    }
    if (!Array.isArray(arr)) return [];
    const out: RouteStopGeo[] = [];
    for (const row of arr) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const lat = Number(rec.lat);
        const lng = Number(rec.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        out.push({ naam: normalizeEmDashes(String(rec.naam ?? '')), lat, lng });
    }
    return out;
}

function mapRoute(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
): WijnRoute {
    return {
        slug: String(r.slug),
        title: normalizeEmDashes(String(r.title)),
        description: normalizeEmDashes(String(r.description || '')),
        duration: String(r.duration || ''),
        transport: String(r.transport || ''),
        style: String(r.style || ''),
        streekSlug: '',
        highlights: parseJsonField(r.highlights),
        stops: parseJsonField(r.stops),
        stopsGeo: parseStopsGeo(r.stops_geo),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.title),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
        relatedArticles: mapRelatedArticles(r.related_articles),
        cta: getCtaStructure(r),
    };
}

async function fetchRoutesItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,title,description,body,duration,transport,style,highlights,stops,hero_image,status,meta_title,meta_description';
    const withOg = `${baseFields},og_image`;
    // LAT-1098: reverse-relation via M2M articles.related_routes (junction `articles_routes`).
    const withRelations = `${withOg},related_articles.articles_id.slug,related_articles.articles_id.title`;
    // LAT-1199: canonieke M2O streek_id (LAT-1198). Additieve top-tier; bij 400/403
    // (veld/permissie ontbreekt) valt de bestaande keten terug zonder streek_id en
    // levert de M2M-junction (loadRouteStreekJunction) de mapping alsnog.
    const withStreek = `${withRelations},streek_id.slug`;
    // LAT-1635: additieve top-tier met routes.stops_geo (JSON). Bestaat het veld nog
    // niet (DevOps-migratie), dan 400/403 → drop alléén stops_geo en val terug op
    // withStreek (relaties + streek_id blijven behouden). Deploy-safe.
    const withGeo = `${withStreek},stops_geo`;
    // LAT-1795: additieve top-tier met routes.cta_blocks (3-CTA-structuur). Bestaat
    // het veld nog niet, dan 400/403 → drop alléén cta_blocks en val terug op withGeo
    // (stops_geo + relaties blijven behouden). Deploy-safe.
    const withCta = `${withGeo},cta_blocks`;
    const filterSort = `${statusFilterQuery(env)}&sort=title`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/routes?limit=-1&fields=${withCta}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query', url, error: msg });
        throw new Error(`[loadRoutes] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400 || res.status === 403) {
        const ctaBody = await res.text().catch(() => '');
        console.warn(`[loadRoutes] Directus rejected fields=…,cta_blocks (HTTP ${res.status}) — retrying without LAT-1795 cta_blocks.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: ctaBody.slice(0, 500), retryWithoutCta: true });
        try {
            res = await fetch(`${url}/items/routes?limit=-1&fields=${withGeo}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-cta', url, error: msg });
            throw new Error(`[loadRoutes] Directus retry without cta_blocks threw: ${msg}`);
        }
        if (res.ok) {
            const json = await res.json();
            assetDebug.push({ kind: 'query-retry-cta', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
    }
    if (res.status === 400 || res.status === 403) {
        const geoBody = await res.text().catch(() => '');
        console.warn(`[loadRoutes] Directus rejected fields=…,stops_geo (HTTP ${res.status}) — retrying without LAT-1635 stops_geo.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: geoBody.slice(0, 500), retryWithoutGeo: true });
        try {
            res = await fetch(`${url}/items/routes?limit=-1&fields=${withStreek}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-geo', url, error: msg });
            throw new Error(`[loadRoutes] Directus retry without stops_geo threw: ${msg}`);
        }
        if (res.ok) {
            const json = await res.json();
            assetDebug.push({ kind: 'query-retry-geo', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
    }
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadRoutes] Directus rejected fields=…,related_articles (HTTP ${res.status}) — retrying without LAT-1098 relations.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutRelations: true });
        let retryRel: Response;
        try {
            retryRel = await fetch(`${url}/items/routes?limit=-1&fields=${withOg}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-rel', url, error: msg });
            throw new Error(`[loadRoutes] Directus retry without relations threw: ${msg}`);
        }
        if (retryRel.ok) {
            const json = await retryRel.json();
            assetDebug.push({ kind: 'query-retry-rel', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        if (retryRel.status !== 400 && retryRel.status !== 403) {
            const rbody = await retryRel.text().catch(() => '');
            assetDebug.push({ kind: 'query-retry-rel', url, status: retryRel.status, body: rbody.slice(0, 500) });
            throw new Error(`[loadRoutes] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)}`);
        }
        console.warn(`[loadRoutes] Directus also rejected fields=…,og_image (HTTP ${retryRel.status}) — retrying without og_image.`);
        let retry: Response;
        try {
            retry = await fetch(`${url}/items/routes?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry', url, error: msg });
            throw new Error(`[loadRoutes] Directus retry without og_image threw: ${msg}`);
        }
        if (retry.ok) {
            const json = await retry.json();
            assetDebug.push({ kind: 'query-retry', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        const rbody = await retry.text().catch(() => '');
        assetDebug.push({ kind: 'query-retry', url, status: retry.status, body: rbody.slice(0, 500) });
        // LAT-1011: collection-level 403/404 → degradeer naar lege lijst.
        if (retry.status === 403 || retry.status === 404) {
            console.error(`[loadRoutes] Directus collection 'routes' ontoegankelijk voor build-rol (HTTP ${retry.status}). /wijnroutes/* pages worden NIET gebuild. Fix Directus-permissies in LAT-1013.`);
            return [];
        }
        throw new Error(`[loadRoutes] Directus retry without og_image failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)}`);
    }
    const body = await res.text().catch(() => '');
    assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500) });
    throw new Error(`[loadRoutes] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

// LAT-1199: M2M-junction `routes_streken` als fallback voor routes.streek_id zolang
// die M2O nog niet gepopuleerd is (populatie = ZA-migratie, buiten LAT-1198). Leest
// de junction-collectie direct; degradeert stil naar lege map bij permissie/HTTP-fout
// zodat een ontbrekende read-rechten de routes-build niet breekt.
async function loadRouteStreekJunction(url: string, token: string): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
        const res = await fetch(
            `${url}/items/routes_streken?limit=-1&fields=routes_id,streken_id.slug`,
            { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
        );
        if (!res.ok) {
            console.warn(`[loadRoutes] routes_streken junction niet leesbaar (HTTP ${res.status}); route→streek fallback overgeslagen.`);
            return map;
        }
        const json = await res.json();
        for (const row of (json.data || []) as Record<string, unknown>[]) {
            const rid = Number(row.routes_id);
            const streek = row.streken_id;
            const slug = streek && typeof streek === 'object' ? String((streek as Record<string, unknown>).slug || '') : '';
            if (rid && slug) map.set(rid, slug);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadRoutes] routes_streken junction fetch faalde: ${msg}`);
    }
    return map;
}

async function loadFromDirectus(url: string, token: string): Promise<WijnRoute[]> {
    const [data, junction] = await Promise.all([
        fetchRoutesItems(url, token),
        loadRouteStreekJunction(url, token),
    ]);
    const items = await Promise.all(
        data.map(async (r) => {
            const bodyHtml = r.body ? await markdownToHtml(stripEditorialHeader(String(r.body))) : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            const route = mapRoute(r, heroImagePath, ogImagePath, bodyHtml);
            // Prefer canonieke M2O streek_id; val terug op de M2M-junction.
            const m2o = r.streek_id && typeof r.streek_id === 'object'
                ? String((r.streek_id as Record<string, unknown>).slug || '')
                : '';
            route.streekSlug = m2o || junction.get(Number(r.id)) || '';
            return route;
        }),
    );
    console.log(`[loadRoutes] fetched ${items.length} routes from Directus`);
    return items;
}

export async function loadRoutes(): Promise<WijnRoute[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadRoutes', env);
    const items = await loadFromDirectus(env.url, env.token);
    await writeAssetDebug('directus');
    return items;
}
