// LAT-12594 — regressietest: de zoekdialoog op /en/ haalde altijd de NL-index op
// (/search-index.json: NL-titels, 0 /en/-URL's) en /en/search-index.json gaf 404.
// Bewaakt statisch: (1) er is een EN-endpoint; (2) de bouwer gebruikt per locale
// dezelfde loaders als de pagina's en prefixt EN-URL's met /en; (3) de dialoog
// fetcht de index uit data-index-url en heeft geen hardcoded NL-copy in het script.
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('EN search-index endpoint bestaat en bouwt met locale en', () => {
  assert.ok(existsSync(new URL('../src/pages/en/search-index.json.ts', import.meta.url)));
  assert.match(read('src/pages/en/search-index.json.ts'), /buildSearchIndex\('en'\)/);
});

test('bouwer laadt per locale en prefixt EN-URLs', () => {
  const src = read('src/lib/search-index.ts');
  for (const fn of ['loadArticles', 'loadLanden', 'loadStreken', 'loadWijnhuizen', 'loadRoutes', 'loadUiStrings']) {
    assert.match(src, new RegExp(`${fn}\\(locale\\)`), `${fn} zonder locale`);
  }
  for (const seg of ['artikelen', 'landen', 'streken', 'wijnhuizen', 'wijnroutes']) {
    assert.match(src, new RegExp('url: `\\$\\{p\\}/' + seg + '/'), `${seg}-URL zonder locale-prefix`);
  }
});

test('dialoog fetcht de locale-index en lekt geen NL-copy op EN', () => {
  const src = read('src/components/SearchDialog.astro');
  assert.match(src, /isEn \? '\/en\/search-index\.json' : '\/search-index\.json'/);
  assert.match(src, /data-index-url=\{indexUrl\}/);
  const script = src.slice(src.indexOf('<script>'));
  assert.doesNotMatch(script, /fetch\('\/search-index\.json'\)/);
  assert.doesNotMatch(script, /Zoekindex laden|Geen resultaten|Begin met typen/);
});
