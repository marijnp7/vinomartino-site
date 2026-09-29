#!/usr/bin/env node
// LAT-11988: authenticiteits-lint op het eindproduct dist/pins.xml (PAPERCLIP
// sectie 8, ook op de pinfeed). Schrijft dist/pins-lint.json voor build-info.json
// en faalt bij een overtreding; een tekort aan items is een waarschuwing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { feedTexts, lintText, PINS_PER_WEEKDAY } from '../src/lib/pins.ts';

const file = process.argv[2] || 'dist/pins.xml';
if (!existsSync(file)) {
  console.error(`[lint-pins] ${file} ontbreekt`);
  process.exit(1);
}
const xml = readFileSync(file, 'utf8');
const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => m[0]);
const perDay = {};
for (const it of items) {
  const day = /<guid[^>]*>pin-(\d{8})-/.exec(it)?.[1] ?? 'onbekend';
  perDay[day] = (perDay[day] ?? 0) + 1;
}
const violations = feedTexts(xml).flatMap((t) => lintText(t).map((h) => ({ ...h, text: t.slice(0, 80) })));
const days = Object.keys(perDay).sort();
const short = days.filter((d) => perDay[d] < PINS_PER_WEEKDAY);
const result = { items: items.length, days: days.length, perDay, violations: violations.length, shortDays: short.length };
writeFileSync(file.replace(/pins\.xml$/, 'pins-lint.json'), JSON.stringify(result) + '\n');
console.log('[lint-pins]', JSON.stringify(result));
if (violations.length) {
  console.error('[lint-pins] overtredingen:', JSON.stringify(violations));
  process.exit(1);
}
// Te weinig kandidaten (foto, lint, taal) blokkeert de deploy niet; het staat in build-info.json.
if (items.length === 0 || short.length) {
  console.warn(`[lint-pins] WAARSCHUWING: geen ${PINS_PER_WEEKDAY} items per werkdag: ${JSON.stringify(perDay)}`);
}
