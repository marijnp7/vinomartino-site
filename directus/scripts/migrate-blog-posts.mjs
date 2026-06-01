#!/usr/bin/env node
/**
 * Migrate archived markdown blog posts from src/content/_legacy/posts/ into Directus articles collection.
 * Source moved to _legacy/ per LAT-1078 (markdown is archive, not runtime source).
 * Run after bootstrap-schema.mjs: DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<token> node directus/scripts/migrate-blog-posts.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const POSTS_DIR = resolve(process.cwd(), 'src/content/_legacy/posts');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

if (!existsSync(POSTS_DIR)) {
  console.error(`Posts directory not found: ${POSTS_DIR}`);
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: content };
  const data = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    let val = line.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      data[key] = val;
    }
  }
  return { data, body: match[2] };
}

async function run() {
  const files = readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  console.log(`\nMigrating ${files.length} blog posts from ${POSTS_DIR}\n`);

  for (const file of files) {
    const raw = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    const slug = String(data.slug || file.replace(/\.md$/, ''));

    const article = {
      title: String(data.title || slug),
      slug,
      status: 'published',
      description: String(data.description || data.summary || ''),
      body,
      author: String(data.author || 'Martin'),
      pub_date: data.date ? new Date(data.date).toISOString().slice(0, 10) : null,
      category: String(data.category || ''),
      tags: Array.isArray(data.tags) ? data.tags : [],
      meta_title: String(data.metaTitle || data.title || ''),
      meta_description: String(data.metaDescription || data.description || data.summary || ''),
    };

    console.log(`  Migrating: ${slug}`);
    const res = await fetch(`${DIRECTUS_URL}/items/articles`, {
      method: 'POST',
      headers,
      body: JSON.stringify(article),
    });
    if (res.ok) {
      console.log(`    ✓ created`);
    } else if (res.status === 400) {
      const body = await res.json();
      if (body?.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
        console.log(`    ↳ already exists, skipping`);
      } else {
        console.error(`    ✗ error:`, body);
      }
    } else {
      console.error(`    ✗ ${res.status}:`, await res.text());
    }
  }

  console.log('\n✅ Blog post migration complete.\n');
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
