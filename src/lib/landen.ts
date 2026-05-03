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

function getDirectusConfig() {
    const url = process.env['DIRECTUS_URL'] || '';
    const token = process.env['DIRECTUS_TOKEN'] || '';
    return { url, token };
}

function parseJsonField(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
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
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function loadFromDirectus(url: string, token: string): Promise<Land[]> {
    let res: Response;
    try {
        res = await fetch(
            `${url}/items/landen?limit=-1&fields=id,slug,name,description,body,continent,capital,climate,main_grapes,wine_history,best_time_to_visit,hero_image,status,meta_title,meta_description&filter[status][_in]=published,draft&sort=name`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
            },
        );
    } catch (err) {
        console.warn(`[loadLanden] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!res.ok) {
        console.warn(`[loadLanden] Directus returned ${res.status} ${res.statusText}`);
        return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
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
            mainGrapes: fm.grapeVarieties ? fm.grapeVarieties.split(',').map((t: string) => t.trim()) : [],
            wineHistory: '',
            bestTimeToVisit: fm.bestTimeToVisit || '',
            heroImage: fm.heroImage || null,
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
    const { url, token } = getDirectusConfig();
    if (url && token) {
        const items = await loadFromDirectus(url, token);
        if (items.length > 0) return items;
    } else {
        console.warn(`[loadLanden] Directus not configured — loading from local files`);
    }
    return loadFromLocalFiles();
}
