import type { TocItem } from './markdown';

export interface RelatedRef {
    slug: string;
    name: string;
}

export type { TocItem };

export interface Article {
    slug: string;
    title: string;
    description: string;
    author: string;
    pubDate: string;
    updatedAt: string | null;
    category: string;
    tags: string[];
    heroImage: string | null;
    ogImage: string | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
    wordCount: number;
    readingMinutes: number;
    toc: TocItem[];
    relatedStreken: RelatedRef[];
    relatedWijnhuizen: RelatedRef[];
    relatedWijnroutes: RelatedRef[];
    relatedLanden: RelatedRef[];
}

const META_DESC_RE = /^\s*\*{0,2}Meta-description:?\*{0,2}\s*/i;

// LAT-1061: redactionele metadata-headers die Lead Editor soms in de Directus
// `body` plakt (bv. "**Byline:** ...", "**SEO Meta-title:** ...") horen NIET
// als prose op de site. Normaliseer op lowercase, strip optionele afmetingen
// tussen haakjes (bv. "Hero image (1600×900)" → "hero image").
const EDITORIAL_KEYS = new Set<string>([
    'byline', 'auteur', 'author',
    'slug',
    'pub-datum', 'pubdatum', 'pub date', 'publicatie', 'publicatiedatum', 'publish date',
    'pillar', 'rubriek', 'sectie', 'category', 'categorie',
    'woordtelling', 'word count', 'aantal woorden',
    'status',
    'titel', 'title',
    'seo meta-title', 'seo meta title', 'meta-title', 'meta title', 'meta-titel', 'meta titel',
    'seo meta-description', 'seo meta description', 'meta-description', 'meta description',
    'focus keyword', 'focus-keyword',
    'secundair keyword', 'secundaire keyword', 'secundair keywords', 'secundaire keywords',
    'keywords', 'keyword',
    'hero image', 'hero', 'header image', 'headerafbeelding',
    'og image', 'og-image', 'og / social image', 'og/social image', 'social image', 'og social image',
    'alt-tekst', 'alt tekst', 'alttekst', 'alt text', 'alt', 'alternative text',
    'fotocredit', 'foto-credit', 'foto credit', 'photo credit', 'image credit', 'credit', 'beeldcredit',
    'intern', 'internal', 'redactioneel', 'redactionele notitie', 'editorial',
]);

const KEY_LABEL_RE = /\*\*([^*\n]+?):\*\*/g;

function normalizeEditorialKey(raw: string): string {
    const norm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    if (EDITORIAL_KEYS.has(norm)) return norm;
    const base = norm.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return EDITORIAL_KEYS.has(base) ? base : norm;
}

function isEditorialParagraph(paragraph: string): boolean {
    const lines = paragraph.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    let editorialKeyFound = false;
    for (const line of lines) {
        if (!line.startsWith('**')) return false;
        const matches = [...line.matchAll(KEY_LABEL_RE)];
        if (matches.length === 0) return false;
        for (const m of matches) {
            const key = normalizeEditorialKey(m[1]);
            if (EDITORIAL_KEYS.has(key)) editorialKeyFound = true;
        }
    }
    return editorialKeyFound;
}

function extractMetaDescriptionFromEditorial(blocks: string[]): string {
    const re = /\*\*(?:SEO\s+)?Meta[\s-]?description:?\*\*\s*([^\n*]+?)(?=\s*\n|\s*\*\*[^*]+:\*\*|$)/i;
    for (const b of blocks) {
        const m = b.match(re);
        if (m && m[1]) return m[1].trim();
    }
    return '';
}

function stripLegacyMetaDescriptionLine(markdown: string): { body: string; extracted: string } {
    const lines = markdown.split('\n');
    const limit = Math.min(lines.length, 10);
    for (let i = 0; i < limit; i++) {
        if (META_DESC_RE.test(lines[i])) {
            const extracted = lines[i].replace(META_DESC_RE, '').trim();
            let endIdx = i + 1;
            while (endIdx < lines.length && lines[endIdx].trim() === '') endIdx++;
            const cleaned = [...lines.slice(0, i), ...lines.slice(endIdx)].join('\n');
            return { body: cleaned, extracted };
        }
    }
    return { body: markdown, extracted: '' };
}

function stripMetaDescriptionFromBody(markdown: string): { body: string; extracted: string } {
    const paragraphs = markdown.split(/\n\s*\n/);
    const kept: string[] = [];
    const stripped: string[] = [];
    let scanning = true;
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const trimmed = p.trim();
        if (!scanning) { kept.push(p); continue; }
        if (!trimmed) continue;
        if (isEditorialParagraph(p)) { stripped.push(p); continue; }
        // Skip past leading title/subtitle headings — they are real content but should
        // not stop us from finding the editorial block that often follows the title.
        if (/^#{1,6}\s/.test(trimmed)) { kept.push(p); continue; }
        // Thematic break (---) acts as separator: drop it only if it sits between
        // editorial blocks we just stripped; otherwise keep.
        if (/^-{3,}\s*$/.test(trimmed)) {
            if (stripped.length > 0) continue;
            kept.push(p);
            continue;
        }
        scanning = false;
        kept.push(p);
    }
    if (stripped.length === 0) return stripLegacyMetaDescriptionLine(markdown);
    const body = kept.join('\n\n');
    const extracted = extractMetaDescriptionFromEditorial(stripped);
    return { body, extracted };
}

