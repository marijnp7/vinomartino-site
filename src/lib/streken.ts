export interface Streek {
    slug: string;
    name: string;
    description: string;
    country: string;
    climate: string;
    soil: string;
    mainGrapes: string[];
    subRegions: string[];
    vineyardArea: string;
    altitude: string;
    appellations: string[];
    heroImage: string | null;
    ogImage: string | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
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
    const outDir = join(process.cwd(), 'public', 'images', 'streken');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/streken/${fileName}`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadStreken] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: buf.byteLength });
        return `/images/streken/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadStreken] asset download failed for ${assetId}: ${msg}`);
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
        join(dir, 'build-debug-streken.json'),
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

function mapStreek(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
): Streek {
    return {
        slug: String(r.slug),
        name: normalizeEmDashes(String(r.name)),
        description: normalizeEmDashes(String(r.description || '')),
        country: String(r.country || r.land_name || ''),
        climate: String(r.climate || ''),
        soil: String(r.soil || ''),
        mainGrapes: parseJsonField(r.main_grapes),
        subRegions: parseJsonField(r.sub_regions),
        vineyardArea: String(r.vineyard_area || ''),
        altitude: String(r.altitude || ''),
        appellations: parseJsonField(r.appellations),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function fetchStrekenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,climate,soil,main_grapes,sub_regions,vineyard_area,altitude,appellations,hero_image,status,meta_title,meta_description,land_id.name';
    const withOg = `${baseFields},og_image`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/streken?limit=-1&fields=${withOg}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query', url, error: msg });
        throw new Error(`[loadStreken] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,og_image (HTTP ${res.status}) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs en/of geef de build-rol read-permissie op streken.og_image.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutOg: true });
        let retry: Response;
        try {
            retry = await fetch(`${url}/items/streken?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without og_image threw: ${msg}`);
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
            console.error(`[loadStreken] Directus collection 'streken' ontoegankelijk voor build-rol (HTTP ${retry.status}). /streken/* pages worden NIET gebuild. Fix Directus-permissies in LAT-1013.`);
            return [];
        }
        throw new Error(`[loadStreken] Directus retry without og_image failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)}`);
    }
    const body = await res.text().catch(() => '');
    assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500) });
    throw new Error(`[loadStreken] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Streek[]> {
    const data = await fetchStrekenItems(url, token);
    const items = await Promise.all(
        data.map(async (r) => {
            const land = r.land_id as Record<string, unknown> | null;
            if (land && land.name) r.land_name = land.name;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            return mapStreek(r, heroImagePath, ogImagePath, bodyHtml);
        }),
    );
    console.log(`[loadStreken] fetched ${items.length} streken from Directus`);
    return items;
}

export async function loadStreken(): Promise<Streek[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadStreken', env);
    const items = await loadFromDirectus(env.url, env.token);
    await writeAssetDebug('directus');
    return items;
}
