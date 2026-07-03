#!/usr/bin/env node
// Meegereisd Warm - de vaste kleur-grading preset voor de hele VinoMartino-beeldbank.
// Bron/spec: DESIGN_GUIDELINES.md § 5 (VIS-STRAT-01). Implementatie: VIS-BL-08 / LAT-2007.
//
// Doel: alle Tier 1-beelden in EEN warme, editoriale licht-familie brengen die past
// bij het palet uit tokens.css. Lichte, niet-destructieve correctie -- geen zware look,
// geen HDR, geen oranje-teal. Deterministisch en idempotent: dezelfde input -> dezelfde
// output, en een reeds gegradeerd beeld wordt niet dubbel bewerkt.
//
// Gebruik:
//   node scripts/grade-meegereisd-warm.mjs <bestand-of-map> [meer paden...]
//   node scripts/grade-meegereisd-warm.mjs --check <bestand>   (alleen rapporteren)
//   node scripts/grade-meegereisd-warm.mjs --force <bestand>   (opnieuw graden)
//
// In-place: overschrijft het bestand met de gegradeerde versie (bytes committen, zie
// DESIGN_GUIDELINES § 4). EXIF-orientatie wordt in de pixels gebakken (auto-orient).

import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

export const PRESET_ID = 'MeegereisdWarm-v1';

// Parameters, 1-op-1 afgeleid van DESIGN_GUIDELINES.md § 5.
// Per-kanaal lineair: out = a * in + b (0-255). a<1 = zachte highlight-roll-off +
// opgetilde zwartpunt via b>0 (film-achtige voet). R>G>B in winst = warme balans;
// blauw krijgt de laagste winst zodat luchten niet knallen en groen richting olijf zakt.
export const PRESET = {
  linear: {
    // [aR, aG, aB]  helling per kanaal (contrast/warmte-verhouding)
    a: [0.985, 0.965, 0.930],
    // [bR, bG, bB]  offset per kanaal (zwartpunt-lift + amber-warmte)
    b: [7.0, 5.5, 3.0],
  },
  // Globale HSL: lichte vibrance-terugname zodat aardetonen leven zonder poster-effect.
  modulate: { saturation: 0.95, brightness: 1.0 },
  // Zeer subtiele mid-gamma; neutraal genoeg om niet te verdonkeren.
  gamma: 1.02,
  jpegQuality: 86,
};

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

async function isGraded(file) {
  try {
    const md = await sharp(file).metadata();
    const soft = md.exif && Buffer.isBuffer(md.exif) ? md.exif.toString('latin1') : '';
    return soft.includes(PRESET_ID);
  } catch {
    return false;
  }
}

export async function grade(inputBuf) {
  return sharp(inputBuf)
    .rotate() // bak EXIF-orientatie in de pixels (auto-orient), DESIGN_GUIDELINES § 4
    .linear(PRESET.linear.a, PRESET.linear.b)
    .modulate(PRESET.modulate)
    .gamma(PRESET.gamma)
    .withMetadata({ exif: { IFD0: { Software: PRESET_ID } } })
    .jpeg({ quality: PRESET.jpegQuality, mozjpeg: true })
    .toBuffer();
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
    const already = await isGraded(f);
    if (already && !force) {
      console.log(`SKIP  ${f}  (reeds ${PRESET_ID})`);
      skipped++;
      continue;
    }
    const before = readFileSync(f);
    const beforeRGB = await meanRGB(before);
    const after = await grade(before);
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
