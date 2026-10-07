// LAT-12797 — "Wijnhuizen op deze route" toont alleen huizen uit stops_geo (kind=wijnhuis), nooit alle huizen van de streek.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

for (const p of ['src/pages/wijnroutes/[slug].astro', 'src/pages/en/wijnroutes/[slug].astro']) {
  test(`${p}: geen streek-brede wijnhuizen-fallback`, () => {
    const s = read(p);
    assert.doesNotMatch(s, /wijnhuizenByStreek/);
    assert.match(s, /wijnhuizen: routeWijnhuizen,/);
  });
}
