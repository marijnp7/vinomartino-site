import assert from 'node:assert/strict';
import test from 'node:test';
import { addDimensions } from './optimize-images.mjs';
import { imgViolations } from './check-img-dimensions.mjs';

const info = new Map([['/images/a.jpg', { widths: [640], srcW: 1600, srcH: 1000 }]]);

test('addDimensions zet width/height uit de bron', () => {
  const r = addDimensions('<img src="/images/a.jpg" alt="x">', info);
  assert.equal(r.added, 1);
  assert.match(r.html, /width="1600" height="1000"/);
});

test('addDimensions leidt height af uit bestaande width', () => {
  const r = addDimensions('<img src="/images/a.jpg" width="320" alt="x">', info);
  assert.match(r.html, /width="320"/);
  assert.match(r.html, /height="200"/);
});

test('addDimensions laat complete tags en onbekende bronnen staan', () => {
  const full = '<img src="/images/a.jpg" width="1" height="1">';
  assert.equal(addDimensions(full, info).added, 0);
  assert.equal(addDimensions('<img src="https://x/y.jpg">', info).added, 0);
});

test('check faalt op img zonder afmetingen, slaagt met width+height of aspect-ratio of exempt', () => {
  assert.equal(imgViolations('<img src="/a.jpg" alt="">').length, 1);
  assert.equal(imgViolations('<img src="/a.jpg" width="10">').length, 1);
  assert.equal(imgViolations('<img src="/a.jpg" width="10" height="5">').length, 0);
  assert.equal(imgViolations('<img src="/a.jpg" style="aspect-ratio:3/2">').length, 0);
  assert.equal(imgViolations('<img src="/a.jpg" data-dim-exempt>').length, 0);
});
