#!/usr/bin/env node
// Meegereisd Warm - CLI om de vaste kleur-grading preset toe te passen op bestanden/mappen.
// De preset zelf leeft in src/lib/grade-image.mjs (enige bron van waarheid, ook door de
// build-time DAM-loaders gebruikt). Spec: DESIGN_GUIDELINES.md § 5 / § 5a. Ticket: LAT-2007.
//
// Gebruik:
//   node scripts/grade-meegereisd-warm.mjs <bestand-of-map> [meer paden...]
//   node scripts/grade-meegereisd-warm.mjs --check <pad>    (alleen rapporteren)
//   node scripts/grade-meegereisd-warm.mjs --force <pad>    (opnieuw graden na preset-revisie)
//
// In-place: overschrijft het bestand met de gegradeerde versie (bytes committen, § 4).

import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { PRESET_ID, gradeBuffer, isGradedBuffer } from '../src/lib/grade-image.mjs';

const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function collect(paths) {
  const out = [];
  for (const p of paths) {
    const s = statSync(p);
    if (s.isDirectory()) {
      for (const name of readdirSync(p)) {
        if (EXTS.has(extname(name).toLowerCase())) out.push(join(p, name));
      }
    } else if (EXTS.has(extname(p).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

async function meanRGB(buf) {
  const st = await sharp(buf).stats();
  return st.channels.slice(0, 3).map((c) => +c.mean.toFixed(1));
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const force = args.includes('--force');
  const paths = args.filter((a) => !a.startsWith('--'));
  if (paths.length === 0) {
    console.error('gebruik: node scripts/grade-meegereisd-warm.mjs [--check|--force] <pad...>');
    process.exit(1);
  }
  const files = collect(paths);
  let done = 0, skipped = 0;
  for (const f of files) {
    const before = readFileSync(f);
    if ((await isGradedBuffer(before)) && !force) {
      console.log(`SKIP  ${f}  (reeds ${PRESET_ID})`);
      skipped++;
      continue;
    }
    const beforeRGB = await meanRGB(before);
    const after = await gradeBuffer(before, { force: true });
    const afterRGB = await meanRGB(after);
    const warmDelta = (afterRGB[0] - afterRGB[2]) - (beforeRGB[0] - beforeRGB[2]);
    const line = `${f}  RGB ${beforeRGB.join(',')} -> ${afterRGB.join(',')}  warmshift(R-B) +${warmDelta.toFixed(1)}`;
    if (check) {
      console.log(`CHECK ${line}`);
    } else {
      writeFileSync(f, after);
      console.log(`GRADE ${line}`);
      done++;
    }
  }
  console.log(`\nKlaar: ${done} gegradeerd, ${skipped} overgeslagen, ${files.length} totaal.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
