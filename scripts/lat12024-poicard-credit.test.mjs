// LAT-12024 — PoiCard toont de verplichte CC-credit (sleutel: Directus file-UUID,
// afgeleid uit `/images/accommodaties/<uuid>.<ext>`) en overnachten-kaarten
// verbergen het beeldvlak zonder foto (LAT-2174). Rendering draait niet onder
// `node --test`; we toetsen de pure helpers en de bronbedrading.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

// getImageCredit leest de DAM via loadDamFileMeta (LAT-12054): stub Directus, geen netwerk in CI.
const RISCAL = '78956639-bb76-4851-9a74-b43c2fab1b77';
const MAYOR = '680c8deb-7ef4-4e68-990e-98c333170969';
const PLAIN = 'ca01bf9e-e3d9-402d-8c23-46d9160a33c6';
const DAM_ROWS = [
  { id: RISCAL, licentie: 'cc-by-sa-4.0', herkomst: 'Foto: Roderich Kahn / Wikimedia Commons, CC BY-SA 4.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Riscal.jpg' },
  { id: MAYOR, licentie: 'cc-by-sa-3.0', herkomst: 'Foto: Vanbasten 23 / Wikimedia Commons, CC BY-SA 3.0, via Wikimedia Commons. Bron: https://commons.wikimedia.org/wiki/File:Mayor.jpg' },
  { id: PLAIN, licentie: 'cc-by-2.0', herkomst: null },
];
process.env.DIRECTUS_URL = 'http://directus.test';
process.env.DIRECTUS_TOKEN = 'test-token';
globalThis.fetch = async () =>
  new Response(JSON.stringify({ data: DAM_ROWS }), { status: 200, headers: { 'content-type': 'application/json' } });

const { adaptationNoteFor, fileIdFromAccommodatiePath, getImageCredit } = await import('../src/lib/image-credits.ts');
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('fileIdFromAccommodatiePath haalt het UUID uit het self-hosted pad', async () => {
  const id = PLAIN;
  assert.equal(fileIdFromAccommodatiePath(`/images/accommodaties/${id}.jpg`), id);
  assert.equal(fileIdFromAccommodatiePath(`/images/accommodaties/${id.toUpperCase()}.webp`), id);
  assert.equal(fileIdFromAccommodatiePath('/images/streken/foo.jpg'), null);
  assert.equal(fileIdFromAccommodatiePath(null), null);
  assert.equal((await getImageCredit(fileIdFromAccommodatiePath(`/images/accommodaties/${id}.jpg`)))?.licenseLabel, 'CC BY 2.0');
  assert.equal(await getImageCredit('00000000-0000-0000-0000-000000000000'), null);
});

test('adaptationNoteFor: NL en EN, onbekende locale valt terug op EN', () => {
  assert.equal(adaptationNoteFor('nl'), 'kleur en uitsnede bewerkt');
  assert.equal(adaptationNoteFor('en'), 'colour-graded and cropped');
  assert.equal(adaptationNoteFor('de'), 'colour-graded and cropped');
});

test('PoiCard rendert de credit uit getImageCredit, met licentielabel per locale en bewerkingsaanduiding', () => {
  const poi = src('../src/components/PoiCard.astro');
  assert.match(poi, /await getImageCredit\(fotoId \?\? fileIdFromAccommodatiePath\(foto\), \{ adapted: true \}\)/);
  assert.match(poi, /licenseLabelFor\(credit\.licenseLabel, locale\)/);
  assert.match(poi, /credit\.adapted && .*adaptationNoteFor\(locale\)/);
  assert.match(poi, /rel="license noopener"/);
});

test('hideMediaWhenEmpty staat aan voor overnachten (StreekKaart en AccommodatieKaart)', () => {
  assert.match(src('../src/components/StreekKaart.astro'), /hideMediaWhenEmpty: it\.category === 'wijnhuizen' \|\| it\.category === 'overnachten'/);
  assert.match(src('../src/components/AccommodatieKaart.astro'), /hideMediaWhenEmpty: true/);
});

test('de twee Rioja-hotelfoto\'s hebben een CC BY-SA-credit met bewerkingsaanduiding', async () => {
  const riscal = await getImageCredit(RISCAL, { adapted: true });
  assert.equal(riscal?.author, '© Roderich Kahn / Wikimedia Commons');
  assert.equal(riscal?.licenseLabel, 'CC BY-SA 4.0');
  assert.equal(riscal?.adapted, true);
  const mayor = await getImageCredit(MAYOR, { adapted: true });
  assert.equal(mayor?.author, '© Vanbasten 23 / Wikimedia Commons');
  assert.equal(mayor?.licenseLabel, 'CC BY-SA 3.0');
  assert.equal(mayor?.adapted, true);
});
