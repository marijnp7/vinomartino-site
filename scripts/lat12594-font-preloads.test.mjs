// LAT-12594: font-preloads in <head> concurreren met de LCP-afbeelding. Alleen de kopletter
// (Cormorant Garamond normal, latin) wordt gepreload; nieuwe preloads vragen een labmeting.
import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const layout = readFileSync('src/layouts/SiteLayout.astro', 'utf8');
const preloads = [...layout.matchAll(/<link rel="preload" href="([^"]+)" as="font"/g)].map((m) => m[1]);

test('precies één font-preload', () => {
  assert.deepEqual(preloads, ['/fonts/cormorant-garamond-latin-abcaa8b4.woff2']);
});

test('gepreload font bestaat en is de latin normal-face in fonts.css', () => {
  const css = readFileSync('src/styles/fonts.css', 'utf8');
  for (const href of preloads) {
    assert.ok(existsSync(`public${href}`), `${href} ontbreekt in public/`);
    const face = css.split('@font-face').find((b) => b.includes(href) && /font-style:\s*normal/.test(b));
    assert.ok(face, `${href} is geen normal-face in fonts.css`);
  }
});
