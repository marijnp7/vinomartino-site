import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRouteBody } from '../src/lib/route-days.ts';

for (const [word, label] of [['Dag', 'Dag'], ['Day', 'Day']]) {
  test(`${word}: preserve introduction, all day content, departure and sources separately`, () => {
    const html = `<p>Introduction</p><h2 id="first">${word} 1: Arrival</h2><p>Cellar experience</p><h2 id="second">${word} 2: Hills</h2><figure>Photo</figure><h2 id="departure">${word} 3: Departure</h2><p>Airport</p><h2 id="sources">Sources</h2><p>Evidence</p>`;
    const result = splitRouteBody(html);
    assert.equal(result.hasDays, true);
    assert.deepEqual(result.days.map(d => d.n), [1, 2, 3]);
    assert.deepEqual(result.days.map(d => d.label), [`${label} 1`, `${label} 2`, `${label} 3`]);
    assert.deepEqual(result.segments.map(s => s.kind), ['prose', 'day', 'day', 'day', 'prose']);
    assert.match(result.segments[1].html, /Cellar experience/);
    assert.match(result.segments[2].html, /<figure>Photo/);
    assert.match(result.segments[3].html, /Airport/);
    assert.match(result.segments[4].html, /Evidence/);
    assert.equal(result.days[0].anchor, 'first');
  });
}
test('non-day headings remain intact', () => {
  const result = splitRouteBody('<h2 id="route">The route</h2><p>Original content</p>');
  assert.equal(result.hasDays, false);
  assert.equal(result.segments[0].html, '<h2 id="route">The route</h2><p>Original content</p>');
});
