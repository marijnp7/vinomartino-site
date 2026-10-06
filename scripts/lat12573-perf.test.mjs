// LAT-12573 — fonts self-hosted, beeldcache, Stay22 na load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('SiteLayout vraagt geen Google Fonts meer en importeert fonts.css', () => {
  const s = read('src/layouts/SiteLayout.astro');
  assert.doesNotMatch(s, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(s, /import '\.\.\/styles\/fonts\.css'/);
});

test('elk font-bestand uit fonts.css bestaat in public/fonts en elke preload wijst naar zo\'n bestand', () => {
  const css = read('src/styles/fonts.css');
  const files = [...css.matchAll(/url\((\/fonts\/[^)]+\.woff2)\)/g)].map((m) => m[1]);
  assert.ok(files.length > 0);
  for (const f of new Set(files)) assert.ok(existsSync(path.join(root, 'public', f)), `${f} ontbreekt`);
  assert.doesNotMatch(css, /https?:\/\//);
  const layout = read('src/layouts/SiteLayout.astro');
  const preloads = [...layout.matchAll(/rel="preload" href="(\/fonts\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(preloads.length >= 2 && preloads.length <= 5);
  for (const f of preloads) assert.ok(files.includes(f), `${f} staat niet in fonts.css`);
});

test('fonts.css gebruikt font-display swap voor elke face', () => {
  const css = read('src/styles/fonts.css');
  const faces = css.match(/@font-face/g).length;
  assert.equal(css.match(/font-display: swap/g).length, faces);
});

test('nginx cachet /fonts (immutable) en /images (30 dagen, niet immutable)', () => {
  const conf = read('nginx-prod.conf');
  const block = (loc) => { const i = conf.indexOf(`location ${loc} {`); assert.notEqual(i, -1, loc); return conf.slice(i, conf.indexOf('\n    }', i)); };
  assert.match(block('/fonts/'), /immutable/);
  const img = block('/images/');
  assert.match(img, /max-age=2592000/);
  assert.doesNotMatch(img, /immutable/);
});

test('Stay22-loader wacht op load + idle', () => {
  const s = read('src/layouts/SiteLayout.astro');
  const i = s.indexOf('scripts.stay22.com/letmeallez.js');
  const loader = s.slice(s.lastIndexOf('<script is:inline>', i), i);
  assert.match(loader, /requestIdleCallback/);
  assert.match(loader, /addEventListener\('load'/);
  assert.match(loader, /lmaID: '6a22c22f543a519eadd2cd2e'/);
});
