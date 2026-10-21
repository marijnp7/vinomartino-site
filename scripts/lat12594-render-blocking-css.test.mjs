// LAT-12594: kaart-CSS mag niet render-blocking in <head> landen, en latin-ext-fonts geen late swap-shift geven.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// fonts.css = Cormorant (kritiek pad); body-fonts.css = Inter/Mono/Source Serif 4, geladen na window.load.
const fontCss = () => readFileSync('src/styles/fonts.css', 'utf8') + readFileSync('public/fonts/body-fonts.css', 'utf8');

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
  const css = fontCss();
  const faces = css.match(/@font-face\s*\{[^}]*\}/g);
  const ext = faces.filter((b) => b.includes('latin-ext'));
  assert.ok(ext.length > 0);
  for (const b of ext) assert.match(b, /font-display: optional;/);
  // LAT-14062: Source Serif 4 laadt pas na window.load; swap liet de lopende tekst dan
  // herbreken (CLS 0,102 op /accommodaties/ NL). optional = geen late wissel.
  const late = (b) => b.includes("'Source Serif 4'");
  for (const b of faces.filter((b) => !b.includes('latin-ext') && !late(b))) assert.match(b, /font-display: swap;/);
  for (const b of faces.filter(late)) assert.match(b, /font-display: optional;/);
});

test('Source Serif 4-bestanden bestaan en zijn geïnstancet (< 60 KB, opsz vastgezet)', async () => {
  const { statSync } = await import('node:fs');
  const css = fontCss();
  const files = [...new Set(css.match(/source-serif-4-[a-z-]+-[0-9a-f]{8}\.woff2/g))];
  assert.ok(files.length >= 2);
  for (const f of files) {
    const size = statSync(join('public/fonts', f)).size;
    assert.ok(size < 60_000, `${f} is ${size} B; variabele opsz-as terug? zie LAT-12594`);
  }
});
