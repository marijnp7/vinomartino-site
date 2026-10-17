// LAT-13816 — routes als atlas, fase 1. Bewaakt:
//   1. fallback zonder `dag`: één rechte lijn door de waypoints, geen dagkleur, geen km;
//   2. fallback met `dag` maar zonder route-JSON: rechte lijn per dag, km null (niets verzonnen);
//   3. met route-JSON: wegroute per dag in de dagkleur en een totaal;
//   4. km-opmaak (± en afgerond op 5) en de dagkleurrotatie;
//   5. de gecommitte route-JSON blijft onder 60 KB en heeft per dag een lijn;
//   6. de ui-keys hebben NL en EN.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { planRouteMap, totaalMeters, formatKm, dagKleur, stopNummers } = await import('../src/lib/route-lines.ts');
const { UI_STRING_DEFAULTS, UI_STRING_EN } = await import('../src/lib/ui-strings.ts');
const { simplify, waypointsPerDag } = await import('./build-route-lines.mjs');

const zonderDag = [
  { naam: 'A', lat: 49.25, lng: 4.03 },
  { naam: 'W', lat: 49.2, lng: 4.1, kind: 'wijnhuis' },
  { naam: 'B', lat: 49.15, lng: 4.15 },
  { naam: 'S', lat: 49.04, lng: 3.96, kind: 'slaap' },
];
const metDag = [
  { naam: 'A', lat: 49.25, lng: 4.03, dag: 1 },
  { naam: 'B', lat: 49.15, lng: 4.15, dag: 1 },
  { naam: 'S', lat: 49.04, lng: 3.96, kind: 'slaap', dag: 1 },
  { naam: 'C', lat: 49.08, lng: 3.97, dag: 2 },
  { naam: 'S2', lat: 49.04, lng: 3.96, kind: 'slaap', dag: 2 },
];

test('zonder dag en zonder route-JSON: rechte lijn door de waypoints, zoals vóór LAT-13816', () => {
  const seg = planRouteMap(zonderDag, null);
  assert.equal(seg.length, 1);
  assert.equal(seg[0].dag, null);
  assert.equal(seg[0].kleur, null);
  assert.equal(seg[0].road, false);
  assert.deepEqual(seg[0].coords, [[49.25, 4.03], [49.15, 4.15]]);
  assert.equal(totaalMeters(seg), null);
});

test('zonder dag maar mét route-JSON: nog steeds de oude rechte lijn (geen dag om op te kleuren)', () => {
  const line = { slug: 'x', source: '', generatedAt: '', totalMeters: 1000, days: [{ dag: 1, meters: 1000, seconds: 60, coords: [[1, 1], [2, 2]] }] };
  const seg = planRouteMap(zonderDag, line);
  assert.equal(seg.length, 1);
  assert.equal(seg[0].road, false);
  assert.equal(totaalMeters(seg), null);
});

test('met dag, zonder route-JSON: rechte lijn per dag in de dagkleur, geen km', () => {
  const seg = planRouteMap(metDag, null);
  assert.deepEqual(seg.map((s) => s.dag), [1, 2]);
  assert.deepEqual(seg.map((s) => s.kleur), ['#F2C14E', '#E8A0BF']);
  assert.ok(seg.every((s) => s.road === false && s.meters === null));
  // dag 2 begint bij de slaapplek van dag 1
  assert.deepEqual(seg[1].coords[0], [49.04, 3.96]);
  assert.equal(totaalMeters(seg), null);
});

test('met dag en route-JSON: wegroute per dag en een totaal', () => {
  const line = { slug: 'x', source: '', generatedAt: '', totalMeters: 0, days: [
    { dag: 1, meters: 56200, seconds: 1, coords: [[1, 1], [1.5, 1.5], [2, 2]] },
    { dag: 2, meters: 30600, seconds: 1, coords: [[2, 2], [3, 3]] },
  ] };
  const seg = planRouteMap(metDag, line);
  assert.ok(seg.every((s) => s.road));
  assert.equal(totaalMeters(seg), 86800);
  assert.equal(formatKm(totaalMeters(seg)), '± 85 km');
  assert.equal(formatKm(seg[0].meters, 1), '± 56 km');
});

test('km-opmaak en dagkleuren', () => {
  assert.equal(formatKm(null), null);
  assert.equal(formatKm(0), null);
  assert.equal(formatKm(1200), '± 5 km');
  assert.equal(formatKm(87400), '± 85 km');
  assert.equal(formatKm(87600), '± 90 km');
  assert.equal(dagKleur(4), '#F2C14E');
  assert.deepEqual(stopNummers(zonderDag), [1, null, 2, null]);
});

test('build-script: dag 2 start bij de slaapplek van dag 1; vereenvoudiging houdt eindpunten', () => {
  const wp = waypointsPerDag(metDag.map((s) => ({ ...s, kind: s.kind ?? 'stop' })));
  assert.deepEqual(wp[1].pts.map((p) => p.naam), ['S', 'C', 'S2']);
  const line = Array.from({ length: 50 }, (_, i) => [49 + i * 1e-6, 4]);
  assert.deepEqual(simplify(line), [line[0], line[49]]);
});

test('gecommitte route-JSON: < 60 KB, per dag een lijn en meters', () => {
  const dir = fileURLToPath(new URL('../src/data/route-lines/', import.meta.url));
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    assert.ok(statSync(dir + f).size < 60 * 1024, `${f} is te groot`);
    const j = JSON.parse(readFileSync(dir + f, 'utf8'));
    assert.equal(`${j.slug}.json`, f);
    assert.ok(j.days.length >= 1 && j.days.every((d) => d.coords.length >= 2 && d.meters > 0));
  }
});

test('nieuwe ui-keys hebben NL en EN', () => {
  for (const k of ['routegeo.legend.dag', 'route.chips.kop', 'route.chips.toon', 'route.chips.stop', 'route.chips.opKaart',
    'routestrip.aria', 'routestrip.dag', 'routestrip.dagen', 'routestrip.stops', 'routestrip.wijnhuis', 'routestrip.wijnhuizen', 'routestrip.slapenIn']) {
    assert.ok(UI_STRING_DEFAULTS[k], `NL ${k}`);
    assert.ok(UI_STRING_EN[k], `EN ${k}`);
  }
});

test('toonnaam zonder interne zoekmarker', async () => {
  const { schoneStopNaam } = await import('../src/lib/route-lines.ts');
  assert.equal(schoneStopNaam('Palazzo Finati (zoekresultaat Booking)'), 'Palazzo Finati');
  assert.equal(schoneStopNaam('Mas bij Bandol (vakantieverhuur) (zoekresultaat Booking)'), 'Mas bij Bandol (vakantieverhuur)');
  assert.equal(schoneStopNaam('Hôtel Jean Moët, Épernay'), 'Hôtel Jean Moët, Épernay');
});

test('elke gecommitte route-JSON heeft een schets en dagen in oplopende volgorde', () => {
  const dir = new URL('../src/data/route-lines/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.ok(j.sketch && j.sketch.startsWith('M'), `${f}: schets ontbreekt`);
    const dagen = j.days.map((d) => d.dag);
    assert.deepEqual(dagen, [...dagen].sort((a, b) => a - b), `${f}: dagen niet oplopend`);
    assert.ok(existsSync(new URL(f.replace(/\.json$/, '.svg'), dir)), `${f}: svg ontbreekt`);
  }
});
