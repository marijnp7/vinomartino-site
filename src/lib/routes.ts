export interface WijnRoute {
    slug: string;
    title: string;
    description: string;
    duration: string;
    transport: string;
    style: string;
    highlights: string[];
    stops: string[];
    heroImage: string | null;
    ogImage: string | null;
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
            console.warn(`[loadRoutes] could not fetch asset ${assetId}: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        return `/images/routes/${fileName}`;
    } catch (err) {
        console.warn(`[loadRoutes] asset download failed for ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
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

function mapRoute(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
): WijnRoute {
    return {
        slug: String(r.slug),
        title: String(r.title),
        description: String(r.description || ''),
        duration: String(r.duration || ''),
        transport: String(r.transport || ''),
        style: String(r.style || ''),
        highlights: parseJsonField(r.highlights),
        stops: parseJsonField(r.stops),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.title),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
    };
}

async function fetchRoutesItems(url: string, token: string): Promise<Record<string, unknown>[] | null> {
    const baseFields = 'id,slug,title,description,body,duration,transport,style,highlights,stops,hero_image,status,meta_title,meta_description';
    const withOg = `${baseFields},og_image`;
    const filterSort = '&filter[status][_in]=published,draft&sort=title';
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/routes?limit=-1&fields=${withOg}${filterSort}`, { headers, signal });
    } catch (err) {
        console.warn(`[loadRoutes] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
    if (res.ok) {
        const json = await res.json();
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400) {
        console.warn(`[loadRoutes] Directus rejected fields=…,og_image (HTTP 400) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs to re-enable.`);
        try {
            const retry = await fetch(`${url}/items/routes?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
            if (retry.ok) {
                const json = await retry.json();
                return (json.data || []) as Record<string, unknown>[];
            }
            console.warn(`[loadRoutes] Retry without og_image also failed: ${retry.status} ${retry.statusText}`);
        } catch (err) {
            console.warn(`[loadRoutes] Retry without og_image threw: ${err instanceof Error ? err.message : String(err)}`);
        }
        return null;
    }
    console.warn(`[loadRoutes] Directus returned ${res.status} ${res.statusText}`);
    return null;
}

async function loadFromDirectus(url: string, token: string): Promise<WijnRoute[]> {
    const data = await fetchRoutesItems(url, token);
    if (!data) return [];
    const items = await Promise.all(
        data.map(async (r) => {
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            return mapRoute(r, heroImagePath, ogImagePath, bodyHtml);
        }),
    );
    console.log(`[loadRoutes] fetched ${items.length} routes from Directus`);
    return items;
}

async function loadFromLocalFiles(): Promise<WijnRoute[]> {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = 'src/content/wijnroutes';
    let files: string[];
    try {
        files = readdirSync(dir)
            .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
            .map((f: string) => join(dir, f));
    } catch { return []; }
    if (files.length === 0) return [];
    const items: WijnRoute[] = [];
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
            title: fm.title || 'Untitled',
            description: fm.description || '',
            duration: fm.duration || '',
            transport: fm.transport || '',
            style: fm.style || '',
            highlights: fm.highlights ? fm.highlights.split(',').map((t: string) => t.trim()) : [],
            stops: fm.stops ? fm.stops.split(',').map((t: string) => t.trim()) : [],
            heroImage: fm.heroImage || null,
            ogImage: fm.ogImage || null,
            status: fm.status || 'published',
            metaTitle: fm.metaTitle || fm.title || 'Untitled',
            metaDescription: fm.metaDescription || fm.description || '',
            bodyHtml,
        });
    }
    items.sort((a, b) => a.title.localeCompare(b.title));
    console.log(`[loadRoutes] loaded ${items.length} routes from local files`);
    return items;
}

export async function loadRoutes(): Promise<WijnRoute[]> {
    const { url, token } = getDirectusConfig();
    if (url && token) {
        const items = await loadFromDirectus(url, token);
        if (items.length > 0) return items;
    } else {
        console.warn(`[loadRoutes] Directus not configured — loading from local files`);
    }
    return loadFromLocalFiles();
}
