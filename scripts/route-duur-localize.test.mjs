// Test voor localizeDuur (route-itinerary): /en/ mag geen NL-duur tonen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Losse extractie: route-itinerary.ts importeert site-modules die buiten Astro
// niet laden; de functie zelf is puur.
const src = readFileSync(new URL('../src/lib/route-itinerary.ts', import.meta.url), 'utf8');
const start = src.indexOf('const EN_DUUR_WOORDEN');
const body = src.slice(start)
  .replace(/: Record<string, string>/, '')
  .replace('export function localizeDuur(duur: string | null, locale: string): string | null', 'function localizeDuur(duur, locale)');
const localizeDuur = new Function(`${body}; return localizeDuur;`)();

test('EN: uur-notatie wordt Engels', () => {
  assert.equal(localizeDuur('1 uur', 'en'), 'an hour');
  assert.equal(localizeDuur('1,5 uur', 'en'), 'an hour and a half');
  assert.equal(localizeDuur('2 uur', 'en'), '2 hours');
  assert.equal(localizeDuur('2,5 uur', 'en'), '2.5 hours');
});
test('kaal getal is minuten', () => {
  assert.equal(localizeDuur('90', 'en'), '90 min');
  assert.equal(localizeDuur('90', 'nl'), '90 min');
});
test('bekende woorden en onbekende NL-tekst', () => {
  assert.equal(localizeDuur('avondeten', 'en'), 'dinner');
  assert.equal(localizeDuur('wandeling', 'en'), 'a walk');
  assert.equal(localizeDuur('ongeveer een middag', 'en'), null);
  assert.equal(localizeDuur('an hour and a half', 'en'), 'an hour and a half');
  assert.equal(localizeDuur('45 min', 'en'), '45 min');
});
test('NL blijft ongewijzigd', () => {
  assert.equal(localizeDuur('1,5 uur', 'nl'), '1,5 uur');
  assert.equal(localizeDuur(null, 'en'), null);
});
