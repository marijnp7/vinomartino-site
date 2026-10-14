// LAT-12594: A/B-modus van lighthouse-templates.mjs (gepaarde runs in één workflow-run).
import assert from 'node:assert/strict';
import { abEnabled, abSummary, AB_TEMPLATES, AB_VARIANTS, TEMPLATES } from './lighthouse-templates.mjs';

assert.equal(abEnabled([], {}), false, 'main meet gewoon');
assert.equal(abEnabled([], { GITHUB_REF_NAME: 'main' }), false);
assert.equal(abEnabled([], { GITHUB_REF_NAME: 'lat12594-ab-fonts' }), true, 'meetbranch zet A/B aan');
assert.equal(abEnabled(['--ab'], {}), true);
for (const t of AB_TEMPLATES) assert.ok(TEMPLATES.some((x) => x.template === t), `${t} bestaat`);
assert.deepEqual(AB_VARIANTS.A, [], 'A is de ongewijzigde pagina');
assert.ok(AB_VARIANTS.B.every((p) => !/cormorant|\.(avif|webp|jpg)/.test(p)), 'B raakt geen kopfont en geen beeld');
const s = abSummary([
  { A: { lcpMs: 3000, cls: 0, observedFcpMs: 400 }, B: { lcpMs: 2500, cls: 0, observedFcpMs: 390 } },
  { A: { lcpMs: 2800, cls: 0, observedFcpMs: 410 }, B: { lcpMs: 2900, cls: 0.01, observedFcpMs: 420 } },
  { A: { lcpMs: 4000, cls: 0, observedFcpMs: 1200 }, B: { lcpMs: 3000, cls: 0, observedFcpMs: 1100 } },
]);
assert.deepEqual(s.perPairDeltaMs, [-500, 100, -1000]);
assert.equal(s.medianPairedDeltaMs, -500);
assert.equal(s.bFasterPairs, 2);
assert.equal(s.lcpMedianA, 3000);
console.log('lat12594-lighthouse-ab: ok');
