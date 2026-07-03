#!/usr/bin/env node
/**
 * Migrate archived markdown blog posts from src/content/_legacy/posts/ into Directus articles collection.
 * Source moved to _legacy/ per LAT-1078 (markdown is archive, not runtime source).
 *
 * SAFETY (LAT-2067): this script defaults to status=draft and never publishes blindly.
 * Publishing is an explicit, per-article opt-in decision (--publish / --status=published),
 * because a blind full-batch publish drifted 16 legacy slugs live (incl. a README) once before.
 *
 * Usage:
 *   DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<token> \
 *     node directus/scripts/migrate-blog-posts.mjs [options]
 *
 * Options:
 *   --slug=<slug>[,<slug>]   Only migrate the given article slug(s). Repeatable / comma-separated.
 *   --file=<name.md>[,..]    Only migrate the given file name(s). Repeatable / comma-separated.
 *   --status=<draft|published>  Directus status to write (default: draft).
 *   --publish                Shorthand for --status=published.
 *   --dry-run                Parse and report, but do not POST to Directus.
 *
 * Non-article files (README.md, files without valid frontmatter/title) are always skipped.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const POSTS_DIR = resolve(process.cwd(), 'src/content/_legacy/posts');

// Non-article file names that live in the archive dir but must never be migrated.
const SKIP_FILES = new Set(['readme.md']);

function parseArgs(argv) {
  const opts = { slugs: new Set(), files: new Set(), status: 'draft', dryRun: false };
  const collect = (target, value) => {
    for (const v of String(value).split(',').map((s) => s.trim()).filter(Boolean)) target.add(v);
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inlineVal] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const takeVal = () => (inlineVal !== undefined ? inlineVal : argv[++i]);
    switch (flag) {
      case '--slug': collect(opts.slugs, takeVal()); break;
      case '--file': collect(opts.files, takeVal()); break;
      case '--status': opts.status = String(takeVal()); break;
      case '--publish': opts.status = 'published'; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }
  return opts;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
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
      data[key] = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      data[key] = val;
    }
  }
  return { data, body: match[2] };
}

function shouldMigrate(file, slug, opts) {
  if (opts.files.size && !opts.files.has(file)) return false;
  if (opts.slugs.size && !opts.slugs.has(slug)) return false;
  return true;
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 33).join('\n').replace(/^ \*?/gm, ''));
    return;
  }

  if (!['draft', 'published'].includes(opts.status)) {
    console.error(`Invalid --status "${opts.status}" (expected draft or published).`);
    process.exit(1);
  }
  if (!opts.dryRun && !DIRECTUS_TOKEN) {
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

  const allFiles = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const filterActive = opts.slugs.size || opts.files.size;
  console.log(`\nMigrate legacy blog posts → Directus`);
  console.log(`  dir:     ${POSTS_DIR}`);
  console.log(`  status:  ${opts.status}${opts.status === 'published' ? '  ⚠ WILL PUBLISH LIVE' : ''}`);
  console.log(`  filter:  ${filterActive ? [...opts.slugs, ...opts.files].join(', ') : '(none — all article files)'}`);
  console.log(`  dry-run: ${opts.dryRun}\n`);

  let created = 0, skipped = 0, existing = 0, failed = 0;

  for (const file of allFiles) {
    if (SKIP_FILES.has(file.toLowerCase())) {
      console.log(`  ⏭  skip non-article: ${file}`);
      skipped++;
      continue;
    }

    const raw = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const parsed = parseFrontmatter(raw);
    if (!parsed || !String(parsed.data.title || parsed.data.slug || '').trim()) {
      console.log(`  ⏭  skip non-article (no frontmatter/title): ${file}`);
      skipped++;
      continue;
    }

    const { data, body } = parsed;
    const slug = String(data.slug || file.replace(/\.md$/, ''));

    if (!shouldMigrate(file, slug, opts)) {
      skipped++;
      continue;
    }

    const article = {
      title: String(data.title || slug),
      slug,
      status: opts.status,
      description: String(data.description || data.summary || ''),
      body,
      author: String(data.author || 'Marijn'),
      pub_date: data.date ? new Date(data.date).toISOString().slice(0, 10) : null,
      category: String(data.category || ''),
      tags: Array.isArray(data.tags) ? data.tags : [],
      meta_title: String(data.metaTitle || data.title || ''),
      meta_description: String(data.metaDescription || data.description || data.summary || ''),
    };

    if (opts.dryRun) {
      console.log(`  ○ would migrate: ${slug}  (status=${opts.status})`);
      created++;
      continue;
    }

    console.log(`  Migrating: ${slug}  (status=${opts.status})`);
    const res = await fetch(`${DIRECTUS_URL}/items/articles`, {
      method: 'POST',
      headers,
      body: JSON.stringify(article),
    });
    if (res.ok) {
      console.log(`    ✓ created`);
      created++;
    } else if (res.status === 400) {
      const errBody = await res.json();
      if (errBody?.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
        console.log(`    ↳ already exists, skipping`);
        existing++;
      } else {
        console.error(`    ✗ error:`, errBody);
        failed++;
      }
    } else {
      console.error(`    ✗ ${res.status}:`, await res.text());
      failed++;
    }
  }

  console.log(`\n✅ Done. created/would=${created}  existing=${existing}  skipped=${skipped}  failed=${failed}\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
