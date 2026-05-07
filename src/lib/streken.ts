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

import { markdownToHtml as renderMarkdown } from './markdown';

function markdownToHtml(markdown: string): Promise<string> {
    return renderMarkdown(markdown, { stripFirstH1: true });
}

function getDirectusConfig() {
    const url = process.env['DIRECTUS_URL'] || '';
    const token = process.env['DIRECTUS_TOKEN'] || '';
    return { url, token };
}

const HERO_IMAGE_FALLBACKS: Record<string, string> = {
    'douro-portugal': '/images/streek-douro.jpg',
    'langhe-piemonte': '/images/streek-langhe.jpg',
    'mosel-duitsland': '/images/streek-mosel.jpg',
};

function applyHeroFallback(slug: string, current: string | null): string | null {
    if (current) return current;
    return HERO_IMAGE_FALLBACKS[slug] ?? null;
}

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
    const slug = String(r.slug);
    return {
        slug,
        name: String(r.name),
        description: String(r.description || ''),
        country: String(r.country || r.land_name || ''),
        climate: String(r.climate || ''),
        soil: String(r.soil || ''),
        mainGrapes: parseJsonField(r.main_grapes),
        subRegions: parseJsonField(r.sub_regions),
        vineyardArea: String(r.vineyard_area || ''),
        altitude: String(r.altitude || ''),
        appellations: parseJsonField(r.appellations),
        heroImage: applyHeroFallback(slug, heroImagePath),
        ogImage: ogImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function fetchStrekenItems(url: string, token: string): Promise<Record<string, unknown>[] | null> {
    const baseFields = 'id,slug,name,description,body,climate,soil,main_grapes,sub_regions,vineyard_area,altitude,appellations,hero_image,status,meta_title,meta_description,land_id.name';
    const withOg = `${baseFields},og_image`;
    const filterSort = '&filter[status][_in]=published,draft&sort=name';
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/streken?limit=-1&fields=${withOg}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadStreken] Directus unreachable at ${url}: ${msg}`);
        assetDebug.push({ kind: 'query', url, error: msg });
        return null;
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,og_image (HTTP 400) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs to re-enable.`);
        assetDebug.push({ kind: 'query', url, status: 400, body: body.slice(0, 500), retryWithoutOg: true });
        try {
            const retry = await fetch(`${url}/items/streken?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
            if (retry.ok) {
                const json = await retry.json();
                assetDebug.push({ kind: 'query-retry', url, status: 200, count: (json.data || []).length });
                return (json.data || []) as Record<string, unknown>[];
            }
            const rbody = await retry.text().catch(() => '');
            console.warn(`[loadStreken] Retry without og_image also failed: ${retry.status} ${retry.statusText}`);
            assetDebug.push({ kind: 'query-retry', url, status: retry.status, body: rbody.slice(0, 500) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[loadStreken] Retry without og_image threw: ${msg}`);
            assetDebug.push({ kind: 'query-retry', url, error: msg });
        }
        return null;
    }
    const body = await res.text().catch(() => '');
    console.warn(`[loadStreken] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500) });
    return null;
}

async function loadFromDirectus(url: string, token: string): Promise<Streek[]> {
    const data = await fetchStrekenItems(url, token);
    if (!data) return [];
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

async function loadFromLocalFiles(): Promise<Streek[]> {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = 'src/content/streken';
    let files: string[];
    try {
        files = readdirSync(dir)
            .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
            .map((f: string) => join(dir, f));
    } catch { return []; }
    if (files.length === 0) return [];
    const items: Streek[] = [];
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
        const slug = fm.slug || filePath.replace(/.*\//, '').replace('.md', '');
        items.push({
            slug,
            name: fm.name || fm.title || 'Untitled',
            description: fm.description || '',
            country: fm.country || '',
            climate: fm.climate || '',
            soil: fm.soil || '',
            mainGrapes: fm.grapeVarieties ? fm.grapeVarieties.split(',').map((t: string) => t.trim()) : [],
            subRegions: fm.subregions ? fm.subregions.split(',').map((t: string) => t.trim()) : [],
            vineyardArea: '',
            altitude: '',
            appellations: [],
            heroImage: applyHeroFallback(slug, fm.heroImage || null),
            ogImage: fm.ogImage || null,
            status: fm.status || 'published',
            metaTitle: fm.metaTitle || fm.name || fm.title || 'Untitled',
            metaDescription: fm.metaDescription || fm.description || '',
            bodyHtml,
        });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[loadStreken] loaded ${items.length} streken from local files`);
    return items;
}

export async function loadStreken(): Promise<Streek[]> {
    const { url, token } = getDirectusConfig();
    let pathTaken: 'directus' | 'directus-empty' | 'local-fallback' | 'directus-not-configured';
    let items: Streek[] = [];
    if (url && token) {
        items = await loadFromDirectus(url, token);
        pathTaken = items.length > 0 ? 'directus' : 'directus-empty';
        if (items.length === 0) items = await loadFromLocalFiles();
        if (pathTaken === 'directus-empty' && items.length > 0) pathTaken = 'local-fallback';
    } else {
        console.warn(`[loadStreken] Directus not configured — loading from local files`);
        pathTaken = 'directus-not-configured';
        items = await loadFromLocalFiles();
    }
    await writeAssetDebug(pathTaken);
    return items;
}
