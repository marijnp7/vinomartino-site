import type { RelatedRef } from './articles';

// LAT-1127 — curated accommodation tiers (Marijn-spec 2026-06-07). Stored as
// cast-json on streken (LAT-1136 import). The site renders its own map + cards
// from this data; Stay22 only supplies the per-address boeklink.
export type StayTier = 'slim_geboekt' | 'prijs_kwaliteit' | 'pure_luxe';

export interface Accommodation {
    naam: string;
    tier: StayTier;
    whyThisOne: string;
    prijsLaag: number | null;
    prijsHoog: number | null;
    /** ISO/symbol currency for the prices (bv. 'ZAR'). Leeg = euro. */
    valuta: string;
    lat: number | null;
    lng: number | null;
    /** Stay22 Allez deeplink (affiliate). */
    boeklink: string;
    adres: string;
    rating: string;
    /**
     * LAT-1536: Directus file-UUID van de per-verblijf foto (`hero_image` in de
     * accommodaties-JSON). Dit is de geïmporteerde Directus-asset-UUID, NIET de
     * rauwe DAM-ref. DevOps: importeer DAM-ref → nieuwe Directus-UUID → zet die
     * hier. Leeg = geen foto (kaart rendert dan zonder afbeelding, zoals nu).
     */
    fotoRef: string | null;
    /** Op buildtijd gedownloade self-hosted foto-URL (`/images/accommodaties/<uuid>.jpg`). */
    foto: string | null;
}

export interface WijnhuisPin {
    naam: string;
    lat: number | null;
    lng: number | null;
}

// LAT-1592 — Eten/Activiteiten leven in de pilot als genummerde POI-blokken op
// de streek-pagina (geen eigen detailroutes, plan 4a). Tolerant JSON op streken,
// optioneel; ontbreekt het veld of is het leeg dan rendert het blok niet
// ("coming soon" is verboden). De affiliate-boeklink (bv. GetYourGuide voor
// activiteiten) wordt alleen getoond als die bestaat.
export interface StreekPoi {
    naam: string;
    beschrijving: string;
    prijs: string;
    lat: number | null;
    lng: number | null;
    /** Externe affiliate-link (bv. GetYourGuide). Leeg = geen CTA. */
    boeklink: string;
}

export interface Streek {
    slug: string;
    name: string;
    description: string;
    country: string;
    landSlug: string;
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
    relatedArticles: RelatedRef[];
    accommodaties: Accommodation[];
    wijnhuizen: WijnhuisPin[];
    eten: StreekPoi[];
    activiteiten: StreekPoi[];
}

// LAT-1098: reverse M2M `streken.related_articles` → `articles_id.{slug,title}`.
// Same shape-tolerant mapping as articles.mapRelatedRefs (duplicated to avoid
// import cycle on the shared mapper).
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

// LAT-1536: per-verblijf foto's voor de CuratedStayMap-kaarten. Schrijft naar
// dezelfde self-hosted map als de accommodaties-loader (LAT-1372), zodat een
// gedeelde Directus-UUID maar één keer wordt gedownload en de bron identiek is.
async function downloadAccommodatieAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'accommodaties');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/accommodaties/${fileName}`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadStreken] kon accommodatie-foto ${assetId} niet ophalen: ${res.status}`);
            assetDebug.push({ kind: 'accommodatie-foto', assetId, status: res.status });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        assetDebug.push({ kind: 'accommodatie-foto', assetId, status: 200, bytes: buf.byteLength });
        return `/images/accommodaties/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadStreken] accommodatie-foto download faalde voor ${assetId}: ${msg}`);
        assetDebug.push({ kind: 'accommodatie-foto', assetId, error: msg });
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

// LAT-1127 — JSON array field that may arrive as an array (cast-json) or a
// stringified array, depending on how Directus serialises the column.
function parseJsonObjects(val: unknown): Record<string, unknown>[] {
    let arr: unknown = val;
    if (typeof val === 'string') {
        try { arr = JSON.parse(val); } catch { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
}

function firstString(rec: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'string' && v.trim()) return normalizeEmDashes(v.trim());
        if (typeof v === 'number') return String(v);
    }
    return '';
}

