import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string(),
    summary: z.string(),
  }),
});

const DIRECTUS_URL = import.meta.env.DIRECTUS_URL;
const DIRECTUS_TOKEN = import.meta.env.DIRECTUS_TOKEN;

const articles = defineCollection({
  loader: async () => {
    if (!DIRECTUS_URL || !DIRECTUS_TOKEN) return [];
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/articles?limit=-1&fields=id,slug,title,description,body,pub_date,author,category,tags,hero_image,status,meta_title,meta_description&filter[status][_in]=published,draft&sort=-pub_date`,
        {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []).map((a: Record<string, unknown>) => ({
        id: String(a.slug),
        body: String(a.body || ''),
        title: String(a.title),
        description: String(a.description || ''),
        author: String(a.author || 'VinoMartino'),
        pubDate: String(a.pub_date || new Date().toISOString().slice(0, 10)),
        category: String(a.category || ''),
        tags: (a.tags as string[]) || [],
        heroImage: a.hero_image ? `${DIRECTUS_URL}/assets/${String(a.hero_image)}` : null,
        status: String(a.status || 'draft'),
        metaTitle: String(a.meta_title || a.title),
        metaDescription: String(a.meta_description || a.description || ''),
      }));
    } catch {
      return [];
    }
  },
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    pubDate: z.string(),
    category: z.string(),
    tags: z.array(z.string()),
    heroImage: z.string().nullable(),
    status: z.string(),
    metaTitle: z.string(),
    metaDescription: z.string(),
  }),
});

export const collections = { posts, articles };
