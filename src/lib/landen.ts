import { normalizeEmDashes } from './markdown';
import type { RelatedRef } from './articles';
import { getCtaStructure, type CtaStructure } from './cta-blocks';
import type { FaqItem } from './seo';

export interface LandDruif {
    name: string;
    color: 'rood' | 'wit' | 'rosé';
    description: string;
    wines?: string[];
}

export interface LandPractical {
    key: string;
    value: string;
}

// LAT-1871: pillar-hub reistijd-tabel per regio (Directus `reistijd_tabel` JSON).
export interface LandReistijd {
    regio: string;
    vliegveld: string;
    reistijd: string;
    besteReistijd: string;
}

// LAT-1871: pillar-hub budgetblok (Directus `budget_tabel` JSON). EUR-ranges
// (valuta-regel LAT-1663): editors leveren reeds genormaliseerde euro-strings.
export interface LandBudget {
    categorie: string;
    bedrag: string;
    toelichting: string;
}

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
    // LAT-1760: proefprofiel ("Wat je hier proeft") + praktische tips ("Voor je
    // gaat") als Directus JSON-velden, zodat alle 7 landen Italië-parity halen
    // zonder per-land hardcoded showcase. Leeg → template valt terug op showcase.
    druiven: LandDruif[];
    practical: LandPractical[];
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
    relatedArticles: RelatedRef[];
    // LAT-1784/LAT-1795 — gestandaardiseerde 3-CTA-structuur (Directus `cta_blocks`).
    cta: CtaStructure;
    // LAT-1823: optionele FAQ (Directus `faq` JSON-veld). Voedt FAQPage JSON-LD op
    // pillar-hubs. Leeg tot DevOps het veld migreert en de redactie het vult; de
    // loader degradeert dan zacht (zie fetchLandenItems-fallback) en de schema
    // blijft weg zolang er geen zichtbare Q&A op de pagina staat.
    faq: FaqItem[];
    // LAT-1871: pillar-hub render-laag. `hubH1` overschrijft de generieke
    // land-H1 op een pillar-hub (bv. "Wijnreis in Italië: regio's, routes en
    // gidsen"); leeg → hero valt terug op de landnaam. reistijd/budget zijn
    // optionele tabellen die alleen renderen als de redactie ze vult, zodat
    // niet-hub landpagina's geen lege banden krijgen.
    hubH1: string;
    reistijd: LandReistijd[];
    budget: LandBudget[];
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
    assertDirectusConfigured,
    assetUrl,
    assertCollectionReadableOrDegrade,
} from './directus-config';

const assetDebug: Array<Record<string, unknown>> = [];

async function writeAssetDebug(pathTaken: string): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'public');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'build-debug-landen.json'),
        JSON.stringify({ asOf: new Date().toISOString(), pathTaken, cwd: process.cwd(), entries: assetDebug }, null, 2),
    );
}

