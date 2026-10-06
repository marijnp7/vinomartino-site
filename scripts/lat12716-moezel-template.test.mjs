// LAT-12716 — Moezelpagina-template: Etappes-telling (oude opbouw), disclosure per sectie, h2 in mega-menu, reisverhaal-mount.
// Hero-CTA's en Route info vallen onder LAT-12710 (RouteHero / nieuwe opbouw).
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const ROUTE = read('src/components/RouteDetail.astro');

test('Etappes telt geen wijnhuis-markers', () => {
  assert.match(ROUTE, /\?\? \(entry\.stopsGeo\.filter\(s => s\.kind !== 'wijnhuis'\)\.length \|\| entry\.stops\.length\)/);
});

test('ontdek-promo in de header is geen <h2> meer', () => {
  const s = read('src/components/SiteHeader.astro');
  assert.doesNotMatch(s, /<h2[^>]*ontdek-promo-title/);
  assert.match(s, /<p class="ontdek-promo-title">/);
});

test('Moezel draagt het reisverhaal in de body; andere routes houden het blok', async () => {
  const { verhaalInRouteBody } = await import('../src/lib/reis-verhaal.ts');
  assert.equal(verhaalInRouteBody('mosel-bernkastel-traben-trarbach'), true);
  assert.equal(verhaalInRouteBody('langhe-piemonte'), false);
  assert.match(ROUTE, /!verhaalInRouteBody\(entry\.slug\) && <ReisVerhaal/);
});

test('disclosure: één per sectie, onder de laatste boekknop', async () => {
  const { renderEnrichedRouteBody } = await import('../src/lib/route-body.ts');
  const md = [
    '## Waar slapen', '', '::boek{zoek="a" label="A"}', '', '::boek{zoek="b" label="B"}', '', '::boek{zoek="c" label="C"}', '',
    '## Dag 1', '', 'tekst', '', '::boek{zoek="d" label="D"}', '',
  ].join('\n');
  const { html } = await renderEnrichedRouteBody(md, {
    locale: 'nl', disclosure: 'Affiliate-link TEST', downloadFoto: async () => null,
    resolveBoekHref: async (a) => `https://example.com/${a.zoek}`,
  });
  assert.equal((html.match(/route-boek__cta/g) ?? []).length, 4);
  assert.equal((html.match(/Affiliate-link TEST/g) ?? []).length, 2);
  const firstSection = html.split('<h2')[1];
  assert.ok(firstSection.lastIndexOf('route-boek__disclosure') > firstSection.lastIndexOf('>C<'), 'disclosure hoort onder knop C');
  assert.ok(firstSection.indexOf('route-boek__disclosure') > firstSection.indexOf('>C<'), 'geen disclosure onder A of B');
});
