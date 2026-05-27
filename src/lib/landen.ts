export interface Land {
    slug: string;
    name: string;
    description: string;
    continent: string;
    capital: string;
    climate: string;
    mainGrapes: string[];
    wineHistory: string;
    bestTimeToVisit: string;
    heroImage: string | null;
    ogImage: string | null;
    wijnstreken: { name: string; slug?: string }[];
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
}

async function markdownToHtml(markdown: string): Promise<string> {
    const { fromMarkdown } = await import('mdast-util-from-markdown');
    const { toHast } = await import('mdast-util-to-hast');
    const { toHtml } = await import('hast-util-to-html');
    const mdast = fromMarkdown(markdown);
    const hast = toHast(mdast);
    return toHtml(hast as Parameters<typeof toHtml>[0]);
}

import {
    readDirectusEnv,
    statusFilterQuery,
    filterLocalByStatus,
    assertLocalFallbackAllowed,
} from './directus-config';

function parseJsonField(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
}

function parseFrontmatterList(value: string | undefined): string[] {
    if (!value) return [];
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
        } catch {
            // fall through to comma split
        }
    }
    return trimmed.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

function mapWijnstreken(val: unknown): { name: string; slug?: string }[] {
    if (!Array.isArray(val)) return [];
    return val
        .map((item) => {
            if (item && typeof item === 'object') {
                const rec = item as Record<string, unknown>;
                const name = rec.name ? String(rec.name) : '';
                if (!name) return null;
                const slug = rec.slug ? String(rec.slug) : undefined;
                return { name, slug };
            }
            if (typeof item === 'string' && item.trim()) return { name: item.trim() };
            return null;
        })
        .filter((s): s is { name: string; slug?: string } => s !== null);
}

function mapLand(r: Record<string, unknown>, directusUrl: string, bodyHtml: string): Land {
    return {
        slug: String(r.slug),
        name: String(r.name),
        description: String(r.description || ''),
        continent: String(r.continent || ''),
        capital: String(r.capital || ''),
        climate: String(r.climate || ''),
        mainGrapes: parseJsonField(r.main_grapes),
        wineHistory: String(r.wine_history || ''),
        bestTimeToVisit: String(r.best_time_to_visit || ''),
        heroImage: r.hero_image ? `${directusUrl}/assets/${String(r.hero_image)}` : null,
        ogImage: r.og_image ? `${directusUrl}/assets/${String(r.og_image)}` : null,
        wijnstreken: mapWijnstreken(r.wijnstreken),
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function fetchLandenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,continent,capital,climate,main_grapes,wine_history,best_time_to_visit,hero_image,status,meta_title,meta_description';
    const withSeoMeta = `${baseFields},og_image,wijnstreken.name,wijnstreken.slug`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/landen?limit=-1&fields=${withSeoMeta}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[loadLanden] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        return (json.data || []) as Record<string, unknown>[];
    }
    // 400 = veld bestaat niet in Directus (pre-migratie); 403 = veld bestaat wel
    // maar de build-rol heeft geen read-permissie. Beide gevallen: degraderen
    // naar baseFields zodat de build niet hard breekt op een SEO-meta-veld.
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadLanden] Directus rejected fields=…,og_image,wijnstreken.* (HTTP ${res.status}) — retrying without LAT-1008 fields. Run directus/scripts/add-seo-meta-fields.mjs en/of geef de build-rol read-permissie op landen.og_image en landen.wijnstreken.`);
        const retry = await fetch(`${url}/items/landen?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        if (retry.ok) {
            const json = await retry.json();
            return (json.data || []) as Record<string, unknown>[];
        }
        const rbody = await retry.text().catch(() => '');
        throw new Error(`[loadLanden] Directus retry without LAT-1008 fields failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)} | original ${res.status} body: ${body.slice(0, 200)}`);
    }
    const body = await res.text().catch(() => '');
    throw new Error(`[loadLanden] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Land[]> {
    const data = await fetchLandenItems(url, token);
    const items = await Promise.all(
        data.map(async (r) => {
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            return mapLand(r, url, bodyHtml);
        }),
    );
    console.log(`[loadLanden] fetched ${items.length} landen from Directus`);
    return items;
}

async function loadFromLocalFiles(): Promise<Land[]> {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = 'src/content/landen';
    let files: string[];
    try {
        files = readdirSync(dir)
            .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
            .map((f: string) => join(dir, f));
    } catch { return []; }
    if (files.length === 0) return [];
    const items: Land[] = [];
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
            continent: fm.continent || '',
            capital: fm.capital || '',
            climate: fm.climate || '',
            mainGrapes: parseFrontmatterList(fm.grapeVarieties),
            wineHistory: '',
            bestTimeToVisit: fm.bestTimeToVisit || '',
            heroImage: fm.heroImage || null,
            ogImage: fm.ogImage || null,
            wijnstreken: parseFrontmatterList(fm.wijnstreken).map((name) => ({ name })),
            status: fm.status || 'published',
            metaTitle: fm.metaTitle || fm.name || fm.title || 'Untitled',
            metaDescription: fm.metaDescription || fm.description || '',
            bodyHtml,
        });
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    console.log(`[loadLanden] loaded ${items.length} landen from local files`);
    return items;
}

export async function loadLanden(): Promise<Land[]> {
    const env = readDirectusEnv();
    if (env.configured) return loadFromDirectus(env.url, env.token);
    assertLocalFallbackAllowed('loadLanden', env);
    console.warn(`[loadLanden] Directus not configured — loading from local files (ALLOW_LOCAL_CONTENT_FALLBACK=1)`);
    return filterLocalByStatus(await loadFromLocalFiles(), env);
}
