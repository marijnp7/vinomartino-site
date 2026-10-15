// LAT-12594 (15-10 23:00): variant B voegt alleen een low-priority preload van het tweede font toe.
import assert from 'node:assert/strict';
import { transformHtml, FONT2 } from './lat12594-ab-proxy.mjs';
import { abLocalBases, AB_TEMPLATES } from './lighthouse-templates.mjs';

const pre = '<link rel="preload" href="/fonts/cormorant-garamond-latin-abcaa8b4.woff2" as="font" type="font/woff2" crossorigin>';
const html = `<head>${pre}<link rel="stylesheet" href="/_astro/_streek_.A.css"></head><body><img src="/x.avif"></body>`;
const t = transformHtml(html);
assert.equal(t.html.replace(t.inserted, ''), html, 'alleen de preload erbij, verder byte-gelijk');
assert.match(t.inserted, new RegExp(`href="${FONT2}".*fetchpriority="low"`));
assert.equal(t.html.indexOf(t.inserted), t.html.indexOf(pre) + pre.length, 'direct na de eerste preload');
assert.equal(transformHtml(t.html).inserted, 'none', 'idempotent');
assert.equal(transformHtml('<head></head>').inserted, 'none');
assert.deepEqual(AB_TEMPLATES, ['streek', 'artikel-grower', 'artikel-bourgogne', 'home']);
assert.equal(abLocalBases({}), null);
console.log('lat12594-ab-proxy: ok');
