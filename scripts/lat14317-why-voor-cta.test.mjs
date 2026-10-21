// LAT-14317 (D5): elke echte affiliate-aanbeveling krijgt de CMS-motivatie vóór de CTA.
// Bewaakt de twee bedradingsgaten uit de meting in /paperclip/reports/lat-d5/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const loader = readFileSync(new URL('../src/lib/accommodaties-loader.ts', import.meta.url), 'utf8');
const itin = readFileSync(new URL('../src/lib/route-itinerary.ts', import.meta.url), 'utf8');
const days = readFileSync(new URL('../src/components/RouteItineraryDays.astro', import.meta.url), 'utf8');

test('roundup-kaart vraagt why_this_one op en valt daarop terug', () => {
  assert.match(loader, /CURATIE_FIELDS = '[^']*\bwhy_this_one\b/);
  assert.match(loader, /whyRegel: \(row\.why_regel \|\| row\.why_this_one\)/);
});

test('EN valt niet terug op een onvertaalde NL why_this_one', () => {
  assert.match(loader, /nlWhyThisOne = new Map\(rawRows\.map/);
  assert.match(loader, /locale === 'en'[\s\S]{0,200}row\.why_this_one === nlWhyThisOne\.get\(String\(row\.id\)\)\) row\.why_this_one = null/);
});

test('route-overnachting parseert why en geeft hem door aan PoiCard', () => {
  const parse = itin.slice(itin.indexOf('function parseOvernachting'));
  assert.match(parse.slice(0, parse.indexOf('\n}')), /why: asString\(rec\.why \?\? rec\.why_regel/);
  const stay = days.slice(days.indexOf('route-day__stay'));
  assert.match(stay.slice(0, 1500), /whyRegel: d\.overnachting\.why \?\? null/);
});
