// scripts/lat5526-prod-build-gates.test.mjs — LAT-5526
//
// LAT-4810 hing `npm test` als blokkerende poort vóór `deploy.yml`. Dat
// dichtte één weg naar vinomartino.com; er waren er meer. Deze suite legt de
// *invariant* vast in plaats van de reparatie, zodat een nieuwe of herstelde
// bouwroute rood gaat in plaats van stil langs de poort te glippen:
//
//   1. Elke workflow die de site bouwt (`npm run build`) én naar een
//      vinomartino-omgeving schrijft, heeft een `tests`-job die `npm test`
//      draait, en zijn bouwjob hangt er via `needs:` aan vast.
//   2. Geen enkele compose-file die `vinomartino.com` via traefik routeert,
//      bouwt uit de repo-`Dockerfile`. Dat is de meting waarop LAT-5526
//      besloot om GEEN `RUN npm test` in de Dockerfile te zetten: dat image
//      is geen weg naar productie. Wordt het er ooit één, dan valt deze
//      assertie om en moet het besluit opnieuw genomen worden.
//
// Bewust geen YAML-lib: de repo heeft er geen en één toevoegen om drie
// structuurregels te lezen is duurder dan de mini-parser hieronder, die
// alleen de vorm kent die deze workflows daadwerkelijk gebruiken.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(root, '.github', 'workflows');

/**
 * Splits the `jobs:` mapping of a workflow into { jobName: rawJobBlock }.
 * Job keys sit at exactly two spaces of indentation; a job block runs until
 * the next line at that indentation or shallower.
 */
function parseJobs(yaml) {
  const lines = yaml.split('\n');
  const jobsStart = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  assert.notEqual(jobsStart, -1, 'workflow heeft geen top-level `jobs:`');

  const jobs = {};
  let current = null;
  for (const line of lines.slice(jobsStart + 1)) {
    if (/^\S/.test(line) && line.trim() !== '') break; // back to top level
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      current = header[1];
      jobs[current] = [];
      continue;
    }
    if (current) jobs[current].push(line);
  }
  return Object.fromEntries(
    Object.entries(jobs).map(([name, body]) => [name, body.join('\n')]),
  );
}

/** `needs: tests` and `needs: [a, tests]` and a block list all count. */
function needsOf(jobBlock) {
  const inline = jobBlock.match(/^ {4}needs:\s*(.+)$/m);
  if (inline) {
    return inline[1]
      .replace(/[[\]]/g, '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const block = jobBlock.match(/^ {4}needs:\s*$\n((?: {6}- .+\n?)+)/m);
  if (block) {
    return block[1]
      .split('\n')
      .map((l) => l.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);
  }
  return [];
}

const workflowFiles = readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f));

const SERVING_CONTAINER = /paperclip-vinomartino-(prod|preview)-1/;
const BUILDS = /npm run build/;

// Een workflow telt als "bouwroute naar een vinomartino-omgeving" als hij de
// site bouwt ÉN de serverende nginx-container aanraakt. Beide helften zijn
// nodig:
//   • i18n-nl-gate.yml bouwt wél op de VPS, maar rsynct de dist terug naar de
//     runner en raakt geen serverende container aan — geen deploy-route.
//     (Een eerdere versie van deze detectie viel hierop om, op het woord
//     `preview-dist` in een rsync-`--exclude`.)
//   • promote.yml raakt de prod-container wél aan maar bouwt niet; zie de
//     aparte assertie onderaan.
const buildRoutes = workflowFiles.filter((f) => {
  const src = readFileSync(path.join(workflowDir, f), 'utf8');
  return BUILDS.test(src) && SERVING_CONTAINER.test(src);
});

