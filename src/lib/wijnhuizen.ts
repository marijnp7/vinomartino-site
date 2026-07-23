import type { RelatedRef } from './articles';
import { getCtaStructure, type CtaStructure } from './cta-blocks';

// VIS-BL-03 (LAT-2002): vaste rij van (max) 3 portretbeelden onder de intro.
export interface WijnhuisDrieluikBeeld {
    src: string;
    alt: string;
    caption?: string;
}

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
    // Rauw Directus file-UUID van de hero, zodat een verplichte beeldcredit
    // (image-credits.ts) het beeld kan volgen los van slug/pad (LAT-2478).
    heroImageId: string | null;
    ogImage: string | null;
    drieluik: WijnhuisDrieluikBeeld[];
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
    assetUrl,
    assertCollectionReadableOrDegrade,
    directusSignal,
    withAssetSlot,
    fetchDirectusCollection,
} from './directus-config';
import { DEFAULT_LOCALE, type Locale } from './i18n';
import { localizeRecords, localizeJoinedRefs } from './directus-i18n';

// LAT-2575 — vertaalbare wijnhuis-velden (native Directus translations, LAT-2574).
const WIJNHUIZEN_TRANSLATABLE = ['description', 'body', 'meta_title', 'meta_description', 'hero_alt'];

const assetDebug: Array<Record<string, unknown>> = [];

async function downloadAsset(assetId: string, directusUrl: string, token: string, prefix = ''): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'wijnhuizen');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/wijnhuizen/${fileName}`;
    try {
        const res = await withAssetSlot(() =>
            fetch(assetUrl(directusUrl, assetId), {
                headers: { Authorization: `Bearer ${token}` },
                signal: directusSignal(),
            }),
        );
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadWijnhuizen] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadWijnhuizen] grading-preset overgeslagen voor ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: outBuf.byteLength });
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
    drieluik: WijnhuisDrieluikBeeld[],
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
        heroImageId: r.hero_image ? String(r.hero_image) : null,
        ogImage: ogImagePath,
        drieluik,
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
    const baseFields = 'id,slug,name,description,body,address,website,established,hectares,biodynamisch,winemaker,grapes,hero_image,status,meta_title,meta_description,streek_id.id,streek_id.name,streek_id.slug';
    const withOg = `${baseFields},og_image`;
    // LAT-1098: reverse-relation via M2M articles.related_wijnhuizen.
    const withRelations = `${withOg},related_articles.articles_id.slug,related_articles.articles_id.title`;
    // LAT-1784/LAT-1795: cta_blocks als hoogste tier; degradeert zacht naar de
    // bestaande fallback als veld/permissie ontbreekt (CTA's renderen dan niets).
    const withCta = `${withRelations},cta_blocks`;
    // LAT-2002 (VIS-BL-03): drieluik-beelden als hoogste tier; degradeert zacht
    // naar withOg als de velden/permissie nog ontbreken (drieluik rendert dan niets).
    const withDrieluik = `${withCta},beeld_plek,beeld_mens,beeld_fles`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    let res: Response;
    try {
        res = await fetchDirectusCollection('loadWijnhuizen', `${url}/items/wijnhuizen?limit=-1&fields=${withDrieluik}${filterSort}`, { headers });
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
        console.warn(`[loadWijnhuizen] Directus rejected fields=…,related_articles,cta_blocks,beeld_* (HTTP ${res.status}) — retrying without LAT-1098/LAT-1784/LAT-2002 fields.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutRelations: true });
        let retryRel: Response;
        try {
            retryRel = await fetchDirectusCollection('loadWijnhuizen', `${url}/items/wijnhuizen?limit=-1&fields=${withOg}${filterSort}`, { headers });
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
            retry = await fetchDirectusCollection('loadWijnhuizen', `${url}/items/wijnhuizen?limit=-1&fields=${baseFields}${filterSort}`, { headers });
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

// VIS-BL-03: vaste drieluik-volgorde (1) plek (2) mens/handwerk (3) fles/glas.
// Alleen aanwezige beelden komen in de rij; ontbrekende plekken blijven leeg.
const DRIELUIK_SLOTS: Array<{ field: string; prefix: string; caption: string; altSuffix: string }> = [
    { field: 'beeld_plek', prefix: 'dl-plek-', caption: 'De plek', altSuffix: 'gebouw en wijngaard' },
    { field: 'beeld_mens', prefix: 'dl-mens-', caption: 'Het handwerk', altSuffix: 'handwerk in de kelder' },
    { field: 'beeld_fles', prefix: 'dl-fles-', caption: 'De fles', altSuffix: 'fles en glas op tafel' },
];

async function buildDrieluik(
    r: Record<string, unknown>,
    url: string,
    token: string,
    name: string,
): Promise<WijnhuisDrieluikBeeld[]> {
    const beelden = await Promise.all(
        DRIELUIK_SLOTS.map(async (slot): Promise<WijnhuisDrieluikBeeld | null> => {
            const assetId = r[slot.field];
            if (!assetId) return null;
            const src = await downloadAsset(String(assetId), url, token, slot.prefix);
            if (!src) return null;
            return { src, alt: `${name}: ${slot.altSuffix}`, caption: slot.caption };
        }),
    );
    return beelden.filter((b): b is WijnhuisDrieluikBeeld => b !== null);
}

async function loadFromDirectus(url: string, token: string, locale: Locale): Promise<Wijnhuis[]> {
    const raw = await fetchWijnhuizenItems(url, token);
    const data = await localizeRecords(raw, {
        env: readDirectusEnv(),
        junction: 'wijnhuizen_translations',
        parentIdField: 'wijnhuizen_id',
        fields: WIJNHUIZEN_TRANSLATABLE,
        locale,
    });
    // LAT-2697 — vertaal de gejoinde streeknaam mee (anders lekt de NL-streeknaam,
    // bv. "Toscane", in de EN wijnhuis-meta-title "…, Winery in Toscane" i.p.v.
    // "Tuscany"). De streek-M2O wordt niet door localizeRecords geraakt.
    await localizeJoinedRefs(
        data.map((r) => r.streek_id as Record<string, unknown> | null),
        {
            env: readDirectusEnv(),
            junction: 'streken_translations',
            parentIdField: 'streken_id',
            fields: ['name'],
            locale,
        },
    );
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
            const drieluik = await buildDrieluik(r, url, token, normalizeEmDashes(String(r.name)));
            return mapWijnhuis(r, heroImagePath, ogImagePath, bodyHtml, drieluik);
        }),
    );
    console.log(`[loadWijnhuizen] fetched ${items.length} wijnhuizen from Directus`);
    return items;
}