function firstNumber(rec: Record<string, unknown>, keys: string[]): number | null {
    for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            const n = Number(v.replace(/[^0-9.\-]/g, ''));
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

const TIER_VALUES: StayTier[] = ['slim_geboekt', 'prijs_kwaliteit', 'pure_luxe'];

function normalizeTier(raw: string): StayTier {
    const v = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if ((TIER_VALUES as string[]).includes(v)) return v as StayTier;
    if (v.includes('luxe') || v.includes('luxury')) return 'pure_luxe';
    if (v.includes('kwaliteit') || v.includes('sweet') || v.includes('value')) return 'prijs_kwaliteit';
    return 'slim_geboekt';
}

// Tolerant mapper: field names follow the LAT-1133 signed-off dataset but accept
// reasonable aliases so a naming drift in Directus does not silently drop data.
function parseAccommodaties(val: unknown): Accommodation[] {
    return parseJsonObjects(val).map((r) => {
        const naam = firstString(r, ['naam', 'name', 'title']);
        const boeklink = firstString(r, ['boeklink', 'boeklink_stay22', 'stay22_link', 'allez_link', 'link']);
        return {
            naam,
            tier: normalizeTier(firstString(r, ['tier', 'categorie', 'category'])),
            whyThisOne: firstString(r, ['why_this_one', 'whyThisOne', 'blurb', 'why', 'beschrijving']),
            prijsLaag: firstNumber(r, ['prijs_laag', 'prijsLaag', 'price_low', 'prijs_van']),
            prijsHoog: firstNumber(r, ['prijs_hoog', 'prijsHoog', 'price_high', 'prijs_tot']),
            valuta: firstString(r, ['prijs_valuta', 'valuta', 'currency']),
            lat: firstNumber(r, ['lat', 'latitude']),
            lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
            boeklink,
            adres: firstString(r, ['adres', 'address']),
            rating: firstString(r, ['rating', 'score']),
            // LAT-1536: foto-ref draagveld in de accommodaties-JSON. `hero_image`
            // is het canonieke veld (gelijk aan de accommodaties-collectie); de
            // overige zijn tolerante aliassen zodat een naming-drift de foto niet
            // stilletjes laat vallen.
            fotoRef: firstString(r, ['hero_image', 'fotoRef', 'foto_ref', 'foto', 'image', 'hero_image_uuid']) || null,
            foto: null,
        };
    }).filter((a) => a.naam);
}

function parseWijnhuizen(val: unknown): WijnhuisPin[] {
    return parseJsonObjects(val).map((r) => ({
        naam: firstString(r, ['naam', 'name', 'title']),
        lat: firstNumber(r, ['lat', 'latitude']),
        lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
    })).filter((w) => w.naam);
}

// LAT-1592 — tolerante mapper voor eten/activiteiten POI-blokken. Prijs is een
// vrije tekst-label ('vanaf €45', '€€') zodat we geen muntconversie hoeven te
// doen; boeklink is optioneel (alleen renderen als die bestaat).
function parseStreekPois(val: unknown): StreekPoi[] {
    return parseJsonObjects(val).map((r) => ({
        naam: firstString(r, ['naam', 'name', 'title']),
        beschrijving: firstString(r, ['beschrijving', 'description', 'why_this_one', 'whyThisOne', 'blurb', 'why']),
        prijs: firstString(r, ['prijs', 'price', 'prijs_label', 'price_label', 'prijsindicatie']),
        lat: firstNumber(r, ['lat', 'latitude']),
        lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
        boeklink: firstString(r, ['boeklink', 'link', 'url', 'affiliate_link', 'getyourguide', 'gyg_link']),
    })).filter((p) => p.naam);
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
        landSlug: String(r.land_slug || ''),
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
        accommodaties: parseAccommodaties(r.accommodaties),
        wijnhuizen: parseWijnhuizen(r.wijnhuizen),
        eten: parseStreekPois(r.eten),
        activiteiten: parseStreekPois(r.activiteiten),
        relatedArticles: mapRelatedArticles(r.related_articles),
    };
}

