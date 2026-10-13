// LAT-12594: de filterformulieren op /wijnhuizen/ en /wijnroutes/ mogen niet server-side
// `hidden` zijn en pas door JS verschijnen; dat schoof de lijst omlaag (lab-CLS 0,167 / 0,195).
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const cases = [
  ['src/components/WijnhuizenIndex.astro', /<form class="wh-filters"[^>]*>/, '.wh-filters'],
  ['src/components/WijnroutesHub.astro', /<form class="wk-form"[^>]*>/, '.wk-form'],
  ['src/components/WijnroutesHub.astro', /<div class="wk-view"[^>]*>/, '.wk-view'],
];

for (const [file, re, sel] of cases) {
  test(`${file}: ${sel} niet server-side hidden`, () => {
    const src = readFileSync(file, 'utf8');
    const tag = src.match(re);
    assert.ok(tag, `${sel} niet gevonden`);
    assert.doesNotMatch(tag[0], /\shidden[\s>]/, `${sel} staat weer op hidden: CLS-regressie`);
  });
  test(`${file}: noscript verbergt ${sel}`, () => {
    const src = readFileSync(file, 'utf8');
    assert.match(src, new RegExp(`<noscript><style is:inline>[^<]*\\${sel}[^<]*display: none`));
  });
}
