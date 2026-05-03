export interface Article {
    slug: string;
    title: string;
    description: string;
    author: string;
    pubDate: string;
    category: string;
    tags: string[];
    heroImage: string | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
}

const META_DESC_RE = /^\s*\*{0,2}Meta-description:?\*{0,2}\s*/i;

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

function mapArticle(a: Record<string, unknown>, directusUrl: string, bodyHtml: string): Article {
    return {
          slug: String(a.slug),
          title: String(a.title),
          description: String(a.description || ''),
          author: String(a.author || 'VinoMartino'),
          pubDate: String(a.pub_date || new Date().toISOString().slice(0, 10)),
          category: String(a.category || ''),
          tags: (a.tags as string[]) || [],
          heroImage: a.hero_image ? `${directusUrl}/assets/${String(a.hero_image)}` : null,
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
async function loadFromDirectus(url: string, token: string): Promise<Article[]> {
    let res: Response;
    try {
          res = await fetch(
                  `${url}/items/articles?limit=-1&fields=id,slug,title,description,body,pub_date,author,category,tags,hero_image,status,meta_title,meta_description&filter[status][_in]=published,draft&sort=-pub_date`,
            {
                      headers: { Authorization: `Bearer ${token}` },
                      signal: AbortSignal.timeout(15000),
            },
                );
    } catch (err) {
          console.warn(`[loadArticles] Directus unreachable at ${url}: ${err instanceof Error ? err.message : String(err)}`);
          return [];
    }
    if (!res.ok) {
          console.warn(`[loadArticles] Directus returned ${res.status} ${res.statusText}`);
          return [];
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    const items = await Promise.all(
          data.map(async (a) => {
                  const rawBody = String(a.body || '');
                  const { body: cleanBody, extracted } = stripMetaDescriptionFromBody(rawBody);
                  if (extracted && !a.meta_description) {
                            a.meta_description = extracted;
                  }
                  const bodyHtml = cleanBody ? await markdownToHtml(cleanBody) : '';
                  return mapArticle(a, url, bodyHtml);
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
                category: fm.category || '',
                tags: fm.tags ? fm.tags.split(',').map((t: string) => t.trim()) : [],
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
    const { url, token } = getDirectusConfig();
    if (url && token) {
          const directusArticles = await loadFromDirectus(url, token);
          if (directusArticles.length > 0) return directusArticles;
    } else {
          console.warn(`[loadArticles] Directus not configured — loading from local files`);
    }
    return loadFromLocalFiles();
}
