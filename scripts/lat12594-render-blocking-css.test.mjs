// LAT-12594: kaart-CSS mag niet render-blocking in <head> landen, en latin-ext-fonts geen late swap-shift geven.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : /\.(astro|ts|mjs)$/.test(e.name) ? [join(d, e.name)] : []);

test('geen statische of dynamische leaflet/maplibre-CSS-import buiten map-base ?url', () => {
  for (const f of walk('src')) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/import\s*\(?\s*['"]((?:leaflet|maplibre-gl)\/dist\/[^'"]+\.css)(\?url)?['"]/g)) {
      assert.ok(m[2] === '?url', `${f}: ${m[1]} zonder ?url wordt render-blocking`);
    }
  }
});

test('leaflet wordt alleen via loadLeaflet() geladen', () => {
  for (const f of walk('src')) {
    if (f.endsWith('map-base.ts')) continue;
    assert.ok(!/import\(\s*['"]leaflet['"]\s*\)/.test(readFileSync(f, 'utf8')), `${f}: gebruik loadLeaflet()`);
  }
});

test('latin-ext-faces staan op font-display: optional', () => {
  const css = readFileSync('src/styles/fonts.css', 'utf8');
  const faces = css.match(/@font-face\s*\{[^}]*\}/g);
  const ext = faces.filter((b) => b.includes('latin-ext'));
  assert.ok(ext.length > 0);
  for (const b of ext) assert.match(b, /font-display: optional;/);
  for (const b of faces.filter((b) => !b.includes('latin-ext'))) assert.match(b, /font-display: swap;/);
});
