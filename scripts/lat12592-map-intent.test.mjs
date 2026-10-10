// LAT-12592 — streek/route: kaart-init (leaflet + maplibre) pas na een gebruikersactie, niet in de laadfase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('whenUserIntent luistert op echte gebruikersacties en kent een #anker-uitweg', () => {
  const s = read('src/lib/map-base.ts');
  assert.match(s, /export function whenUserIntent/);
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll']) assert.match(s, new RegExp(`'${ev}'`));
  assert.match(s, /location\.hash/);
});

for (const [file, calls] of [
  ['src/components/StreekKaart.astro', 1],
  ['src/components/RouteGeoMap.astro', 1],
]) {
  test(`${file}: elke init wacht op whenUserIntent vóór loadLeaflet`, () => {
    const s = read(file);
    assert.match(s, /import \{ addBaseLayer, whenUserIntent \}/);
    const gated = s.match(/await whenUserIntent\(\);\s*\n\s*const L = await loadLeaflet\(\)/g) ?? [];
    assert.equal(gated.length, calls);
    assert.equal((s.match(/const L = await loadLeaflet\(\)/g) ?? []).length, calls);
  });
}
