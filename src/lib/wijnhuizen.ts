import type { RelatedRef } from './articles';
import { getCtaStructure, type CtaStructure } from './cta-blocks';

export interface Wijnhuis {
    slug: string;
    name: string;
    description: string;
    region: string;
    streekSlug: string;
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
    relatedArticles: RelatedRef[];
    // LAT-1784/LAT-1795 — gestandaardiseerde 3-CTA-structuur (Directus `cta_blocks`).
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
    assertCollectionReadableOrDegrade,
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
        name: normalizeEmDashes(String(r.name)),
        description: normalizeEmDashes(String(r.description || '')),
        region: String(r.region || r.streek_name || ''),
        streekSlug: String(r.streek_slug || ''),
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
        relatedArticles: mapRelatedArticles(r.related_articles),
        cta: getCtaStructure(r),
    };
}

async function fetchWijnhuizenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,address,website,established,hectares,biodynamisch,winemaker,grapes,hero_image,status,meta_title,meta_description,streek_id.name,streek_id.slug';
    const withOg = `${baseFields},og_image`;
    // LAT-1098: reverse-relation via M2M articles.related_wijnhuizen.
    const withRelations = `${withOg},related_articles.articles_id.slug,related_articles.articles_id.title`;
    // LAT-1784/LAT-1795: cta_blocks als hoogste tier; degradeert zacht naar de
    // bestaande fallback als veld/permissie ontbreekt (CTA's renderen dan niets).
    const withCta = `${withRelations},cta_blocks`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/wijnhuizen?limit=-1&fields=${withCta}${filterSort}`, { headers, signal });
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
        console.warn(`[loadWijnhuizen] Directus rejected fields=…,related_articles,cta_blocks (HTTP ${res.status}) — retrying without LAT-1098/LAT-1784 fields.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutRelations: true });
        let retryRel: Response;
        try {
            retryRel = await fetch(`${url}/items/wijnhuizen?limit=-1&fields=${withOg}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-rel', url, error: msg });
            throw new Error(`[loadWijnhuizen] Directus retry without relations threw: ${msg}`);
        }
        if (retryRel.ok) {
            const json = await retryRel.json();
            assetDebug.push({ kind: 'query-retry-rel', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        if (retryRel.status !== 400 && retryRel.status !== 403) {
            const rbody = await retryRel.text().catch(() => '');
            assetDebug.push({ kind: 'query-retry-rel', url, status: retryRel.status, body: rbody.slice(0, 500) });
            throw new Error(`[loadWijnhuizen] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)}`);
        }
        console.warn(`[loadWijnhuizen] Directus also rejected fields=…,og_image (HTTP ${retryRel.status}) — retrying without og_image.`);
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
        // LAT-1011/LAT-1768: collection-level 403/404 → productie fail-loud,
        // alleen preview/dev degradeert naar lege lijst.
        if (retry.status === 403 || retry.status === 404) {
            assertCollectionReadableOrDegrade('loadWijnhuizen', 'wijnhuizen', retry.status, env, rbody.slice(0, 200));
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
            if (streek && streek.slug) r.streek_slug = streek.slug;
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

export async function loadWijnhuizen(): Promise<Wijnhuis[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadWijnhuizen', env);
    const items = await loadFromDirectus(env.url, env.token);
    await writeAssetDebug('directus');
    return items;
}
