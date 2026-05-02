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

// ── Local file fallback ────────────────────────────────────────────────────

function parseFrontmatterValue(raw: string): unknown {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return v;
}

function parseLocalFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    data[key] = parseFrontmatterValue(line.slice(colonIdx + 1));
  }
  return { data, body: match[2] };
}

async function loadLocalArticles(): Promise<Article[]> {
  try {
    const { default: fs } = await import('fs');
    const { default: path } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const postsDir = path.resolve(__dirname, '../content/posts');
    if (!fs.existsSync(postsDir)) return [];
    const files = fs.readdirSync(postsDir).filter((f: string) => f.endsWith('.md'));
    const articles: Article[] = [];
    for (const file of files) {
      const raw = fs.readFileSync(path.join(postsDir, file), 'utf-8');
      const { data, body } = parseLocalFrontmatter(raw);
      const slug = String(data['slug'] || file.replace(/\.md$/, ''));
      const { body: cleanBody } = stripMetaDescriptionFromBody(body);
      const bodyHtml = cleanBody ? await markdownToHtml(cleanBody) : '';
      const description = String(data['description'] || data['summary'] || '');
      articles.push({
        slug,
        title: String(data['title'] || ''),
        description,
        author: String(data['author'] || 'Martin'),
        pubDate: String(data['date'] || new Date().toISOString().slice(0, 10)),
        category: String(data['category'] || ''),
        tags: (data['tags'] as string[]) || [],
        heroImage: data['heroImage'] ? String(data['heroImage']) : null,
        status: 'published',
        metaTitle: String(data['metaTitle'] || data['title'] || ''),
        metaDescription: String(data['metaDescription'] || description),
        bodyHtml,
      });
    }
    articles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
    console.log(`[loadArticles] loaded ${articles.length} articles from local files`);
    return articles;
  } catch (err) {
    console.warn(`[loadArticles] local fallback failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
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

async function markdownToHtml(markdown: string): Promise<string> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const mdast = fromMarkdown(markdown);
  const hast = toHast(mdast);
  return toHtml(hast as Parameters<typeof toHtml>[0]);
}

function getDirectusConfig() {
  // process.env is reliable in getStaticPaths (SSG build-time Node.js context)
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

export async function loadArticles(): Promise<Article[]> {
  const { url, token } = getDirectusConfig();
  if (!url || !token) {
    console.warn(`[loadArticles] Directus not configured — loading from local files`);
    return loadLocalArticles();
  }
  try {
    const res = await fetch(
      `${url}/items/articles?limit=-1&fields=id,slug,title,description,body,pub_date,author,category,tags,hero_image,status,meta_title,meta_description&filter[status][_in]=published,draft&sort=-pub_date`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      console.warn(`[loadArticles] Directus responded ${res.status} ${res.statusText}`);
      return [];
    }
    const json = await res.json();
    const items = await Promise.all(
      (json.data || []).map(async (a: Record<string, unknown>) => {
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
  } catch (err) {
    console.warn(`[loadArticles] fetch failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
