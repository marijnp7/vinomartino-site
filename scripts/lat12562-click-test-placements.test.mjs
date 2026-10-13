// LAT-12562 — testklikken tellen niet mee in het interne klikdashboard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isTestClick } from '../src/lib/click-test-placements.ts';

test('testplacements worden herkend, echte en lege niet', () => {
  assert.equal(isTestClick({ placement: 'lat12562-clicktime' }), true);
  assert.equal(isTestClick({ placement: 'lat12562-testklik' }), true);
  assert.equal(isTestClick({ placement: 'body-link' }), false);
  assert.equal(isTestClick({ placement: '' }), false);
  assert.equal(isTestClick({ placement: null }), false);
});

test('clicks-dashboard filtert testklikken', () => {
  const src = readFileSync(new URL('../src/lib/clicks-dashboard.ts', import.meta.url), 'utf8');
  assert.match(src, /\.filter\(\(r\) => !isTestClick\(r\)\)/);
});
