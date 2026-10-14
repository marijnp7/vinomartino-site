// LAT-13443: de B-transformatie raakt alleen body-@font-face en voegt de na-load-loader toe.
import assert from 'node:assert/strict';
import { stripBodyFaces, transformHtml } from './lat12594-ab-proxy.mjs';
import { abLocalBases } from './lighthouse-templates.mjs';

const css = "@font-face{font-family:Cormorant Garamond;src:url(/fonts/c.woff2)}@font-face{font-family:'Inter';src:url(/fonts/inter-latin.woff2)}@font-face{font-family:JetBrains Mono;src:url(/fonts/j.woff2)}@font-face{font-family:'Source Serif 4';src:url(/fonts/s.woff2)}body{font-family:Inter,sans-serif}";
const removed = [];
const out = stripBodyFaces(css, removed);
assert.equal(removed.length, 3, 'drie body-families eruit');
assert.match(out, /Cormorant Garamond/, 'kopfont blijft');
assert.match(out, /body\{font-family:Inter/, 'gewone regels blijven');
const h = transformHtml('<head><link rel="preload" href="/fonts/cormorant-garamond-latin-abcaa8b4.woff2" as="font"><style>' + css + '</style></head>', []);
assert.equal(h.inserted, 'after-cormorant-preload');
assert.match(h.html, /cormorant[^>]*><script>addEventListener\('load'/);
assert.match(h.html, /<noscript><link rel="stylesheet" href="\/fonts\/body-fonts.css"/);
assert.doesNotMatch(h.html, /inter-latin\.woff2/);
assert.equal(abLocalBases({}), null);
assert.deepEqual(abLocalBases({ AB_BASE_A: 'http://127.0.0.1:4401/', AB_BASE_B: 'http://127.0.0.1:4402' }), { A: 'http://127.0.0.1:4401', B: 'http://127.0.0.1:4402' });
console.log('lat12594-ab-proxy: ok');
