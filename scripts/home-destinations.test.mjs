import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectDestinations, readPreviousDestinations } from '../src/lib/home-destinations.ts';

test('selects three unique destinations without changing the CMS candidate order', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const original = [...ids];
  const selected = selectDestinations([...ids, 'a'], 3, [], () => 0.5);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected).size, 3);
  assert.ok(selected.every(id => ids.includes(id)));
  assert.deepEqual(ids, original);
});

test('never repeats the previous three when at least six regions are available', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (const random of [() => 0, () => 0.5, () => 0.999999]) {
    const next = selectDestinations(ids, 3, ['a', 'b', 'c'], random);
    assert.equal(next.length, 3);
    assert.ok(next.every(id => !['a', 'b', 'c'].includes(id)));
  }
});

test('handles empty or small inventories, stale history and duplicate regions', () => {
  assert.deepEqual(selectDestinations([], 3), []);
  assert.deepEqual(selectDestinations(['a', 'a'], 3, ['a', 'removed']), ['a']);
  const selected = selectDestinations(['a', 'b', 'c', 'd'], 3, ['a', 'b', 'c']);
  assert.equal(selected[0], 'd');
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected).size, 3);
  assert.deepEqual(selectDestinations(['a'], 0), []);
});

test('randomness can expose every candidate, including those beyond the old first three', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    selectDestinations(ids, 3, [], () => i / 100).forEach(id => seen.add(id));
  }
  assert.deepEqual([...seen].sort(), ids);
});

test('invalid or unavailable session history never prevents rendering', () => {
  for (const value of [null, 'broken', '{}', 'null', '42']) {
    assert.deepEqual(readPreviousDestinations(value), []);
  }
  assert.deepEqual(readPreviousDestinations('["a",null,7,"b"]'), ['a', 'b']);
});
