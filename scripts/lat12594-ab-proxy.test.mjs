// LAT-12594 (16-10): variant B haalt alleen de locator-SVG en de GeoJSON-grens uit het streekdocument (PR #581).
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { transformHtml, assets } from './lat12594-ab-proxy.mjs';
import { abLocalBases, AB_TEMPLATES } from './lighthouse-templates.mjs';

// Fixture: live streek-HTML (curl https://vinomartino.com/streken/langhe-piemonte/) als argv[2].
const src = process.argv[2];
if (!src || !existsSync(src)) { console.log('lat12594-ab-proxy: skip (geen streek-HTML als argument)'); process.exit(0); }
const html = readFileSync(src, 'utf8');
const t = transformHtml(html);
assert.notEqual(t.inserted, 'none');
assert.ok(Buffer.byteLength(t.html) < Buffer.byteLength(html) - 50000, `minstens 50 KB minder raw (${Buffer.byteLength(html)} -> ${Buffer.byteLength(t.html)})`);
assert.match(t.html, /<img class="wine-area-preview" src="\/geo\/locator\/langhe-piemonte\.svg" alt="Ligging van Langhe" loading="lazy"/);
assert.match(t.html, /"areaUrl":"\/geo\/area\/langhe-piemonte\.json"/);
assert.match(t.html, /<svg class="wine-area-preview" viewBox="-100/, 'detailpreview blijft inline');
assert.ok(assets.get('/geo/locator/langhe-piemonte.svg').body.toString().startsWith('<svg'));
assert.equal(JSON.parse(assets.get('/geo/area/langhe-piemonte.json').body).type, 'Feature');
assert.equal(t.html.replace(/<img class="wine-area-preview"[^>]*>/, '').replace(/"areaUrl":"[^"]*",/, '').length > 0, true);
assert.equal(transformHtml('<head></head>').inserted, 'none');
assert.deepEqual(AB_TEMPLATES, ['streek', 'artikel-grower', 'artikel-bourgogne', 'home']);
assert.equal(abLocalBases({}), null);
console.log('lat12594-ab-proxy: ok', Buffer.byteLength(html), '->', Buffer.byteLength(t.html));
