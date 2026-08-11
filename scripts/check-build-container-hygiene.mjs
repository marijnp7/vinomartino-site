#!/usr/bin/env node
// scripts/check-build-container-hygiene.mjs — LAT-4968
//
// Statische check op .github/workflows/*.yml. Faalt (exit 1) zodra een workflow
// een VPS-build start zonder de twee dingen die een wees-buildcontainer
// onmogelijk maken:
//
//   1. `docker run` met een deterministische `--name`. Zonder naam overleeft de
//      container een job-timeout als naamloze wees (docker-CLI sterft met de
//      ssh-sessie mee, de container hangt aan de daemon) en is er niets om een
//      opruimer op te richten.
//   2. een `if: always()`-stap in dezelfde job die scripts/reap-build-containers.sh
//      draait, en die VÓÓR de stage-cleanup staat — de schrijver moet dood zijn
//      voordat je zijn map wist.
//
// Waarom dit bestaat en niet alleen de fix zelf: het defect is twee keer
// ontstaan door hetzelfde te kopiëren. i18n-nl-gate.yml erfde in LAT-3598 de
// build-stap van deploy.yml inclusief het ontbrekende `--name`, en LAT-3441 was
// dus niet structureel opgelost — twee van de drie wezen van 2026-08-11 kwamen
// uit gate-runs (LAT-4967). Een derde kopie is een kwestie van tijd; deze check
// maakt dat een rode PR in plaats van een volgelopen VPS-schijf.
//
//   node scripts/check-build-container-hygiene.mjs [--dir .github/workflows]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dirArg = process.argv.indexOf('--dir');
const DIR = dirArg > -1 ? process.argv[dirArg + 1] : '.github/workflows';
const REAPER = 'scripts/reap-build-containers.sh';

// Alleen builds in een per-run bind-mount onder /srv/vino-builds zijn de
// wees-vorm die dit bewaakt. Een `docker run` zonder zo'n mount (bv. een
// wegwerp-tool-container) valt hier bewust buiten.
const STAGE_MOUNT = /-v\s+"\$STAGE"/;

const problems = [];
const checked = [];

for (const file of readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f))) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    if (!/^\s*docker run\b/.test(line)) return;
    // De docker run-aanroep loopt door over backslash-continuaties.
    let stmt = line;
    let j = i;
    while (/\\\s*$/.test(lines[j]) && j + 1 < lines.length) {
      stmt += '\n' + lines[++j];
    }
    if (!STAGE_MOUNT.test(stmt)) return;

    const where = `${file}:${i + 1}`;
    checked.push(where);
    if (!/--name\s/.test(stmt)) {
      problems.push(`${where}: build-container zonder --name (wees-risico, LAT-4968)`);
    }
    if (!/docker rm -f/.test(text.slice(0, text.indexOf(line)))) {
      // Niet fataal maken zou de re-run-collisie terugbrengen: GHA hergebruikt
      // run_id bij een re-run, dus een achtergebleven wees met dezelfde naam
      // laat `docker run --name` afketsen.
      problems.push(`${where}: geen \`docker rm -f\` vóór de docker run (re-run met hetzelfde run_id ketst af op een naamconflict)`);
    }
  });

  if (!checked.some((c) => c.startsWith(file + ':'))) continue;

  // Een workflow mag de reaper meer dan één keer draaien: één keer vóór de
  // build (schone machine, breekt de saturatie-lus) en één keer als
  // `if: always()` erna (ruimt de eigen wees op). Alleen die tweede is
  // verplicht — zonder always() draait hij juist niet bij de timeout die de
  // wees maakt.
  const reapOccurrences = [];
  for (let k = text.indexOf(REAPER); k !== -1; k = text.indexOf(REAPER, k + 1)) {
    const stepStart = text.lastIndexOf('- name:', k);
    reapOccurrences.push({ at: k, always: /if:\s*always\(\)/.test(text.slice(stepStart, k)) });
  }
  if (reapOccurrences.length === 0) {
    problems.push(`${file}: bouwt in een stage-mount maar draait ${REAPER} nergens`);
    continue;
  }
  const alwaysReap = reapOccurrences.find((o) => o.always);
  if (!alwaysReap) {
    problems.push(`${file}: geen enkele reaper-stap heeft \`if: always()\` — draait dan juist niet bij de timeout die de wees maakt`);
    continue;
  }
  // Volgorde: killen vóór wissen.
  const rmIdx = text.indexOf("rm -rf '$STAGE'");
  if (rmIdx > -1 && rmIdx < alwaysReap.at) {
    problems.push(`${file}: stage-cleanup staat vóór de always()-reaper — een levende schrijver vult de map tijdens de rm -rf weer aan`);
  }
}

if (checked.length === 0) {
  console.error(`FOUT: geen enkele build-container gevonden in ${DIR}/ — de check meet niets meer (patroon verouderd?)`);
  process.exit(2);
}

console.log(`Gecontroleerde build-containers (${checked.length}): ${checked.join(', ')}`);
if (problems.length) {
  console.error('\nFOUT — build-container hygiene (LAT-4968):');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('OK — elke build-container heeft een deterministische naam en een if:always() reaper vóór de cleanup.');
