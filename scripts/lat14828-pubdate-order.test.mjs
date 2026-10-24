// LAT-14828 — artikelen zonder pub_date mogen nooit bovenaan homepage, feed of
// overzicht staan, en een vergeten featured-vinkje bevriest de spotlight hooguit 14 dagen.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { sortByPubDateNullsLast, slugsWithoutPubDate, pickSpotlight } = await import('../src/lib/article-order.ts');

const NOW = new Date('2026-10-24T12:00:00Z');
const art = (slug, pubDate, extra = {}) => ({ slug, pubDate, updatedAt: null, featured: false, ...extra });
// Zo leverde Directus het met sort=-pub_date: NULL eerst.
const directusOrder = [
  art('trentino-waar-slapen', ''),
  art('toscane-in-drie-dagen', ''),
  art('bourgogne-nieuw', '2026-10-22'),
  art('toscane-nieuw', '2026-10-20'),
  art('oud', '2026-03-01'),
];

test('zonder pub_date onderaan, nieuwste pub_date eerst', () => {
  const sorted = sortByPubDateNullsLast(directusOrder).map((a) => a.slug);
  assert.deepEqual(sorted, ['bourgogne-nieuw', 'toscane-nieuw', 'oud', 'trentino-waar-slapen', 'toscane-in-drie-dagen']);
});

test('build kan de slugs zonder pub_date noemen', () => {
  assert.deepEqual(slugsWithoutPubDate(directusOrder), ['trentino-waar-slapen', 'toscane-in-drie-dagen']);
});

test('spotlight is het nieuwste artikel, nooit een zonder pub_date', () => {
  assert.equal(pickSpotlight(directusOrder, NOW).slug, 'bourgogne-nieuw');
  const featuredUndated = directusOrder.map((a) => (a.slug === 'trentino-waar-slapen' ? { ...a, featured: true, updatedAt: '2026-10-23' } : a));
  assert.equal(pickSpotlight(featuredUndated, NOW).slug, 'bourgogne-nieuw');
});

test('vers featured-artikel wint binnen 14 dagen', () => {
  const list = directusOrder.map((a) => (a.slug === 'oud' ? { ...a, featured: true, updatedAt: '2026-10-15T08:00:00Z' } : a));
  assert.equal(pickSpotlight(list, NOW).slug, 'oud');
});

test('featured dat 14+ dagen niet is bijgewerkt valt terug op het nieuwste', () => {
  const list = directusOrder.map((a) => (a.slug === 'oud' ? { ...a, featured: true, updatedAt: '2026-09-01' } : a));
  assert.equal(pickSpotlight(list, NOW).slug, 'bourgogne-nieuw');
});

test('loader verzint geen datum meer en sorteert opnieuw', () => {
  const src = readFileSync(new URL('../src/lib/articles.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /stableFallbackPubDate\(/);
  assert.match(src, /sortByPubDateNullsLast\(items\)/);
  const home = readFileSync(new URL('../src/components/HomeContent.astro', import.meta.url), 'utf8');
  assert.match(home, /pickSpotlight\(articles\)/);
  assert.doesNotMatch(home, /articles\.find\(\(a\) => a\.featured\)/);
});
