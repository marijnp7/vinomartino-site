// LAT-12046 — related-kaarten mogen niet linken naar artikelen die de build niet genereert.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isRelatedArticleLive } from '../src/lib/related-article-live.ts';

const NOW = Date.parse('2026-09-29T14:00:00Z');

test('toekomstige pub_date is niet live', () => {
  assert.equal(isRelatedArticleLive({ status: 'published', pub_date: '2026-09-30' }, NOW), false);
  assert.equal(isRelatedArticleLive({ status: 'published', pub_date: '2026-10-08T00:00:00' }, NOW), false);
});
test('verleden of vandaag pub_date is live, vanzelf zodra de datum bereikt is', () => {
  assert.equal(isRelatedArticleLive({ status: 'published', pub_date: '2026-09-29' }, NOW), true);
  assert.equal(isRelatedArticleLive({ status: 'published', pub_date: '2026-10-08' }, Date.parse('2026-10-08T00:00:01Z')), true);
});
test('zonder pub_date of status: fail-open; niet-published valt af', () => {
  assert.equal(isRelatedArticleLive({ slug: 'x' }, NOW), true);
  assert.equal(isRelatedArticleLive({ status: 'published', pub_date: null }, NOW), true);
  assert.equal(isRelatedArticleLive({ status: 'draft' }, NOW), false);
});
test('alle vier de loaders passen de guard toe en halen pub_date+status op', () => {
  for (const f of ['streken', 'wijnhuizen', 'routes', 'landen']) {
    const src = readFileSync(new URL(`../src/lib/${f}.ts`, import.meta.url), 'utf8');
    assert.match(src, /isRelatedArticleLive\(inner\)/, `${f}: guard ontbreekt`);
    assert.match(src, /related_articles\.articles_id\.pub_date,related_articles\.articles_id\.status/, `${f}: velden ontbreken`);
  }
});
