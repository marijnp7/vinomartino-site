import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!README.md'], base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    author: z.string(),
    summary: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    heroImage: z.string().optional(),
    slug: z.string().optional(),
  }),
});

const wijnhuizen = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!README.md'], base: './src/content/wijnhuizen' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    region: z.string().optional(),
    country: z.string().default('Nederland'),
    address: z.string().optional(),
    websiteUrl: z.string().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    relatedStreek: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});

const wijnroutes = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!README.md'], base: './src/content/wijnroutes' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    duration: z.string().optional(),
    stops: z.array(z.string()).optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    relatedStreek: z.string().optional(),
    date: z.coerce.date().optional(),
  }),
});

const streken = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!README.md'], base: './src/content/streken' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    description: z.string().optional(),
    country: z.string().optional(),
    subregions: z.array(z.string()).optional(),
    grapeVarieties: z.array(z.string()).optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).optional(),
    date: z.coerce.date().optional(),
  }),
});

export const collections = { posts, wijnhuizen, wijnroutes, streken };
