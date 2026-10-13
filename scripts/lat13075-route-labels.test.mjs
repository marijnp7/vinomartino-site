// LAT-13075 — /en/ mag geen NL-niveau of NL-duur van een route tonen
// ("gemiddeld · 5 dagen" in de EN-zoekindex). NL blijft de CMS-bron letterlijk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizeRouteStyle, localizeRouteDuration } from '../src/lib/route-labels.ts';

const EN = { 'route.niveau.makkelijk': 'easy', 'route.niveau.gemiddeld': 'moderate', 'route.niveau.uitdagend': 'challenging',
  'route.duur.dag': '{n} day', 'route.duur.dagen': '{n} days', 'route.duur.nacht': '{n} night', 'route.duur.nachten': '{n} nights' };
const t = (k) => EN[k] ?? k;

test('EN: niveau-woordenlijst wordt vertaald', () => {
  assert.equal(localizeRouteStyle('gemiddeld', 'en', t), 'moderate');
  assert.equal(localizeRouteStyle('gemakkelijk', 'en', t), 'easy');
  assert.equal(localizeRouteStyle('Matig', 'en', t), 'moderate');
  assert.equal(localizeRouteStyle('moderate', 'en', t), 'moderate');
});
test('vrije tekst en NL blijven de bron', () => {
  assert.equal(localizeRouteStyle('Riesling van steile leisteen', 'en', t), 'Riesling van steile leisteen');
  assert.equal(localizeRouteStyle('gemakkelijk', 'nl', t), 'gemakkelijk');
  assert.equal(localizeRouteDuration('3 dagen', 'nl', t), '3 dagen');
});
test('EN: NL-duur wordt telling', () => {
  assert.equal(localizeRouteDuration('1 dag', 'en', t), '1 day');
  assert.equal(localizeRouteDuration('5 dagen', 'en', t), '5 days');
  assert.equal(localizeRouteDuration('2 dagen, 2 nachten', 'en', t), '2 days, 2 nights');
  assert.equal(localizeRouteDuration('4 days, 4 nights', 'en', t), '4 days, 4 nights');
  assert.equal(localizeRouteDuration('een lang weekend', 'en', t), 'een lang weekend');
});

import { localizeContinent } from '../src/lib/route-labels.ts';
const C = { 'continent.europa': 'Europe', 'continent.azie': 'Asia' };
const tc = (k) => C[k] ?? k;
test('EN: continent uit de NL-woordenlijst wordt vertaald, NL blijft bron', () => {
  assert.equal(localizeContinent('Europa', 'en', tc), 'Europe');
  assert.equal(localizeContinent('Azië', 'en', tc), 'Asia');
  assert.equal(localizeContinent('Europa', 'nl', tc), 'Europa');
  assert.equal(localizeContinent('Kaukasus', 'en', tc), 'Kaukasus');
  assert.equal(localizeContinent('', 'en', tc), '');
});
