// LAT-12594 (K2): the streek document must not carry the country locator paths or the GeoJSON
// boundary inline; both are static files fetched off the critical path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('locator renders as a lazy <img> with alt, detail preview stays inline', () => {
  const c = src('src/components/WineAreaPreview.astro');
  assert.match(c, /<img class="wine-area-preview" src=\{locatorSvgUrl\([^)]*\)\} alt=\{label\} loading="lazy"/);
  assert.match(c, /<svg class="wine-area-preview" viewBox=\{geography\.detail\.viewBox\} role="img" aria-label=\{label\}/);
  assert.doesNotMatch(c, /paths\.map/);
});

test('streekkaart data references the area by URL and fetches it at map init', () => {
  const c = src('src/components/StreekKaart.astro');
  assert.doesNotMatch(c, /area:\s*geography\?\.feature/);
  assert.match(c, /areaUrl: geography \? areaJsonUrl\(slug\) : null/);
  assert.match(c, /fetch\(data\.areaUrl\)/);
});

test('static endpoints exist for every wine geography', () => {
  for (const p of ['src/pages/geo/locator/[slug].svg.ts', 'src/pages/geo/area/[slug].json.ts']) {
    assert.ok(existsSync(new URL('../' + p, import.meta.url)), p);
    assert.match(src(p), /getStaticPaths = \(\) => wineGeographySlugs\(\)/);
  }
  assert.match(src('src/lib/wine-area-svg.ts'), /fill="#5A1A1F" fill-opacity="\.26"/);
});
