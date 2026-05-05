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

async function downloadHeroImage(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'streken');
    const outPath = join(outDir, `${assetId}.jpg`);
    if (existsSync(outPath)) return `/images/streken/${assetId}.jpg`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadStreken] could not fetch asset ${assetId}: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        return `/images/streken/${assetId}.jpg`;
    } catch (err) {
        console.warn(`[loadStreken] asset download failed for ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

function parseJsonField(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
}

function mapStreek(r: Record<string, unknown>, heroImagePath: string | null, bodyHtml: string): Streek {
    return {
        slug: String(r.slug),
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
        heroImage: heroImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function loadFromDirectus(url: string, token: string): Promise<Streek[]> {
    let res: Response;
    try {
        res = await fetch(
            `${url}/items/streken?limit=-1&fields=id,slug,name,description,body,climate,soil,main_grapes,sub_regions,vineyard_area,altitude,appellations,hero_image,status,meta_title,meta_description,land_id.name&filter[status][_in]=published,draft&sort=name`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
            },
        );
    } catch (err) {
        console.warn(`[loadStreken] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!res.ok) {
        console.warn(`[loadStreken] Directus returned ${res.status} ${res.statusText}`);
        return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    const items = await Promise.all(
        data.map(async (r) => {
            const land = r.land_id as Record<string, unknown> | null;
            if (land && land.name) r.land_name = land.name;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadHeroImage(String(r.hero_image), url, token)
                : null;
            return mapStreek(r, heroImagePath, bodyHtml);
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
        items.push({
            slug: fm.slug || filePath.replace(/.*\//, '').replace('.md', ''),
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
            heroImage: fm.heroImage || null,
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
    if (url && token) {
        const items = await loadFromDirectus(url, token);
        if (items.length > 0) return items;
    } else {
        console.warn(`[loadStreken] Directus not configured — loading from local files`);
    }
    return loadFromLocalFiles();
}