import { markdownToHtmlWithToc, countWords, normalizeEmDashes } from './markdown';

function renderArticleBody(markdown: string): Promise<{ html: string; toc: TocItem[] }> {
    return markdownToHtmlWithToc(substituteAffiliateTokens(markdown), { stripFirstH1: true });
}

function substituteAffiliateTokens(markdown: string): string {
    const bookingAid = process.env['BOOKING_AID'] || '';
    const gygPartner = process.env['GETYOURGUIDE_PARTNER'] || '';

    let result = markdown;

    if (bookingAid) {
        result = result.replace(/BOOKING_PARTNER_ID/g, bookingAid);
    } else {
        // Degrade to plain anchor text when partner ID is not yet configured
        result = result.replace(
            /\[([^\]]+)\]\(https?:\/\/[^)]*BOOKING_PARTNER_ID[^)]*\)/g,
            '$1',
        );
    }

    if (gygPartner) {
        result = result.replace(/partner=VINOMARTINO/g, `partner=${gygPartner}`);
    } else {
        result = result.replace(
            /\[([^\]]+)\]\(https?:\/\/[^)]*partner=VINOMARTINO[^)]*\)/g,
            '$1',
        );
    }

    return result;
}

import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
} from './directus-config';

async function downloadArticleAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'articles');
    const outPath = join(outDir, `${assetId}.jpg`);
    if (existsSync(outPath)) return `/images/articles/${assetId}.jpg`;
    try {
        const res = await fetch(`${directusUrl}/assets/${assetId}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadArticles] could not fetch asset ${assetId}: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        return `/images/articles/${assetId}.jpg`;
    } catch (err) {
        console.warn(`[loadArticles] asset download failed for ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

// LAT-1098: Directus M2M-junction shape on `articles.related_<entity>` is
// `{[junction_id_or_index]: {<entity>_id: {slug, name|title}}}`. Reverse on the
// entity side uses `{articles_id: {slug, title}}`. We accept a few common shapes
// so a missing/renamed junction degrades to empty instead of throwing.
function mapRelatedRefs(val: unknown, slugKey: string, nameKey: string): RelatedRef[] {
    if (!Array.isArray(val)) return [];
    const out: RelatedRef[] = [];
    for (const row of val) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const inner = rec[slugKey] && typeof rec[slugKey] === 'object'
            ? rec[slugKey] as Record<string, unknown>
            : rec;
        const slug = inner.slug ? String(inner.slug) : '';
        const name = inner[nameKey] ? String(inner[nameKey]) : slug;
        if (!slug) continue;
        out.push({ slug, name: normalizeEmDashes(name) });
    }
    return out;
}

function mapArticle(
    a: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
    toc: TocItem[],
    wordCount: number,
    readingMinutes: number,
): Article {
    return {
          slug: String(a.slug),
          title: normalizeEmDashes(String(a.title)),
          description: normalizeEmDashes(String(a.description || '')),
          author: String(a.author || 'VinoMartino'),
          pubDate: String(a.pub_date || new Date().toISOString().slice(0, 10)),
          updatedAt: a.updated_at ? String(a.updated_at) : null,
          category: String(a.category || ''),
          tags: (a.tags as string[]) || [],
          heroImage: heroImagePath,
          ogImage: ogImagePath,
          status: String(a.status || 'draft'),
          metaTitle: normalizeEmDashes(String(a.meta_title || a.title)),
          metaDescription: normalizeEmDashes(String(a.meta_description || a.description || '')),
          bodyHtml,
          wordCount,
          readingMinutes,
          toc,
          relatedStreken: mapRelatedRefs(a.related_streken, 'streken_id', 'name'),
          relatedWijnhuizen: mapRelatedRefs(a.related_wijnhuizen, 'wijnhuizen_id', 'name'),
          relatedWijnroutes: mapRelatedRefs(a.related_routes, 'routes_id', 'title'),
          relatedLanden: mapRelatedRefs(a.related_landen, 'landen_id', 'name'),
    };
}

/**
 * Load published articles from Directus.
 *
 * Directus is the canonical content source. Legacy seed markdown lives in
 * src/content/_legacy/posts/ and is archive-only since LAT-1078 — no loader
 * reads it at runtime.
 *
 * Throws on any failure so silent broken builds (build succeeds with 0 articles)
 * are impossible by design.
 */
async function fetchArticlesItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,title,description,body,pub_date,author,category,tags,hero_image,og_image,status,meta_title,meta_description';
    const withUpdatedAt = `${baseFields},updated_at`;
    // LAT-1098: 4 forward relations toegevoegd aan articles. Junction-tabellen
    // volgen Directus-conventie `articles_<entity>` met FK `<entity>_id`.
    // Faalt graceful met 400/403 retry naar withUpdatedAt zolang LAT-1097
    // schema nog niet live is — site bouwt dan zonder cross-links.
    const withRelations = `${withUpdatedAt}` +
        ',related_streken.streken_id.slug,related_streken.streken_id.name' +
        ',related_wijnhuizen.wijnhuizen_id.slug,related_wijnhuizen.wijnhuizen_id.name' +
        ',related_routes.routes_id.slug,related_routes.routes_id.title' +
        ',related_landen.landen_id.slug,related_landen.landen_id.name';
    // LAT-1053: scheduled publish — verberg artikelen waarvan pub_date in de toekomst
    // ligt, ook als status=published. Directus's $NOW resolvet server-side; pub_date
    // null wordt eveneens getoond (legacy/onbekend) zodat bestaande artikelen niet
    // ineens verdwijnen. Drafts blijven excluded via statusFilterQuery.
    const futureGate = '&filter[_or][0][pub_date][_lte]=$NOW&filter[_or][1][pub_date][_null]=true';
    const filterSort = `${statusFilterQuery(env)}${futureGate}&sort=-pub_date`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);
    let res: Response;
    try {
          res = await fetch(`${url}/items/articles?limit=-1&fields=${withRelations}${filterSort}`, { headers, signal });
    } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`[loadArticles] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
          const json = await res.json();
          return (json.data || []) as Record<string, unknown>[];
    }
    // 400 = veld bestaat niet in Directus (pre-migratie); 403 = veld bestaat wel
    // maar de build-rol heeft geen read-permissie. Beide gevallen: degraderen
    // door relations te droppen, dan updated_at, zodat de build nooit hard breekt.
    if (res.status === 400 || res.status === 403) {
          const body = await res.text().catch(() => '');
          console.warn(`[loadArticles] Directus rejected fields=…,related_* (HTTP ${res.status}) — retrying without LAT-1098 relations. Run LAT-1097 (Directus M2M schema) en/of geef de build-rol read-permissie op related_*.`);
          const retryRel = await fetch(`${url}/items/articles?limit=-1&fields=${withUpdatedAt}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
          if (retryRel.ok) {
                const json = await retryRel.json();
                return (json.data || []) as Record<string, unknown>[];
          }
          if (retryRel.status === 400 || retryRel.status === 403) {
                const rbody1 = await retryRel.text().catch(() => '');
                console.warn(`[loadArticles] Directus rejected fields=…,updated_at (HTTP ${retryRel.status}) — retrying without updated_at. Run directus/scripts/add-seo-meta-fields.mjs en/of geef de build-rol read-permissie op articles.updated_at.`);
                const retry = await fetch(`${url}/items/articles?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
                if (retry.ok) {
                      const json = await retry.json();
                      return (json.data || []) as Record<string, unknown>[];
                }
                const rbody2 = await retry.text().catch(() => '');
                throw new Error(`[loadArticles] Directus retry without updated_at failed: ${retry.status} ${retry.statusText}: ${rbody2.slice(0, 300)} | retryRel ${retryRel.status} body: ${rbody1.slice(0, 200)} | original ${res.status} body: ${body.slice(0, 200)}`);
          }
          const rbody = await retryRel.text().catch(() => '');
          throw new Error(`[loadArticles] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)} | original ${res.status} body: ${body.slice(0, 200)}`);
    }
    const body = await res.text().catch(() => '');
    throw new Error(`[loadArticles] Directus returned ${res.status} ${res.statusText} for /items/articles: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Article[]> {
    const data = await fetchArticlesItems(url, token);
    const items = await Promise.all(
          data.map(async (a) => {
                  const rawBody = String(a.body || '');
                  const { body: cleanBody, extracted } = stripMetaDescriptionFromBody(rawBody);
                  if (extracted && !a.meta_description) {
                            a.meta_description = extracted;
                  }
                  if (!a.meta_description && !a.description && cleanBody) {
                            const firstPara = cleanBody.trim().split(/\n\n+/)[0].replace(/[#*`_~[\]()]/g, '').trim();
                            if (firstPara.length > 30) a.description = firstPara.slice(0, 160);
                  }
                  const wordCount = cleanBody ? countWords(cleanBody) : 0;
                  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
                  const { html: bodyHtml, toc } = cleanBody
                        ? await renderArticleBody(cleanBody)
                        : { html: '', toc: [] };
                  const [heroImagePath, ogImagePath] = await Promise.all([
                        a.hero_image ? downloadArticleAsset(String(a.hero_image), url, token) : Promise.resolve(null),
                        a.og_image ? downloadArticleAsset(String(a.og_image), url, token) : Promise.resolve(null),
                  ]);
                  return mapArticle(a, heroImagePath, ogImagePath, bodyHtml, toc, wordCount, readingMinutes);
          }),
        );
    console.log(`[loadArticles] fetched ${items.length} articles from Directus`);
    return items;
}

export async function loadArticles(): Promise<Article[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadArticles', env);
    return loadFromDirectus(env.url, env.token);
}