test('LAT-5526: elke bouwroute naar een vinomartino-omgeving is bekend', () => {
  // Vangnet tegen een stille scope-krimp: raakt deze lijst leeg (hernoemde
  // paden, andere dist-locatie), dan bewijzen de tests hieronder niets meer.
  assert.ok(
    buildRoutes.length >= 2,
    `Verwacht minstens deploy.yml en publish.yml als bouwroute, gevonden: ${JSON.stringify(buildRoutes)}`,
  );
  for (const expected of ['deploy.yml', 'publish.yml']) {
    assert.ok(
      buildRoutes.includes(expected),
      `${expected} wordt niet meer als bouwroute herkend — pas de detectie aan of verklaar waarom`,
    );
  }
});

for (const file of buildRoutes) {
  test(`LAT-5526: ${file} draait npm test als blokkerende poort`, () => {
    const src = readFileSync(path.join(workflowDir, file), 'utf8');
    const jobs = parseJobs(src);

    assert.ok(
      Object.prototype.hasOwnProperty.call(jobs, 'tests'),
      `${file} heeft geen \`tests\`-job — deze bouwroute passeert geen enkele suite`,
    );
    assert.match(
      jobs.tests,
      /^\s*run:\s*npm test\s*$/m,
      `${file}: de \`tests\`-job draait geen \`npm test\``,
    );

    const gated = Object.entries(jobs).filter(
      ([name, body]) => name !== 'tests' && /npm run build/.test(body),
    );
    assert.ok(
      gated.length > 0,
      `${file}: geen bouwjob gevonden buiten \`tests\` — detectie klopt niet meer`,
    );
    for (const [name, body] of gated) {
      assert.ok(
        needsOf(body).includes('tests'),
        `${file}: job \`${name}\` bouwt de site maar heeft geen \`needs: tests\` — de poort is er, maar hij houdt niets tegen`,
      );
    }
  });
}

test('LAT-5526: een workflow die alleen promoveert, bouwt niet', () => {
  // promote.yml raakt de prod-container aan zonder zelf te bouwen: het
  // verplaatst preview-dist → dist. Die inhoud is dus per definitie door een
  // van de bouwroutes hierboven gemaakt, en daarmee getest. Dat argument houdt
  // alleen stand zolang zo'n workflow niet zélf gaat bouwen — bouwt hij wel,
  // dan valt hij in de categorie hierboven en heeft hij een eigen poort nodig.
  const promoteOnly = workflowFiles.filter((f) => {
    const src = readFileSync(path.join(workflowDir, f), 'utf8');
    return SERVING_CONTAINER.test(src) && !BUILDS.test(src);
  });
  assert.ok(
    promoteOnly.includes('promote.yml'),
    `promote.yml wordt niet meer als promote-only herkend — herijk deze assertie (gevonden: ${JSON.stringify(promoteOnly)})`,
  );
  for (const file of promoteOnly) {
    const src = readFileSync(path.join(workflowDir, file), 'utf8');
    assert.ok(
      !/npm (ci|install|run build)\b/.test(src),
      `${file} promoveert naar een vinomartino-omgeving én is gaan bouwen. Ongetestte ` +
        `inhoud kan nu prod bereiken; geef deze route zijn eigen \`tests\`-poort (LAT-5526).`,
    );
  }
});

test('LAT-5526: de repo-Dockerfile is geen weg naar vinomartino.com', () => {
  const dockerfile = path.join(root, 'Dockerfile');
  assert.ok(existsSync(dockerfile), 'Dockerfile ontbreekt — herijk deze assertie');

  const composeFiles = readdirSync(root).filter((f) =>
    /^docker-compose\..*\.ya?ml$/.test(f),
  );
  assert.ok(composeFiles.length > 0, 'geen compose-files gevonden — detectie klopt niet meer');

  for (const file of composeFiles) {
    const src = readFileSync(path.join(root, file), 'utf8');
    const routesProd = /Host\(`(www\.)?vinomartino\.com`\)/.test(src);
    if (!routesProd) continue;
    assert.ok(
      !/dockerfile:\s*Dockerfile\b/i.test(src) && !/^\s*build:\s*$/m.test(src),
      `${file} routeert vinomartino.com én bouwt uit een Dockerfile. Daarmee is het image ` +
        `wél een weg naar productie en moet die weg zijn eigen testpoort krijgen (LAT-5526).`,
    );
  }
});
