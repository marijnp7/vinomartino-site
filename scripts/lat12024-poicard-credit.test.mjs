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

const { adaptationNoteFor, fileIdFromAccommodatiePath, getImageCredit } = await import('../src/lib/image-credits.ts');
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('fileIdFromAccommodatiePath haalt het UUID uit het self-hosted pad', () => {
  const id = 'ca01bf9e-e3d9-402d-8c23-46d9160a33c6';
  assert.equal(fileIdFromAccommodatiePath(`/images/accommodaties/${id}.jpg`), id);
  assert.equal(fileIdFromAccommodatiePath(`/images/accommodaties/${id.toUpperCase()}.webp`), id);
  assert.equal(fileIdFromAccommodatiePath('/images/streken/foo.jpg'), null);
  assert.equal(fileIdFromAccommodatiePath(null), null);
  assert.equal(getImageCredit(fileIdFromAccommodatiePath(`/images/accommodaties/${id}.jpg`))?.licenseLabel, 'CC BY-ND 2.0');
});

test('adaptationNoteFor: NL en EN, onbekende locale valt terug op EN', () => {
  assert.equal(adaptationNoteFor('nl'), 'kleur en uitsnede bewerkt');
  assert.equal(adaptationNoteFor('en'), 'colour-graded and cropped');
  assert.equal(adaptationNoteFor('de'), 'colour-graded and cropped');
});

test('PoiCard rendert de credit uit getImageCredit, met licentielabel per locale en bewerkingsaanduiding', () => {
  const poi = src('../src/components/PoiCard.astro');
  assert.match(poi, /getImageCredit\(fotoId \?\? fileIdFromAccommodatiePath\(foto\)\)/);
  assert.match(poi, /licenseLabelFor\(credit\.licenseLabel, locale\)/);
  assert.match(poi, /credit\.adapted && .*adaptationNoteFor\(locale\)/);
  assert.match(poi, /rel="license noopener"/);
});

test('hideMediaWhenEmpty staat aan voor overnachten (StreekKaart en AccommodatieKaart)', () => {
  assert.match(src('../src/components/StreekKaart.astro'), /hideMediaWhenEmpty: it\.category === 'wijnhuizen' \|\| it\.category === 'overnachten'/);
  assert.match(src('../src/components/AccommodatieKaart.astro'), /hideMediaWhenEmpty: true/);
});
