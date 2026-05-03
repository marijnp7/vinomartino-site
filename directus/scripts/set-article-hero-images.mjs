#!/usr/bin/env node
/**
 * Set hero_image on all Directus articles (LAT-831).
 *
 * Run from the site root where public/images/ is present:
 *   DIRECTUS_URL=http://directus:8055 DIRECTUS_TOKEN=<token> node directus/scripts/set-article-hero-images.mjs
 *
 * Or load from .env first:
 *   set -a && source .env && set +a && node directus/scripts/set-article-hero-images.mjs
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

/**
 * Exact slug → image filename mapping.
 */
const SLUG_IMAGE_MAP = {
  'bourgogne-villages-zonder-grand-cru':    'champagne-grower.jpg',
  'etna-nerello-mascalese-hoogte':          'etna-sicilie.jpg',
  'waarom-ik-schrijf-over-wijn-en-reizen':  'hello-world.jpg',
  'langhe-piemonte-4-dagen-route':          'wijnreizen-piemonte.jpg',
  'mosel-riesling-verticaal-pruem':         'route-mosel.jpg',
  'occhipinti-wijnhuis-portret-vittoria':   'cornelissen-etna.jpg',
  'piemontese-keuken-wijn-combinaties':     'piemonte-barolo.jpg',
  'priorat-licorella-garnacha-obsessie':    'priorat-leisteen.jpg',
  'wachau-gruner-veltliner-drie-flessen':   'oostenrijk-wachau.jpg',
  // Extra articles (content writer)
  'brunello-di-montalcino':                 'brunello-montalcino.jpg',
  'wijnreizen-toscane-chianti':             'wijnreizen-toscane.jpg',
  'wijnreizen-toscane':                     'wijnreizen-toscane.jpg',
};

/** Keyword fallback: first match wins */
const KEYWORD_MAP = [
  ['brunello',    'brunello-montalcino.jpg'],
  ['montalcino',  'brunello-montalcino.jpg'],
  ['toscane',     'wijnreizen-toscane.jpg'],
  ['toscana',     'wijnreizen-toscane.jpg'],
  ['chianti',     'wijnreizen-toscane.jpg'],
  ['etna',        'etna-sicilie.jpg'],
  ['sicil',       'etna-sicilie.jpg'],
  ['occhipinti',  'cornelissen-etna.jpg'],
  ['vittoria',    'cornelissen-etna.jpg'],
  ['bourgogne',   'champagne-grower.jpg'],
  ['champagne',   'champagne-grower.jpg'],
  ['langhe',      'streek-langhe.jpg'],
  ['barolo',      'piemonte-barolo.jpg'],
  ['piemonte',    'piemonte-barolo.jpg'],
  ['piemontese',  'piemonte-barolo.jpg'],
  ['barbaresco',  'piemonte-barolo.jpg'],
  ['priorat',     'priorat-leisteen.jpg'],
  ['garnacha',    'priorat-leisteen.jpg'],
  ['mosel',       'route-mosel.jpg'],
  ['riesling',    'route-mosel.jpg'],
  ['wachau',      'oostenrijk-wachau.jpg'],
  ['gruner',      'oostenrijk-wachau.jpg'],
  ['douro',       'douro-vallei.jpg'],
  ['pfalz',       'pfalz-riesling.jpg'],
  ['seizoen',     'seizoenskalender.jpg'],
  ['kalender',    'seizoenskalender.jpg'],
  ['reizen',      'wijnreizen-piemonte.jpg'],
];

function pickImage(slug, title = '') {
  const key = slug.toLowerCase();
  if (SLUG_IMAGE_MAP[key]) return SLUG_IMAGE_MAP[key];

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

async function run() {
  console.log(`\nDirectus: ${DIRECTUS_URL}\n`);

  const res = await fetch(
    `${DIRECTUS_URL}/items/articles?limit=-1&fields=id,slug,title,hero_image&sort=slug`,
    { headers: AUTH }
  );
  if (!res.ok) {
    console.error(`Fetch articles failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const { data: articles } = await res.json();
  console.log(`Found ${articles.length} articles\n`);

  let updated = 0, skipped = 0, failed = 0;

  for (const { id, slug, title, hero_image } of articles) {
    if (hero_image) {
      console.log(`  ↳ ${slug}: hero_image already set, skipping`);
      skipped++;
      continue;
    }

    const imageName = pickImage(slug, title);
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

    const patch = await fetch(`${DIRECTUS_URL}/items/articles/${id}`, {
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

  console.log(`\n✅ Done — updated: ${updated}, skipped: ${skipped}, failed: ${failed}\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
