#!/usr/bin/env node
// LAT-4810 — draait ALLE `test:*`-scripts uit package.json, fail-fast.
//
// Waarom een runner en geen handgeschreven `"test": "npm run a && npm run b && …"`:
// de defectklasse van dit ticket is "de test bestaat, maar niets voert hem uit".
// Een handmatige lijst herhaalt die fout zodra iemand test #11 toevoegt en de
// aggregate vergeet. Deze runner leidt de lijst af uit package.json, dus een
// nieuw `test:*`-script draait automatisch mee.
//
// Deze runner hangt aan de `prebuild`-lifecycle-hook, dus hij draait vanzelf
// bij ELKE `npm run build` — in deploy.yml, in publish.yml en in de Dockerfile.
// Er is geen aparte CI-regel die iemand kan vergeten aan te passen.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const names = Object.keys(pkg.scripts ?? {})
  .filter((k) => k.startsWith('test:'))
  .sort();

// Falsifieerbaarheid: als de detectie stukgaat (hernoemde scripts, kapotte
// package.json) moet dit LUID falen. Zonder deze vloer zou de runner nul tests
// draaien en exit 0 geven — precies de "detector zonder executor" die LAT-4810
// beschrijft, maar dan met een groen vinkje erbij.
const FLOOR = 10;
if (names.length < FLOOR) {
  console.error(
    `run-all-tests: slechts ${names.length} test:*-scripts gevonden, minstens ${FLOOR} verwacht.\n` +
      'Is er een test hernoemd of verwijderd? Pas de vloer bewust aan, of herstel het script.'
  );
  process.exit(1);
}

console.log(`run-all-tests: ${names.length} test:*-scripts\n`);

for (const name of names) {
  console.log(`── ${name}`);
  const r = spawnSync('npm', ['run', '--silent', name], { cwd: root, stdio: 'inherit' });
  const code = r.status ?? 1;
  if (code !== 0) {
    console.error(`\nrun-all-tests: FAALT op "${name}" (exit ${code}) — build afgebroken.`);
    process.exit(code);
  }
}

console.log(`\nrun-all-tests: alle ${names.length} test:*-scripts geslaagd.`);