async function fetchStrekenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,climate,soil,main_grapes,sub_regions,vineyard_area,altitude,appellations,accommodaties,wijnhuizen,hero_image,status,meta_title,meta_description,land_id.name,land_id.slug';
    const withOg = `${baseFields},og_image`;
    // LAT-1098: reverse-relation auto-aangemaakt door Directus M2M op articles
    // (LAT-1097). Junction `articles_streken` → `articles_id.{slug,title}`.
    const withRelations = `${withOg},related_articles.articles_id.slug,related_articles.articles_id.title`;
    // LAT-1592: eten/activiteiten zijn nieuwe streek-velden. Bestaat het veld nog
    // niet (of mist de build-rol read-permissie) dan degradeert deze top-tier naar
    // `withRelations`, zodat related_articles (LAT-1098) NIET sneuvelt op het
    // moment dat alleen de POI-velden ontbreken.
    const withPoi = `${withRelations},eten,activiteiten`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/streken?limit=-1&fields=${withPoi}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query', url, error: msg });
        throw new Error(`[loadStreken] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length, tier: 'withPoi' });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400 || res.status === 403) {
        const poiBody = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,eten,activiteiten (HTTP ${res.status}) — retrying without LAT-1592 POI-velden. Maak streken.eten/streken.activiteiten aan en/of geef de build-rol read-permissie.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: poiBody.slice(0, 300), retryWithoutPoi: true });
        try {
            res = await fetch(`${url}/items/streken?limit=-1&fields=${withRelations}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-poi', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without POI fields threw: ${msg}`);
        }
        if (res.ok) {
            const json = await res.json();
            assetDebug.push({ kind: 'query-retry-poi', url, status: 200, count: (json.data || []).length, tier: 'withRelations' });
            return (json.data || []) as Record<string, unknown>[];
        }
    }
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,related_articles (HTTP ${res.status}) — retrying without LAT-1098 relations. Run LAT-1097 (Directus M2M schema) en/of geef de build-rol read-permissie op streken.related_articles.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutRelations: true });
        let retryRel: Response;
        try {
            retryRel = await fetch(`${url}/items/streken?limit=-1&fields=${withOg}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-rel', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without relations threw: ${msg}`);
        }
        if (retryRel.ok) {
            const json = await retryRel.json();
            assetDebug.push({ kind: 'query-retry-rel', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        // Relations missing AND og_image still failing → drop to baseFields.
        if (retryRel.status !== 400 && retryRel.status !== 403) {
            const rbody = await retryRel.text().catch(() => '');
            assetDebug.push({ kind: 'query-retry-rel', url, status: retryRel.status, body: rbody.slice(0, 500) });
            throw new Error(`[loadStreken] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)}`);
        }
        console.warn(`[loadStreken] Directus also rejected fields=…,og_image (HTTP ${retryRel.status}) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs en/of geef de build-rol read-permissie op streken.og_image.`);
        assetDebug.push({ kind: 'query-retry-og', url, status: retryRel.status });
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
            if (land && land.slug) r.land_slug = land.slug;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            const streek = mapStreek(r, heroImagePath, ogImagePath, bodyHtml);
            // LAT-1536: download per-verblijf foto's en hang de self-hosted URL
            // aan elke accommodatie. fotoRef leeg → foto blijft null (kaart toont
            // dan geen afbeelding; bestaande streken breken niet).
            await Promise.all(
                streek.accommodaties.map(async (acc) => {
                    if (!acc.fotoRef) return;
                    acc.foto = await downloadAccommodatieAsset(acc.fotoRef, url, token);
                }),
            );
            return streek;
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

export interface NavStreek {
    slug: string;
    name: string;
    landSlug: string;
}

/**
 * Lightweight streken-loader voor de "Ontdek" nav-dropdown (LAT-1604). Haalt
 * alleen slug/name/land_slug op — geen body-render, geen asset-download — zodat
 * de globale header op elke pagina goedkoop blijft. Volgt het fail-loud-contract
 * (LAT-1078): zonder Directus-config gooit dit, net als loadStreken().
 */
export async function loadStrekenNav(): Promise<NavStreek[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadStrekenNav', env);
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${env.token}` };
    let res = await fetch(`${env.url}/items/streken?limit=-1&fields=slug,name,land_id.slug${filterSort}`, {
        headers,
        signal: AbortSignal.timeout(15000),
    });
    // land_id-veld/permissie ontbreekt (pre-migratie) → degradeer naar slug/name
    // zonder land-koppeling; de header valt dan terug op landen-only.
    if (res.status === 400 || res.status === 403) {
        console.warn(`[loadStrekenNav] Directus rejected land_id.slug (HTTP ${res.status}) — retry zonder land-koppeling.`);
        res = await fetch(`${env.url}/items/streken?limit=-1&fields=slug,name${filterSort}`, {
            headers,
            signal: AbortSignal.timeout(15000),
        });
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[loadStrekenNav] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    return data
        .filter((r) => r.slug && r.name)
        .map((r) => {
            const land = r.land_id as Record<string, unknown> | null;
            return {
                slug: String(r.slug),
                name: normalizeEmDashes(String(r.name)),
                landSlug: land && land.slug ? String(land.slug) : '',
            };
        });
}