async function downloadAsset(assetId: string, directusUrl: string, token: string, prefix = ''): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'landen');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/landen/${fileName}`;
    try {
        const res = await fetch(assetUrl(directusUrl, assetId), {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadLanden] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadLanden] grading-preset overgeslagen voor ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: outBuf.byteLength });
        return `/images/landen/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadLanden] asset download failed for ${assetId}: ${msg}`);
        assetDebug.push({ assetId, prefix, error: msg });
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

function parseObjectArray(val: unknown): Record<string, unknown>[] {
    let arr: unknown = val;
    if (typeof val === 'string') {
        try { arr = JSON.parse(val); } catch { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object');
}

function mapDruiven(val: unknown): LandDruif[] {
    return parseObjectArray(val)
        .map((r) => {
            const rawColor = String(r.color || 'rood').toLowerCase();
            const color: LandDruif['color'] = rawColor === 'wit' || rawColor === 'rosé' ? rawColor : 'rood';
            const wines = Array.isArray(r.wines)
                ? r.wines.map(String).filter((w) => w.trim().length > 0)
                : undefined;
            return {
                name: normalizeEmDashes(String(r.name || '')),
                color,
                description: normalizeEmDashes(String(r.description || '')),
                wines: wines && wines.length > 0 ? wines : undefined,
            };
        })
        .filter((d) => d.name.length > 0);
}

function mapPractical(val: unknown): LandPractical[] {
    return parseObjectArray(val)
        .map((r) => ({
            key: normalizeEmDashes(String(r.key || '')),
            value: normalizeEmDashes(String(r.value || '')),
        }))
        .filter((p) => p.key.length > 0 && p.value.length > 0);
}

function parseFaq(val: unknown): FaqItem[] {
    return parseObjectArray(val)
        .map((rec) => {
            const question = rec.question ?? rec.q ?? rec.vraag;
            const answer = rec.answer ?? rec.a ?? rec.antwoord;
            if (!question || !answer) return null;
            return {
                question: normalizeEmDashes(String(question)),
                answer: normalizeEmDashes(String(answer)),
            };
        })
        .filter((f): f is FaqItem => f !== null);
}

function mapReistijd(val: unknown): LandReistijd[] {
    return parseObjectArray(val)
        .map((r) => ({
            regio: normalizeEmDashes(String(r.regio || r.region || '')),
            vliegveld: normalizeEmDashes(String(r.vliegveld || r.airport || '')),
            reistijd: normalizeEmDashes(String(r.reistijd || r.duur || '')),
            besteReistijd: normalizeEmDashes(String(r.beste_reistijd || r.beste_tijd || r.seizoen || '')),
        }))
        .filter((row) => row.regio.length > 0);
}

function mapBudget(val: unknown): LandBudget[] {
    return parseObjectArray(val)
        .map((r) => ({
            categorie: normalizeEmDashes(String(r.categorie || r.category || r.post || '')),
            bedrag: normalizeEmDashes(String(r.bedrag || r.range || r.prijs || '')),
            toelichting: normalizeEmDashes(String(r.toelichting || r.note || '')),
        }))
        .filter((row) => row.categorie.length > 0 && row.bedrag.length > 0);
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

function mapLand(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
): Land {
    return {
        slug: String(r.slug),
        name: normalizeEmDashes(String(r.name)),
        description: normalizeEmDashes(String(r.description || '')),
        continent: String(r.continent || ''),
        capital: String(r.capital || ''),
        climate: String(r.climate || ''),
        mainGrapes: parseJsonField(r.main_grapes),
        wineHistory: String(r.wine_history || ''),
        bestTimeToVisit: String(r.best_time_to_visit || ''),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        wijnstreken: mapWijnstreken(r.wijnstreken),
        druiven: mapDruiven(r.druiven),
        practical: mapPractical(r.practical),
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
        relatedArticles: mapRelatedArticles(r.related_articles),
        cta: getCtaStructure(r),
        faq: parseFaq(r.faq),
        hubH1: normalizeEmDashes(String(r.hub_h1 || '')),
        reistijd: mapReistijd(r.reistijd_tabel),
        budget: mapBudget(r.budget_tabel),
    };
}

async function fetchLandenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,continent,capital,climate,main_grapes,wine_history,best_time_to_visit,hero_image,status,meta_title,meta_description';
    const withSeoMeta = `${baseFields},og_image,wijnstreken.name,wijnstreken.slug`;
    // LAT-1098: reverse-relation via M2M articles.related_landen.
    const withRelations = `${withSeoMeta},related_articles.articles_id.slug,related_articles.articles_id.title`;
    // LAT-1760: proefprofiel + praktische tips. Richste tier; valt bij 400 (veld
    // bestaat nog niet) zacht terug op withRelations, zodat de build NIET breekt
    // zolang DevOps de Directus-velden landen.druiven/landen.practical nog moet
    // toevoegen. Deze tier mag NOOIT in baseFields — dat is het last-resort tier
    // waarvan een 400 de hele /landen/* build op [] zet.
    const withTasting = `${withRelations},druiven,practical`;
    // LAT-1784/LAT-1795: cta_blocks als hoogste tier; degradeert zacht naar
    // withTasting (de bestaande fallback) als veld/permissie ontbreekt.
    const withCta = `${withTasting},cta_blocks`;
    // LAT-1823: pillar-hub FAQ (Directus `faq` JSON) als nieuwe top-tier. Bij 400
    // (veld nog niet gemigreerd) of 403 vallen we terug op withCta, zodat cta_blocks
    // én de rest van de keten intact blijven — faq mag nooit andere velden meeslepen.
    const withFaq = `${withCta},faq`;
    // LAT-1871: pillar-hub render-velden (hub_h1 + reistijd/budget JSON) als top-tier.
    // Bij 400/403 valt de retry hieronder terug op withCta, die zowel faq als deze
    // hub-velden weglaat — ze mogen nooit druiven/practical/cta_blocks meeslepen.
    const withHub = `${withFaq},hub_h1,reistijd_tabel,budget_tabel`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
        res = await fetch(`${url}/items/landen?limit=-1&fields=${withHub}${filterSort}`, { headers, signal });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[loadLanden] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        return (json.data || []) as Record<string, unknown>[];
    }
    // LAT-1823/LAT-1871: drop the faq + hub render-fields, keep the full
    // LAT-1760/LAT-1784 tier (withCta) so not-yet-migrated optional fields never
    // sleep druiven/practical/cta_blocks. If withCta itself is rejected, fall
    // through to the existing tier-fallback (withTasting → relations → SeoMeta → baseFields).
    if (res.status === 400 || res.status === 403) {
        const faqRetry = await fetch(`${url}/items/landen?limit=-1&fields=${withCta}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        if (faqRetry.ok) {
            const json = await faqRetry.json();
            return (json.data || []) as Record<string, unknown>[];
        }
        res = faqRetry;
    }
    // 400 = veld bestaat niet in Directus (pre-migratie); 403 = veld bestaat wel
    // maar de build-rol heeft geen read-permissie. Tier-fallback: tasting →
    // relations → SeoMeta → baseFields.
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadLanden] Directus rejected fields=…,druiven,practical,cta_blocks (HTTP ${res.status}) — retrying without LAT-1760/LAT-1784 fields. Run directus/scripts/add-landen-tasting-fields en/of maak landen.cta_blocks aan.`);
        const retryTasting = await fetch(`${url}/items/landen?limit=-1&fields=${withTasting}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        if (retryTasting.ok) {
            const json = await retryTasting.json();
            return (json.data || []) as Record<string, unknown>[];
        }
        if (retryTasting.status !== 400 && retryTasting.status !== 403) {
            const rbody = await retryTasting.text().catch(() => '');
            throw new Error(`[loadLanden] Directus retry without LAT-1760 fields failed: ${retryTasting.status} ${retryTasting.statusText}: ${rbody.slice(0, 300)} | original ${res.status} body: ${body.slice(0, 200)}`);
        }
        console.warn(`[loadLanden] Directus also rejected fields=…,related_articles (HTTP ${retryTasting.status}) — retrying without LAT-1098 relations.`);
        const retryRel = await fetch(`${url}/items/landen?limit=-1&fields=${withSeoMeta}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        if (retryRel.ok) {
            const json = await retryRel.json();
            return (json.data || []) as Record<string, unknown>[];
        }
        if (retryRel.status !== 400 && retryRel.status !== 403) {
            const rbody = await retryRel.text().catch(() => '');
            throw new Error(`[loadLanden] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)} | original ${res.status} body: ${body.slice(0, 200)}`);
        }
        console.warn(`[loadLanden] Directus also rejected fields=…,og_image,wijnstreken.* (HTTP ${retryRel.status}) — retrying without LAT-1008 fields. Run directus/scripts/add-seo-meta-fields.mjs en/of geef de build-rol read-permissie op landen.og_image en landen.wijnstreken.`);
        const retry = await fetch(`${url}/items/landen?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        if (retry.ok) {
            const json = await retry.json();
            return (json.data || []) as Record<string, unknown>[];
        }
        const rbody = await retry.text().catch(() => '');
        // LAT-1011/LAT-1768: build-rol heeft geen collection-level read op
        // /landen. In productie fail-loud (throw, blokkeert deploy); alleen
        // preview/dev degradeert naar lege lijst zodat de rest bouwt.
        if (retry.status === 403 || retry.status === 404) {
            assertCollectionReadableOrDegrade('loadLanden', 'landen', retry.status, env, rbody.slice(0, 200));
            return [];
        }
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
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            return mapLand(r, heroImagePath, ogImagePath, bodyHtml);
        }),
    );
    console.log(`[loadLanden] fetched ${items.length} landen from Directus`);
    await writeAssetDebug('directus');
    return items;
}

export async function loadLanden(): Promise<Land[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadLanden', env);
    return loadFromDirectus(env.url, env.token);
}

export interface NavLand {
    slug: string;
    name: string;
    continent: string;
}

/**
 * Lightweight landen-loader voor de "Ontdek" nav-dropdown (LAT-1604). Haalt
 * alleen slug/name/continent op — geen body-render, geen asset-download — zodat
 * de globale header op elke pagina goedkoop blijft. Volgt het fail-loud-contract
 * (LAT-1078): zonder Directus-config gooit dit, net als loadLanden().
 */
export async function loadLandenNav(): Promise<NavLand[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadLandenNav', env);
    const fields = 'slug,name,continent,status';
    const url = `${env.url}/items/landen?limit=-1&fields=${fields}${statusFilterQuery(env)}&sort=name`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${env.token}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[loadLandenNav] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    return data
        .filter((r) => r.slug && r.name)
        .map((r) => ({
            slug: String(r.slug),
            name: normalizeEmDashes(String(r.name)),
            continent: String(r.continent || ''),
        }));
}
