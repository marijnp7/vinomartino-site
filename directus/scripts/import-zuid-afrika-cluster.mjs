/**
 * LAT-1168: Import the 17 Zuid-Afrika cluster articles into Directus.
 *
 * Idempotent upsert keyed on `slug`: existing rows are PATCHed, new rows POSTed.
 * Source data: directus/data/zuid-afrika-articles.json (generated from the
 * approved LAT-1164 drafts + LAT-1167 SEO-validated metadata).
 *
 * Usage:
 *   DIRECTUS_URL=http://directus:8055 DIRECTUS_TOKEN=<write-token> \
 *     node directus/scripts/import-zuid-afrika-cluster.mjs [--phase 1|2|all] [--dry-run]
 *
 * All rows import with status="draft". Flipping fase-1 to "published" is a
 * separate, gated go-live step (real affiliate URLs + hero images) — not done here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIRECTUS_URL = (process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('DIRECTUS_URL and DIRECTUS_TOKEN are required.');
  process.exit(1);
}

const args = process.argv.slice(2);
const phaseArg = (() => {
  const i = args.indexOf('--phase');
  return i >= 0 ? args[i + 1] : 'all';
})();
const dryRun = args.includes('--dry-run');

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, '..', 'data', 'zuid-afrika-articles.json');
const all = JSON.parse(readFileSync(dataPath, 'utf8'));

const records = phaseArg === 'all' ? all : all.filter((r) => String(r.phase) === String(phaseArg));
if (records.length === 0) {
  console.error(`No records match --phase ${phaseArg}.`);
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

function toDirectusFields(r) {
  return {
    slug: r.slug,
    title: r.title,
    body: r.body,
    author: r.author,
    status: r.status,
    category: r.category,
    pub_date: r.pub_date,
    meta_title: r.metaTitle,
    meta_description: r.metaDescription,
    description: r.metaDescription,
  };
}

async function findBySlug(slug) {
  const res = await fetch(
    `${DIRECTUS_URL}/items/articles?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id,slug&limit=1`,
    { headers },
  );
  if (!res.ok) throw new Error(`lookup ${slug}: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.data && json.data[0]) || null;
}

let created = 0;
let updated = 0;
console.log(`Importing ${records.length} article(s) (phase=${phaseArg}${dryRun ? ', DRY-RUN' : ''}) into ${DIRECTUS_URL}\n`);

for (const r of records) {
  const existing = await findBySlug(r.slug);
  const fields = toDirectusFields(r);
  if (dryRun) {
    console.log(`  ${existing ? 'WOULD PATCH' : 'WOULD POST '} ${r.slug} (status=${r.status}, body ${r.body.length}ch)`);
    continue;
  }
  let res;
  if (existing) {
    res = await fetch(`${DIRECTUS_URL}/items/articles/${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(fields),
    });
  } else {
    res = await fetch(`${DIRECTUS_URL}/items/articles`, {
      method: 'POST',
      headers,
      body: JSON.stringify(fields),
    });
  }
  if (!res.ok) {
    console.error(`  ✗ ${r.slug}: ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    continue;
  }
  if (existing) {
    updated++;
    console.log(`  ↻ updated ${r.slug}`);
  } else {
    created++;
    console.log(`  ✓ created ${r.slug}`);
  }
}

console.log(`\nDone. created=${created} updated=${updated} (status=draft for all).`);
