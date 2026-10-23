// LAT-14740 — EN-wijnhuisadres komt uit wijnhuizen_translations.address; de gate vindt NL-namen in #bezoek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findNlNamesInBezoek } from './check-en-wijnhuis-adres.mjs';

const LOADER = readFileSync(new URL('../src/lib/wijnhuizen.ts', import.meta.url), 'utf8');

test('address zit in de vertaalbare wijnhuisvelden (scalar overlay, NL-fallback)', () => {
  assert.match(LOADER, /const WIJNHUIZEN_TRANSLATABLE = \[[^\]]*'address'[^\]]*\];/);
  assert.doesNotMatch(LOADER, /WIJNHUIZEN_PORTRET_TRANSLATABLE = \[[^\]]*'address'/);
});

const blok = (adres) => `<main><p>Toscane elders</p><section class="wp" id="bezoek"><dl><dt>Address</dt><dd>${adres} · <a href="#">Google Maps</a></dd></dl><script>const x="Italië"</script></section></main>`;

test('NL-naam in het adres wordt gevonden, ook met entity-encoding', () => {
  assert.deepEqual(findNlNamesInBezoek(blok('Groot Constantia Rd, Constantia, Kaapstad 7806')), ['Kaapstad']);
  assert.deepEqual(findNlNamesInBezoek(blok('Via Ferrere Sottano 33, 12050 Treiso (CN), Itali&#235;')), ['Italië']);
});

test('EN-adres, tekst buiten #bezoek en scripts tellen niet', () => {
  assert.deepEqual(findNlNamesInBezoek(blok('Groot Constantia Rd, Constantia, Cape Town 7806')), []);
  assert.deepEqual(findNlNamesInBezoek(blok('Via San Leolino 89, 50022 Panzano in Chianti (FI), Tuscany')), []);
  assert.deepEqual(findNlNamesInBezoek('<p>Kaapstad</p>'), []);
});

test('geen deelwoord-treffers', () => {
  assert.deepEqual(findNlNamesInBezoek(blok('Bourgogne-Franche-Comté, Toscaneweg 1')), []);
});
