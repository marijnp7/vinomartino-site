#!/usr/bin/env node
/**
 * Seed sensible meta_title / meta_description defaults into Directus (LAT-902).
 *
 * Non-destructive: only fills empty fields. Editors can change values via the
 * Directus UI afterwards. Loaders already fall back to name/title and
 * description at render time, so this is editor-UX polish — it ensures the
 * Directus form shows a populated baseline rather than blank inputs.
 *
 * Per collection, where the live value is empty:
 *   meta_title       ← `${name || title} | VinoMartino`
 *   meta_description ← first ~155 chars of `description` (truncated on a word
 *                      boundary with an ellipsis), or the full description if
 *                      it is already short enough.
 *
 * Run from devops-workspace against live Directus:
 *   DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *   DIRECTUS_TOKEN=<admin-token> \
 *   node directus/scripts/seed-seo-defaults.mjs
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const SITE_NAME = 'VinoMartino';
const META_DESC_MAX = 155;

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };

const COLLECTIONS = [
  { name: 'streken',    titleField: 'name'  },
  { name: 'wijnhuizen', titleField: 'name'  },
  { name: 'routes',     titleField: 'title' },
  { name: 'articles',   titleField: 'title' },
];

function truncateForMeta(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= META_DESC_MAX) return clean;
  const cut = clean.slice(0, META_DESC_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 80 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/[\s,;:.\-–—]+$/, '') + '…';
}

function isEmpty(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

async function processCollection({ name, titleField }) {
  console.log(`\n=== ${name} (title=${titleField}) ===`);

  const fields = `id,slug,${titleField},description,meta_title,meta_description`;
  const res = await fetch(
    `${DIRECTUS_URL}/items/${name}?limit=-1&fields=${fields}&sort=slug`,
    { headers: AUTH },
  );
  if (!res.ok) {
    console.error(`Fetch ${name} failed: ${res.status} ${res.statusText}`);
    return { updated: 0, skipped: 0, failed: 1 };
  }

  const { data: items } = await res.json();
  let updated = 0, skipped = 0, failed = 0;

  for (const item of items) {
    const title = String(item[titleField] || '').trim();
    if (!title) {
      console.warn(`  ⚠ ${item.slug}: missing ${titleField}, skipping`);
      skipped++;
      continue;
    }

    const patch = {};
    if (isEmpty(item.meta_title)) {
      patch.meta_title = `${title} | ${SITE_NAME}`;
    }
    if (isEmpty(item.meta_description) && !isEmpty(item.description)) {
      const truncated = truncateForMeta(item.description);
      if (truncated) patch.meta_description = truncated;
    }

    if (Object.keys(patch).length === 0) {
      console.log(`  ↳ ${item.slug}: already populated, skipping`);
      skipped++;
      continue;
    }

    console.log(`  • ${item.slug}: setting ${Object.keys(patch).join(', ')}`);
    const res2 = await fetch(`${DIRECTUS_URL}/items/${name}/${item.id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res2.ok) {
      console.log(`    ✓ updated`);
      updated++;
    } else {
      console.error(`    ✗ patch ${res2.status}: ${(await res2.text()).slice(0, 300)}`);
      failed++;
    }
  }

  return { updated, skipped, failed };
}

async function run() {
  console.log(`\nSeeding SEO defaults at ${DIRECTUS_URL}\n`);
  const totals = { updated: 0, skipped: 0, failed: 0 };
  for (const c of COLLECTIONS) {
    const r = await processCollection(c);
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.failed  += r.failed;
  }
  console.log(`\n✅ Done — updated: ${totals.updated}, skipped: ${totals.skipped}, failed: ${totals.failed}\n`);
  if (totals.failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
