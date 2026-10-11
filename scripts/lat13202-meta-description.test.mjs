// LAT-13202: meta-descriptions mogen niet midden in een woord of na "(" eindigen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const src = readFileSync(new URL('../src/lib/seo.ts', import.meta.url), 'utf8');
const m = src.match(/export function truncateMetaDescription[\s\S]*?\n}\n/);
assert.ok(m, 'truncateMetaDescription ontbreekt in seo.ts');
const js = ts.transpileModule(m[0], { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { truncateMetaDescription } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

test('korte tekst blijft ongewijzigd', () => {
  assert.equal(truncateMetaDescription('  Kort.  '), 'Kort.');
});

test('lange tekst eindigt op woordgrens, niet op "("', () => {
  const live = 'Twee dagen langs de grands crus van de Côte de Nuits, van Gevrey-Chambertin via Vougeot naar Nuits-Saint-Georges, en daarna zuidwaarts naar de Côte de Beaune (Pommard, Volnay, Meursault).';
  const out = truncateMetaDescription(live);
  assert.ok(out.length <= 155, `lengte ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(!/[(\s,;:]…$/.test(out), out);
  assert.ok(live.startsWith(out.slice(0, -1)), 'afkapping valt op een woordgrens');
  assert.ok(live[out.length - 1] === ' ' || live[out.length - 1] === undefined || /[\s(]/.test(live[out.length - 1]), out);
});

test('seo.ts kapt nergens meer hard af op 155', () => {
  assert.ok(!/description\.slice\(0, 155\)/.test(src));
});
