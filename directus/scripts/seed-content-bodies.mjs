#!/usr/bin/env node
/**
 * Seed body/description into Directus content items from archived markdown (LAT-896).
 *
 * Reads src/content/_legacy/{streken,wijnhuizen,wijnroutes}/<slug>.md (path moved
 * by LAT-1078), extracts the frontmatter description and the markdown body, and
 * PATCHes the matching Directus item — only when the live `body` field is empty.
 * Hero images are untouched (set by set-content-hero-images.mjs).
 *
 * After this runs, Directus is the source of truth — editors can change
 * body/description/etc. via the Directus UI and changes appear on the next
 * deploy.
 *
 * Usage:
 *   set -a && source .env && set +a && node directus/scripts/seed-content-bodies.mjs
 *   node directus/scripts/seed-content-bodies.mjs streken
 *   node directus/scripts/seed-content-bodies.mjs --force        # overwrite non-empty bodies
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const CONTENT_ROOT = resolve(process.cwd(), 'src/content/_legacy');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

if (!existsSync(CONTENT_ROOT)) {
  console.error(`Content directory not found: ${CONTENT_ROOT}`);
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };

const COLLECTIONS = {
  streken:    { dir: 'streken',    titleField: 'name'  },
  wijnhuizen: { dir: 'wijnhuizen', titleField: 'name'  },
  routes:     { dir: 'wijnroutes', titleField: 'title' },
};

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw.trim() };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fm[key] = val;
  }
  return { fm, body: m[2].trim() };
}

function stripLeadingH1(body) {
  // Local markdown uses `# Title` as first line. Directus pages render their
  // own H1 from `name`/`title`, so drop the duplicate to avoid double headings.
  return body.replace(/^#\s+[^\n]+\n+/, '').trim();
}

function loadLocalEntries(dir) {
  const fullDir = join(CONTENT_ROOT, dir);
  if (!existsSync(fullDir)) return [];
  return readdirSync(fullDir)
    .filter((f) => f.endsWith('.md') && f !== 'README.md')
    .map((file) => {
      const raw = readFileSync(join(fullDir, file), 'utf-8');
      const { fm, body } = parseFrontmatter(raw);
      const slug = fm.slug || file.replace(/\.md$/, '');
      return { slug, fm, body: stripLeadingH1(body) };
    });
}

async function processCollection(name, { force }) {
  const cfg = COLLECTIONS[name];
  console.log(`\n=== ${name} (legacy: src/content/_legacy/${cfg.dir}/) ===\n`);

  const local = loadLocalEntries(cfg.dir);
  if (local.length === 0) {
    console.log(`  ↳ no local markdown found, skipping`);
    return { updated: 0, skipped: 0, missing: 0, failed: 0 };
  }

  const fields = `id,slug,${cfg.titleField},description,body`;
  const res = await fetch(
    `${DIRECTUS_URL}/items/${name}?limit=-1&fields=${fields}&sort=slug`,
    { headers: AUTH },
  );
  if (!res.ok) {
    console.error(`Fetch ${name} failed: ${res.status} ${res.statusText}`);
    return { updated: 0, skipped: 0, missing: 0, failed: 1 };
  }

  const { data: items } = await res.json();
  const bySlug = new Map(items.map((it) => [it.slug, it]));

  let updated = 0, skipped = 0, missing = 0, failed = 0;

  for (const entry of local) {
    const item = bySlug.get(entry.slug);
    if (!item) {
      console.warn(`  ⚠ ${entry.slug}: no Directus item — create it manually first`);
      missing++;
      continue;
    }

    const patch = {};
    const liveBody = (item.body || '').trim();
    if (entry.body && (force || !liveBody)) {
      patch.body = entry.body;
    }
    const liveDesc = (item.description || '').trim();
    if (entry.fm.description && (force || !liveDesc)) {
      patch.description = entry.fm.description;
    }

    if (Object.keys(patch).length === 0) {
      console.log(`  ↳ ${entry.slug}: already populated, skipping`);
      skipped++;
      continue;
    }

    console.log(`  • ${entry.slug}: setting ${Object.keys(patch).join(', ')}`);
    const res2 = await fetch(`${DIRECTUS_URL}/items/${name}/${item.id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res2.ok) {
      console.log(`    ✓ updated`);
      updated++;
    } else {
      console.error(`    ✗ patch ${res2.status}: ${await res2.text()}`);
      failed++;
    }
  }

  return { updated, skipped, missing, failed };
}

async function run() {
  console.log(`\nDirectus: ${DIRECTUS_URL}`);

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const requested = args.filter((a) => !a.startsWith('--'));
  const targets = requested.length > 0
    ? requested.filter((c) => c in COLLECTIONS)
    : Object.keys(COLLECTIONS);

  if (targets.length === 0) {
    console.error(`No valid collections. Choose from: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const totals = { updated: 0, skipped: 0, missing: 0, failed: 0 };
  for (const name of targets) {
    const r = await processCollection(name, { force });
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.missing += r.missing;
    totals.failed += r.failed;
  }

  console.log(
    `\n✅ Done — updated: ${totals.updated}, skipped: ${totals.skipped}, ` +
    `missing: ${totals.missing}, failed: ${totals.failed}\n`,
  );
  if (totals.failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
