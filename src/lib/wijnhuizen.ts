export interface Wijnhuis {
    slug: string;
    name: string;
    description: string;
    region: string;
    country: string;
    address: string;
    website: string;
    established: number | null;
    hectares: string;
    biodynamisch: boolean;
    winemaker: string;
    grapes: string[];
    heroImage: string | null;
    ogImage: string | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
}

import { markdownToHtml as renderMarkdown } from './markdown';

function markdownToHtml(markdown: string): Promise<string> {
    return renderMarkdown(markdown, { stripFirstH1: true });
}

import {
    readDirectusEnv,
    statusFilterQuery,
    filterLocalByStatus,
    assertLocalFallbackAllowed,
} from './directus-config';

const assetDebug: Array<Record<string, unknown>> = [];

async function downloadAsset(assetId: string, directusUrl: string, token: string, prefix = ''): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'wijnhuizen');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/wijnhuizen/${fileName}`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadWijnhuizen] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: buf.byteLength });
        return `/images/wijnhuizen/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadWijnhuizen] asset download failed for ${assetId}: ${msg}`);
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
        join(dir, 'build-debug-wijnhuizen.json'),
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

function mapWijnhuis(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
): Wijnhuis {
    return {
        slug: String(r.slug),
        name: String(r.name),
        description: String(r.description || ''),
        region: String(r.region || r.streek_name || ''),
        country: String(r.country || ''),
        address: String(r.address || ''),
        website: String(r.website || ''),
        established: r.established ? Number(r.established) : null,
        hectares: String(r.hectares || ''),
        biodynamisch: Boolean(r.biodynamisch),
        winemaker: String(r.winemaker || ''),
        grapes: parseJsonField(r.grapes),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function fetchWijnhuizenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,address,website,established,hectares,biodynamisch,winemaker,grapes,hero_image,status,meta_title,meta_description,streek_id.name';
    const withOg = `${baseFields},og_image`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/wijnhuizen?limit=-1&fields=${withOg}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query', url, error: msg });
        throw new Error(`[loadWijnhuizen] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadWijnhuizen] Directus rejected fields=…,og_image (HTTP ${res.status}) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs en/of geef de build-rol read-permissie op wijnhuizen.og_image.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutOg: true });
        let retry: Response;
        try {
            retry = await fetch(`${url}/items/wijnhuizen?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry', url, error: msg });
            throw new Error(`[loadWijnhuizen] Directus retry without og_image threw: ${msg}`);
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
            console.error(`[loadWijnhuizen] Directus collection 'wijnhuizen' ontoegankelijk voor build-rol (HTTP ${retry.status}). /wijnhuizen/* pages worden NIET gebuild. Fix Directus-permissies in LAT-1013.`);
            return [];
        }
        throw new Error(`[loadWijnhuizen] Directus retry without og_image failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)}`);
    }
    const body = await res.text().catch(() => '');
    assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500) });
    throw new Error(`[loadWijnhuizen] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Wijnhuis[]> {
    const data = await fetchWijnhuizenItems(url, token);
    const items = await Promise.all(
        data.map(async (r) => {
            const streek = r.streek_id as Record<string, unknown> | null;
            if (streek && streek.name) r.streek_name = streek.name;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            return mapWijnhuis(r, heroImagePath, ogImagePath, bodyHtml);
        }),
    );
    console.log(`[loadWijnhuizen] fetched ${items.length} wijnhuizen from Directus`);
    return items;
}

async function loadFromLocalFiles(): Promise<Wijnhuis[]> {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = 'src/content/wijnhuizen';
    let files: string[];
    try {
        files = readdirSync(dir)
            .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
            .map((f: string) => join(dir, f));
    } catch { return []; }
    if (files.length === 0) return [];
    const items: Wijnhuis[] = [];
    for (const filePath of files) {
        const raw = readFileSync(filePath, 'utf-8');
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!fmMatch) continue;
        const fm: Record<string, string> = {};
        for (const line of fmMatch[1].split('\n')) {
            const [key, ...rest] = line.split(':');
            if (key && rest.length) fm[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
        }
        const bodyHtml = fmMatch[2] ? await markdownToHtml(fmMatch[2]) : '';
        items.push({
            slug: fm.slug || filePath.replace(/.*\//, '').replace('.md', ''),
            name: fm.name || fm.title || 'Untitled',
            description: fm.description || '',
            region: fm.region || '',
            country: fm.country || 'Italia',
            address: fm.address || '',
            website: fm.website || '',
            established: fm.established ? Number(fm.established) : null,
            hectares: '',
            biodynamisch: false,
            winemaker: '',
            grapes: fm.grapes ? fm.grapes.split(',').map((t: string) => t.trim()) : [],
            heroImage: fm.heroImage || null,
            ogImage: fm.ogImage || null,
            status: fm.status || 'published',
            metaTitle: fm.metaTitle || fm.name || fm.title || 'Untitled',
            metaDescription: fm.metaDescription || fm.description || '',
            bodyHtml,
        });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[loadWijnhuizen] loaded ${items.length} wijnhuizen from local files`);
    return items;
}

export async function loadWijnhuizen(): Promise<Wijnhuis[]> {
    const env = readDirectusEnv();
    let pathTaken: 'directus' | 'local-fallback';
    let items: Wijnhuis[] = [];
    if (env.configured) {
        items = await loadFromDirectus(env.url, env.token);
        pathTaken = 'directus';
    } else {
        assertLocalFallbackAllowed('loadWijnhuizen', env);
        console.warn(`[loadWijnhuizen] Directus not configured — loading from local files (ALLOW_LOCAL_CONTENT_FALLBACK=1)`);
        pathTaken = 'local-fallback';
        items = filterLocalByStatus(await loadFromLocalFiles(), env);
    }
    await writeAssetDebug(pathTaken);
    return items;
}
