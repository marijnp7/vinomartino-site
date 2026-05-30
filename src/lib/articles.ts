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
    let i = 0;
    const stripped: string[] = [];
    while (i < paragraphs.length) {
        const p = paragraphs[i];
        if (!p.trim()) { i++; continue; }
        if (isEditorialParagraph(p)) { stripped.push(p); i++; continue; }
        break;
    }
    if (stripped.length === 0) return stripLegacyMetaDescriptionLine(markdown);
    if (i < paragraphs.length && /^-{3,}\s*$/.test(paragraphs[i].trim())) i++;
    const body = paragraphs.slice(i).join('\n\n');
    const extracted = extractMetaDescriptionFromEditorial(stripped);
    return { body, extracted };
}

import { markdownToHtml as renderMarkdown } from './markdown';

function markdownToHtml(markdown: string): Promise<string> {
    return renderMarkdown(substituteAffiliateTokens(markdown), { stripFirstH1: true });
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
    filterLocalByStatus,
    assertLocalFallbackAllowed,
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

function mapArticle(a: Record<string, unknown>, heroImagePath: string | null, ogImagePath: string | null, bodyHtml: string): Article {
    return {
          slug: String(a.slug),
          title: String(a.title),
          description: String(a.description || ''),
          author: String(a.author || 'VinoMartino'),
          pubDate: String(a.pub_date || new Date().toISOString().slice(0, 10)),
          updatedAt: a.updated_at ? String(a.updated_at) : null,
          category: String(a.category || ''),
          tags: (a.tags as string[]) || [],
          heroImage: heroImagePath,
          ogImage: ogImagePath,
          status: String(a.status || 'draft'),
          metaTitle: String(a.meta_title || a.title),
          metaDescription: String(a.meta_description || a.description || ''),
          bodyHtml,
    };
}

/**
 * Load published articles from Directus.
 *
 * Directus is the canonical content source. Markdown files in src/content/posts/
 * are seed data only, NOT a runtime fallback (see src/content/posts/README.md).
 *
 * Throws on any failure so silent broken builds (build succeeds with 0 articles)
 * are impossible by design.
 */
async function fetchArticlesItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,title,description,body,pub_date,author,category,tags,hero_image,og_image,status,meta_title,meta_description';
    const withUpdatedAt = `${baseFields},updated_at`;
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
          res = await fetch(`${url}/items/articles?limit=-1&fields=${withUpdatedAt}${filterSort}`, { headers, signal });
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
    // naar baseFields zodat de build niet hard breekt op een SEO-meta-veld.
    if (res.status === 400 || res.status === 403) {
          const body = await res.text().catch(() => '');
          console.warn(`[loadArticles] Directus rejected fields=…,updated_at (HTTP ${res.status}) — retrying without updated_at. Run directus/scripts/add-seo-meta-fields.mjs en/of geef de build-rol read-permissie op articles.updated_at.`);
          const retry = await fetch(`${url}/items/articles?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
          if (retry.ok) {
                const json = await retry.json();
                return (json.data || []) as Record<string, unknown>[];
          }
          const rbody = await retry.text().catch(() => '');
          throw new Error(`[loadArticles] Directus retry without updated_at failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)} | original ${res.status} body: ${body.slice(0, 200)}`);
    }
    const body = await res.text().catch(() => '');
    throw new Error(`[loadArticles] Directus returned ${res.status} ${res.statusText} for /items/articles: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Article[]> {
    const data = await fetchArticlesItems(url, token);
    const items = await Promise.all(
          data.map(async (a) => {
                  const rawBody = String(a.body || '');
                  // LAT-1061 diagnostic: log hex-prefix + first-paragraph shape for the
                  // Champagne-Aube article zodat we de echte body-structuur kunnen zien.
                  if (a.slug === 'champagne-aube-grower-route') {
                      const head = rawBody.slice(0, 400);
                      const hex = Buffer.from(head, 'utf-8').slice(0, 60).toString('hex');
                      const firstPara = rawBody.split(/\n\s*\n/)[0] ?? '';
                      console.log(`[LAT-1061] aube body head hex=${hex}`);
                      console.log(`[LAT-1061] aube first-paragraph (${firstPara.length} chars):\n${firstPara}`);
                      console.log(`[LAT-1061] aube first-paragraph repr: ${JSON.stringify(firstPara.slice(0, 300))}`);
                  }
                  const { body: cleanBody, extracted } = stripMetaDescriptionFromBody(rawBody);
                  if (a.slug === 'champagne-aube-grower-route') {
                      console.log(`[LAT-1061] aube cleanBody starts with: ${JSON.stringify(cleanBody.slice(0, 200))}`);
                  }
                  if (extracted && !a.meta_description) {
                            a.meta_description = extracted;
                  }
                  if (!a.meta_description && !a.description && cleanBody) {
                            const firstPara = cleanBody.trim().split(/\n\n+/)[0].replace(/[#*`_~[\]()]/g, '').trim();
                            if (firstPara.length > 30) a.description = firstPara.slice(0, 160);
                  }
                  const bodyHtml = cleanBody ? await markdownToHtml(cleanBody) : '';
                  const [heroImagePath, ogImagePath] = await Promise.all([
                        a.hero_image ? downloadArticleAsset(String(a.hero_image), url, token) : Promise.resolve(null),
                        a.og_image ? downloadArticleAsset(String(a.og_image), url, token) : Promise.resolve(null),
                  ]);
                  return mapArticle(a, heroImagePath, ogImagePath, bodyHtml);
          }),
        );
    console.log(`[loadArticles] fetched ${items.length} articles from Directus`);
    return items;
}

async function loadFromLocalFiles(): Promise<Article[]> {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = 'src/content/posts';
    let files: string[];
    try {
          files = readdirSync(dir)
                .filter((f: string) => f.endsWith('.md') && f !== 'README.md')
                .map((f: string) => join(dir, f));
    } catch { return []; }
    if (files.length === 0) return [];
    const articles: Article[] = [];
    for (const filePath of files) {
          const raw = readFileSync(filePath, 'utf-8');
          const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
          if (!fmMatch) continue;
          const fm: Record<string, string> = {};
          for (const line of fmMatch[1].split('\n')) {
                const [key, ...rest] = line.split(':');
                if (key && rest.length) fm[key.trim()] = rest.join(':').trim().replace(/^["']|["']$/g, '');
          }
          const { body: cleanBody, extracted } = stripMetaDescriptionFromBody(fmMatch[2]);
          const bodyHtml = cleanBody ? await markdownToHtml(cleanBody) : '';
          articles.push({
                slug: fm.slug || filePath.replace(/.*\//, '').replace('.md', ''),
                title: fm.title || 'Untitled',
                description: extracted || fm.summary || fm.description || '',
                author: fm.author || 'VinoMartino',
                pubDate: fm.date || fm.pubDate || new Date().toISOString().slice(0, 10),
                updatedAt: fm.updatedAt || fm.updated_at || null,
                category: fm.category || '',
                tags: parseFrontmatterList(fm.tags),
                heroImage: fm.heroImage || fm.hero_image || null,
                ogImage: fm.ogImage || fm.og_image || null,
                status: fm.status || 'published',
                metaTitle: fm.metaTitle || fm.title || 'Untitled',
                metaDescription: extracted || fm.metaDescription || fm.description || '',
                bodyHtml,
          });
    }
    articles.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
    console.log(`[loadArticles] loaded ${articles.length} articles from local files`);
    return articles;
}

function filterLocalByPubDate(items: Article[]): Article[] {
    // LAT-1053: mirror de Directus pub_date<=$NOW gate voor lokale fallback. Vergelijking
    // op ISO-prefix (YYYY-MM-DD) houdt 't tijdzone-vrij; null/lege pubDate blijft zichtbaar.
    const todayIso = new Date().toISOString().slice(0, 10);
    return items.filter((i) => !i.pubDate || i.pubDate.slice(0, 10) <= todayIso);
}

export async function loadArticles(): Promise<Article[]> {
    const env = readDirectusEnv();
    if (env.configured) return loadFromDirectus(env.url, env.token);
    assertLocalFallbackAllowed('loadArticles', env);
    console.warn(`[loadArticles] Directus not configured — loading from local files (ALLOW_LOCAL_CONTENT_FALLBACK=1)`);
    return filterLocalByPubDate(filterLocalByStatus(await loadFromLocalFiles(), env));
}
