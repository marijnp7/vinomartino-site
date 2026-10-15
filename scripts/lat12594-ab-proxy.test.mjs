// LAT-12594 (15-10): variant B voegt alleen de /_astro/*.css-links samen tot één extern bestand.
import assert from 'node:assert/strict';
import { transformHtml, mergedPath } from './lat12594-ab-proxy.mjs';
import { abLocalBases, AB_TEMPLATES } from './lighthouse-templates.mjs';

const html = '<head><link rel="preload" href="/fonts/c.woff2" as="font"><link rel="stylesheet" href="/_astro/_streek_.A.css">\n<link rel="stylesheet" href="/_astro/_slug_.B.css"><noscript><link rel="stylesheet" href="/fonts/body-fonts.css"></noscript></head><body><img src="/x.avif"></body>';
const merged = new Map();
const t = transformHtml(html, merged);
assert.deepEqual(t.hrefs, ['/_astro/_streek_.A.css', '/_astro/_slug_.B.css']);
assert.equal(t.inserted, mergedPath(t.hrefs));
assert.equal((t.html.match(/rel="stylesheet" href="\/_astro\//g) || []).length, 1, 'één astro-stylesheet over');
assert.match(t.html, /body-fonts\.css/, 'noscript-fallback blijft');
assert.match(t.html, /preload/, 'preload blijft');
assert.match(t.html, /x\.avif/, 'beelden ongewijzigd');
assert.deepEqual(merged.get(t.inserted), t.hrefs);
assert.equal(transformHtml('<head><link rel="stylesheet" href="/_astro/a.css"></head>', new Map()).inserted, 'none');
assert.deepEqual(AB_TEMPLATES, ['streek', 'artikel-grower']);
assert.equal(abLocalBases({}), null);
console.log('lat12594-ab-proxy: ok');
