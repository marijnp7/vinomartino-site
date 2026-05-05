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
    const outDir = join(process.cwd(), 'public', 'images', 'wijnhuizen');
    const outPath = join(outDir, `${assetId}.jpg`);
    if (existsSync(outPath)) return `/images/wijnhuizen/${assetId}.jpg`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadWijnhuizen] could not fetch asset ${assetId}: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        return `/images/wijnhuizen/${assetId}.jpg`;
    } catch (err) {
        console.warn(`[loadWijnhuizen] asset download failed for ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
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

function mapWijnhuis(r: Record<string, unknown>, heroImagePath: string | null, bodyHtml: string): Wijnhuis {
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
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function loadFromDirectus(url: string, token: string): Promise<Wijnhuis[]> {
    let res: Response;
    try {
        res = await fetch(
            `${url}/items/wijnhuizen?limit=-1&fields=id,slug,name,description,body,address,website,established,hectares,biodynamisch,winemaker,grapes,hero_image,status,meta_title,meta_description,streek_id.name&filter[status][_in]=published,draft&sort=name`,
            {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
            },
        );
    } catch (err) {
        console.warn(`[loadWijnhuizen] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return [];
    }
    if (!res.ok) {
        console.warn(`[loadWijnhuizen] Directus returned ${res.status} ${res.statusText}`);
        return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    const items = await Promise.all(
        data.map(async (r) => {
            const streek = r.streek_id as Record<string, unknown> | null;
            if (streek && streek.name) r.streek_name = streek.name;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadHeroImage(String(r.hero_image), url, token)
                : null;
            return mapWijnhuis(r, heroImagePath, bodyHtml);
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
    const { url, token } = getDirectusConfig();
    if (url && token) {
        const items = await loadFromDirectus(url, token);
        if (items.length > 0) return items;
    } else {
        console.warn(`[loadWijnhuizen] Directus not configured — loading from local files`);
    }
    return loadFromLocalFiles();
}
