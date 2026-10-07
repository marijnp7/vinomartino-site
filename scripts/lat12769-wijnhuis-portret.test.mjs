// LAT-12769 — Wijnhuis-portret 2.0: normalisatie en lege-veld-gedrag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePortret, normalizeDruiven, normalizeWijnen, normalizeOpeningstijden,
  safeUrl, heeftInfographic, heeftBezoek, druivenSegmenten,
} from '../src/lib/wijnhuis-portret.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

test('leeg record: alles null/[] en geen blok zichtbaar', () => {
  const p = normalizePortret({});
  assert.equal(p.bodem, null);
  assert.deepEqual(p.druiven, []);
  assert.deepEqual(p.wijnen, []);
  assert.equal(p.zelfGeweest, false);
  assert.equal(heeftInfographic(p, { established: null, hectares: '' }), false);
  assert.equal(heeftBezoek(p, '', ''), false);
});

test('druiven: gesorteerd, som > 100 valt weg, ongeldige rijen genegeerd', () => {
  assert.deepEqual(normalizeDruiven([{ naam: 'Pinot', pct: 30 }, { naam: 'Riesling', pct: 70 }, { naam: '', pct: 5 }, { naam: 'X', pct: -1 }]).map((d) => d.naam), ['Riesling', 'Pinot']);
  assert.deepEqual(normalizeDruiven([{ naam: 'A', pct: 80 }, { naam: 'B', pct: 40 }]), []);
  assert.deepEqual(normalizeDruiven('geen json'), []);
  const seg = druivenSegmenten(normalizeDruiven([{ naam: 'A', pct: 60 }, { naam: 'B', pct: 20 }]));
  assert.equal(Math.round(seg.reduce((s, d) => s + d.width, 0)), 100);
});

test('enums en bereiken: ongeldig wordt null', () => {
  const p = normalizePortret({ bodem: 'chocolade', bezoek_type: 'altijd', stijl_zoet: 9, stijl_vol: 3, prijsband: 7, max_helling_pct: 101, eigenaar_generatie: 0 });
  assert.equal(p.bodem, null);
  assert.equal(p.bezoekType, null);
  assert.equal(p.stijl.zoet, null);
  assert.equal(p.stijl.vol, 3);
  assert.equal(p.prijsband, null);
  assert.equal(p.maxHellingPct, null);
  assert.equal(p.generatie, null);
  assert.equal(normalizePortret({ bodem: 'leisteen', max_helling_pct: 0 }).maxHellingPct, 0);
});

test('safeUrl laat alleen http(s) door', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('/relatief'), null);
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl(null), null);
});

test('wijnen: max 3, volgorde instap/signature/splurge, onveilige koop_url weg', () => {
  const w = normalizeWijnen([
    { naam: 'C', rol: 'splurge', prijsband: 4, koop_url: 'javascript:x' },
    { naam: 'A', rol: 'instap', drinkvenster: { van: 2024, tot: 2028 } },
    { naam: 'B', rol: 'signature', koop_url: 'https://shop.example/b' },
    { naam: 'D', rol: 'instap' },
    { naam: 'E', rol: 'onbekend' },
  ]);
  assert.deepEqual(w.map((x) => x.naam), ['A', 'D', 'B']);
  assert.equal(w[0].van, 2024);
  assert.equal(w[2].koopUrl, 'https://shop.example/b');
});

test('openingstijden: ongeldige tijden weg, [] = gesloten, onbekend dag ontbreekt', () => {
  const o = normalizeOpeningstijden({ ma: [], di: ['09:00-12:00', 'kapot'], opmerking: ' Reserveren ' });
  assert.deepEqual(o.dagen.ma, []);
  assert.deepEqual(o.dagen.di, ['09:00-12:00']);
  assert.equal('wo' in o.dagen, false);
  assert.equal(o.opmerking, 'Reserveren');
  assert.equal(normalizeOpeningstijden({}), null);
});

test('zelf_geweest alleen bij strikt true; onze ervaring zonder badge toont niets', () => {
  assert.equal(normalizePortret({ zelf_geweest: 'true' }).zelfGeweest, false);
  const p = normalizePortret({ zelf_geweest: false, onze_ervaring: 'Mooi.' });
  assert.equal(heeftBezoek(p, '', ''), false);
  assert.equal(heeftBezoek(normalizePortret({ zelf_geweest: true, onze_ervaring: 'Mooi.' }), '', ''), true);
});

test('template: blokken in vaste volgorde en alleen via normalizer-data', () => {
  const d = read('src/components/WijnhuisDetail.astro');
  const order = ['WijnhuisInfographic', 'blok="galerij"', 'blok="drinken"', 'blok="bezoek"', '<WijnhuisStayNear', 'blok="combineer"'].map((k) => d.indexOf(k));
  assert.ok(order.every((i) => i > -1), 'alle blokken aanwezig');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'volgorde klopt');
});