export async function loadWijnhuizen(locale: Locale = DEFAULT_LOCALE): Promise<Wijnhuis[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadWijnhuizen', env);
    const items = await loadFromDirectus(env.url, env.token, locale);
    await writeAssetDebug('directus');
    return items;
}

// LAT-2554: streek-pins (streken.wijnhuizen[].naam) zijn los ingetypt en wijken
// vaak af van de volledige recordnaam ("Jacques Selosse" vs "Jacques Selosse /
// Anselme Selosse", "F.X. Pichler" vs "Weingut F.X. Pichler", "Terroir al Limit"
// vs "Terroir al Límit"). Zonder tolerante match faalt de koppeling en rendert de
// streekpagina een halve 'ghost card' (titel, geen link/omschrijving) — schendt
// HARDE REGEL 3. Deze matcher is diacritiek- en producer-prefix-tolerant en wordt
// per streek toegepast (kleine set), dus substring-match is laag-risico.
const PRODUCER_PREFIXES = [
    'weingut', 'domaine', 'chateau', 'champagne', 'cantina', 'azienda agricola',
    'azienda', 'bodegas', 'bodega', 'quinta', 'tenuta', 'maison', 'celler', 'cave',
    'weinbau', 'weingof', 'weinhof',
];

function stripDiacritics(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normWijnhuisName(name: string): string {
    return stripDiacritics((name || '').toLowerCase()).replace(/\s+/g, ' ').trim();
}

function coreWijnhuisKey(name: string): string {
    // Alt-naam achter " / " of " (" wegknippen, daarna een leidend producer-woord.
    let s = normWijnhuisName(name).split(/\s+[/(]/)[0].trim();
    for (const p of PRODUCER_PREFIXES) {
        if (s.startsWith(p + ' ')) { s = s.slice(p.length + 1).trim(); break; }
    }
    return s;
}

/**
 * Zoekt het wijnhuis-record dat bij een streek-pin-naam hoort. Retourneert null
 * als er geen redelijke match is; de aanroeper mag dan géén kaart renderen
 * (LAT-2554: geen ghost card).
 */
export function matchWijnhuisByName(pinNaam: string, list: Wijnhuis[]): Wijnhuis | null {
    const pn = normWijnhuisName(pinNaam);
    if (!pn) return null;
    const exact = list.find((w) => normWijnhuisName(w.name) === pn);
    if (exact) return exact;
    const pk = coreWijnhuisKey(pinNaam);
    if (!pk) return null;
    const core = list.find((w) => coreWijnhuisKey(w.name) === pk);
    if (core) return core;
    // Laatste redmiddel binnen de streek-set: core van de een zit in de ander.
    return list.find((w) => {
        const wk = coreWijnhuisKey(w.name);
        return wk.length >= 3 && (wk.includes(pk) || pk.includes(wk));
    }) ?? null;
}
