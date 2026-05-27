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
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
}

const META_DESC_RE = /^\s*\*{0,2}Meta-description:?\*{0,2}\s*/i;

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

function stripMetaDescriptionFromBody(markdown: string): { body: string; extracted: string } {
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

async function downloadHeroImage(assetId: string, directusUrl: string, token: string): Promise<string | null> {
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

function mapArticle(a: Record<string, unknown>, heroImagePath: string | null, bodyHtml: string): Article {
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
    const baseFields = 'id,slug,title,description,body,pub_date,author,category,tags,hero_image,status,meta_title,meta_description';
    const withUpdatedAt = `${baseFields},updated_at`;
    const filterSort = `${statusFilterQuery(env)}&sort=-pub_date`;
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
    if (res.status === 400) {
          const body = await res.text().catch(() => '');
          console.warn(`[loadArticles] Directus rejected fields=…,updated_at (HTTP 400) — retrying without updated_at. Run directus/scripts/add-seo-meta-fields.mjs to re-enable.`);
          const retry = await fetch(`${url}/items/articles?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
          if (retry.ok) {
                const json = await retry.json();
                return (json.data || []) as Record<string, unknown>[];
          }
          const rbody = await retry.text().catch(() => '');
          throw new Error(`[loadArticles] Directus retry without updated_at failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)} | original 400 body: ${body.slice(0, 200)}`);
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
                  const bodyHtml = cleanBody ? await markdownToHtml(cleanBody) : '';
                  const heroImagePath = a.hero_image
                        ? await downloadHeroImage(String(a.hero_image), url, token)
                        : null;
                  return mapArticle(a, heroImagePath, bodyHtml);
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

export async function loadArticles(): Promise<Article[]> {
    const env = readDirectusEnv();
    if (env.configured) return loadFromDirectus(env.url, env.token);
    assertLocalFallbackAllowed('loadArticles', env);
    console.warn(`[loadArticles] Directus not configured — loading from local files (ALLOW_LOCAL_CONTENT_FALLBACK=1)`);
    return filterLocalByStatus(await loadFromLocalFiles(), env);
}
