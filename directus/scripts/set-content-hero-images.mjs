#!/usr/bin/env node
/**
 * Set hero_image on all Directus content items (LAT-830 follow-up).
 *
 * Generalized version of set-article-hero-images.mjs — handles:
 *   - articles      (slug-keyed, see articles script)
 *   - wijnhuizen    (matched on slug + name)
 *   - streken       (matched on slug + name)
 *   - routes        (matched on slug + title)
 *
 * Run from the site root where public/images/ is present:
 *   set -a && source .env && set +a && node directus/scripts/set-content-hero-images.mjs
 *
 * Or per collection:
 *   node directus/scripts/set-content-hero-images.mjs wijnhuizen streken routes
 *
 * Requires Node.js 18+ (uses native fetch, FormData, Blob).
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const IMAGES_DIR = resolve(process.cwd(), 'public/images');

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

if (!existsSync(IMAGES_DIR)) {
  console.error(`Images directory not found: ${IMAGES_DIR}`);
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };

const COLLECTIONS = {
  wijnhuizen: {
    titleField: 'name',
    slugMap: {
      'bartolo-mascarello-barolo':   'bartolo-mascarello.jpg',
      'cornelissen-etna-sicilie':    'cornelissen-etna.jpg',
      'niepoort-douro-portugal':     'niepoort-douro.jpg',
    },
  },
  streken: {
    titleField: 'name',
    slugMap: {
      'langhe-piemonte':  'streek-langhe.jpg',
      'douro-portugal':   'streek-douro.jpg',
      'mosel-duitsland':  'streek-mosel.jpg',
    },
  },
  routes: {
    titleField: 'title',
    slugMap: {
      'etna-noord-randazzo-solicchiata':   'route-etna-noord.jpg',
      'mosel-bernkastel-traben-trarbach':  'route-mosel.jpg',
      'priorat-porrera-gratallops':        'route-priorat.jpg',
    },
  },
};

const KEYWORD_MAP = [
  ['barolo',      'piemonte-barolo.jpg'],
  ['mascarello',  'bartolo-mascarello.jpg'],
  ['etna',        'etna-sicilie.jpg'],
  ['cornelissen', 'cornelissen-etna.jpg'],
  ['niepoort',    'niepoort-douro.jpg'],
  ['douro',       'douro-vallei.jpg'],
  ['langhe',      'streek-langhe.jpg'],
  ['piemonte',    'piemonte-barolo.jpg'],
  ['mosel',       'streek-mosel.jpg'],
  ['riesling',    'streek-mosel.jpg'],
  ['priorat',     'priorat-leisteen.jpg'],
  ['toscane',     'wijnreizen-toscane.jpg'],
  ['chianti',     'wijnreizen-toscane.jpg'],
  ['brunello',    'brunello-montalcino.jpg'],
  ['wachau',      'oostenrijk-wachau.jpg'],
  ['pfalz',       'pfalz-riesling.jpg'],
  ['champagne',   'champagne-grower.jpg'],
];

function pickImage(collection, slug, title = '') {
  const cfg = COLLECTIONS[collection];
  const key = slug.toLowerCase();
  if (cfg.slugMap[key]) return cfg.slugMap[key];

  const haystack = `${slug} ${title}`.toLowerCase();
  for (const [kw, img] of KEYWORD_MAP) {
    if (haystack.includes(kw)) return img;
  }

  console.warn(`  ⚠ No match for "${slug}" — using hello-world.jpg`);
  return 'hello-world.jpg';
}

async function uploadImage(imageName) {
  const imagePath = join(IMAGES_DIR, imageName);
  if (!existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }

  const fileBuffer = readFileSync(imagePath);
  const blob = new Blob([fileBuffer], { type: 'image/jpeg' });

  const form = new FormData();
  form.append('file', blob, imageName);
  form.append('title', imageName.replace(/\.jpg$/i, '').replace(/-/g, ' '));

  const res = await fetch(`${DIRECTUS_URL}/files`, {
    method: 'POST',
    headers: AUTH,
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  return json.data?.id;
}

async function processCollection(name) {
  const cfg = COLLECTIONS[name];
  const titleField = cfg.titleField;

  console.log(`\n=== ${name} ===\n`);

  const fields = `id,slug,${titleField},hero_image`;
  const res = await fetch(
    `${DIRECTUS_URL}/items/${name}?limit=-1&fields=${fields}&sort=slug`,
    { headers: AUTH }
  );
  if (!res.ok) {
    console.error(`Fetch ${name} failed: ${res.status} ${res.statusText}`);
    return { updated: 0, skipped: 0, failed: 0 };
  }

  const { data: items } = await res.json();
  console.log(`Found ${items.length} ${name}\n`);

  let updated = 0, skipped = 0, failed = 0;

  for (const item of items) {
    const { id, slug, hero_image } = item;
    const title = item[titleField] || '';

    if (hero_image) {
      console.log(`  ↳ ${slug}: hero_image already set, skipping`);
      skipped++;
      continue;
    }

    const imageName = pickImage(name, slug, title);
    console.log(`  • ${slug}`);
    console.log(`    image: ${imageName}`);

    let fileId;
    try {
      fileId = await uploadImage(imageName);
      console.log(`    uploaded: ${fileId}`);
    } catch (err) {
      console.error(`    ✗ upload failed: ${err.message}`);
      failed++;
      continue;
    }

    const patch = await fetch(`${DIRECTUS_URL}/items/${name}/${id}`, {
      method: 'PATCH',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_image: fileId }),
    });

    if (patch.ok) {
      console.log(`    ✓ hero_image set`);
      updated++;
    } else {
      console.error(`    ✗ patch failed (${patch.status}): ${await patch.text()}`);
      failed++;
    }
  }

  return { updated, skipped, failed };
}

async function run() {
  console.log(`\nDirectus: ${DIRECTUS_URL}`);

  const requested = process.argv.slice(2);
  const targets = requested.length > 0
    ? requested.filter((c) => c in COLLECTIONS)
    : Object.keys(COLLECTIONS);

  if (targets.length === 0) {
    console.error(`No valid collections. Choose from: ${Object.keys(COLLECTIONS).join(', ')}`);
    process.exit(1);
  }

  const totals = { updated: 0, skipped: 0, failed: 0 };
  for (const name of targets) {
    const r = await processCollection(name);
    totals.updated += r.updated;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  }

  console.log(`\n✅ Done — updated: ${totals.updated}, skipped: ${totals.skipped}, failed: ${totals.failed}\n`);
  if (totals.failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
