// LAT-11988: rotatie, taalregel, lint, UTM en RSS van de Pinterest-feed, plus
// een echte render die op pixels toetst dat het tekstvlak tekst draagt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  clusterOf, interleaveByCluster, lastWeekdays, lintText, pinUrl, renderFeed,
  selectForWeekday, feedTexts, truncateAtWord, weekdayNumber, PIN_CLUSTERS,
  composeDay, pinImageUrl, PIN_DAM_BATCHES, PIN_DAM_SLUGS,
} from '../src/lib/pins.ts';

const src = (slug, streek, extra = {}) => ({
  slug, title: slug, description: 'd', category: 'Regio-gidsen', tags: [], streken: [{ slug: streek, name: streek }], ...extra,
});

test('taalregel: D-clusters Engels; Moezel, Loire en B-test Nederlands', () => {
  assert.equal(clusterOf(src('a', 'champagne')).lang, 'en');
  assert.equal(clusterOf(src('a', 'kaapregio')).lang, 'en');
  assert.equal(clusterOf(src('a', 'piemonte')).lang, 'en');
  assert.equal(clusterOf(src('a', 'toscane')).lang, 'en');
  assert.equal(clusterOf(src('a', 'mosel')).lang, 'nl');
  assert.equal(clusterOf(src('a', 'loire')).lang, 'nl');
  assert.equal(clusterOf(src('a', 'champagne', { tags: ['Autovakantie'] })).id, 'b-test');
  assert.equal(clusterOf(src('a', 'rioja')), null);
  assert.equal(PIN_CLUSTERS.length, 7);
});

test('weekdagen: maandag t/m vrijdag, weekend valt terug op vrijdag', () => {
  const sat = new Date(Date.UTC(2026, 9, 10, 12));
  const days = lastWeekdays(sat);
  assert.equal(days.length, 5);
  assert.deepEqual(days.map((d) => d.getUTCDay()), [1, 2, 3, 4, 5]);
  assert.equal(days[4].toISOString().slice(0, 10), '2026-10-09');
  assert.equal(weekdayNumber(new Date(Date.UTC(2026, 0, 5))), 0);
  assert.equal(weekdayNumber(new Date(Date.UTC(2026, 0, 9))), 4);
  assert.equal(weekdayNumber(new Date(Date.UTC(2026, 0, 12))), 5);
});

test('rotatie: 5 per werkdag, vast, zonder dubbelen en zonder gat tussen dagen', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ slug: `s${String(i).padStart(2, '0')}`, clusterId: i % 2 ? 'loire' : 'moezel' }));
  const rot = interleaveByCluster(items);
  assert.equal(new Set(rot.map((r) => r.slug)).size, 12);
  const d0 = new Date(Date.UTC(2026, 9, 5));
  const d1 = new Date(Date.UTC(2026, 9, 6));
  const a = selectForWeekday(rot, d0);
  const b = selectForWeekday(rot, d1);
  assert.equal(a.length, 5);
  assert.equal(new Set(a.map((x) => x.slug)).size, 5);
  assert.deepEqual(a, selectForWeekday(rot, d0));
  assert.equal(b[0], rot[(weekdayNumber(d1) * 5) % 12]);
  assert.equal(selectForWeekday(rot.slice(0, 3), d0).length, 3);
  assert.deepEqual(selectForWeekday([], d0), []);
});

test('lint: gedachtestreep, Martin, Sophie, Tier, LAT, eerste persoon verleden tijd', () => {
  const bad = ['Reims – Epernay', 'Reims — Epernay', 'Reims - Epernay', 'door Martin', 'WSET 4', 'Sophie zegt', 'Tier1 stuk', 'Draft v2', 'zie LAT-1234',
    'we sliepen daar', 'geproefd in Reims', 'we stayed in a grower village', 'I tasted it', 'ik proefde het'];
  for (const t of bad) assert.ok(lintText(t).length > 0, t);
  const good = ['Reims of Epernay: waar slaap je?', 'Open 80-125 dagen', 'VinoMartino gidst je door de Mosel', 'Marijn reisde er', 'WSET 3'];
  for (const t of good) assert.deepEqual(lintText(t), [], t);
});

test('utm en afkappen', () => {
  const u = new URL(pinUrl('en', 'where-to-stay'));
  assert.equal(u.pathname, '/en/artikelen/where-to-stay/');
  assert.equal(u.searchParams.get('utm_source'), 'pinterest');
  assert.equal(new URL(pinUrl('nl', 'x')).pathname, '/artikelen/x/');
  const t = truncateAtWord('een twee drie vier vijf zes zeven acht negen tien', 20);
  assert.ok(t.length <= 20 && !t.endsWith(' '));
});

test('feed: geldige RSS, escaping, 5 items per dag, feedtekst lint-schoon', () => {
  const days = lastWeekdays(new Date(Date.UTC(2026, 9, 8)));
  const items = days.flatMap((d) => Array.from({ length: 5 }, (_, j) => ({
    lang: 'en', slug: `p${j}`, clusterId: 'champagne', title: `Reims & Epernay ${j}`, description: '<b>x</b>',
    link: pinUrl('en', `p${j}`), image: 'https://vinomartino.com/pins/en/p.jpg', imageBytes: 1234, date: d,
  })));
  const xml = renderFeed(items, new Date(Date.UTC(2026, 9, 8)));
  assert.equal((xml.match(/<item>/g) ?? []).length, 25);
  assert.match(xml, /Reims &amp; Epernay 0/);
  assert.match(xml, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(xml, /utm_source=pinterest/);
  assert.match(xml, /<enclosure url="https:\/\/vinomartino.com\/pins\/en\/p.jpg" length="1234" type="image\/jpeg" \/>/);
  assert.equal(feedTexts(xml).flatMap((t) => lintText(t)).length, 0);
});

test('pincompositie: 1000x1500 en het tekstvlak bevat echt tekst (pixeltoets)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lat11988-test-'));
  mkdirSync(join(dir, 'cache'));
  const root = resolve(import.meta.dirname, '..');
  const conf = join(dir, 'fonts.conf');
  writeFileSync(conf, `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig><dir>${join(root, 'src/assets/pin-fonts')}</dir><cachedir>${join(dir, 'cache')}</cachedir></fontconfig>\n`);
  const photo = join(dir, 'photo.jpg');
  await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#3a6b35' } }).jpeg().toFile(photo);
  const out = join(dir, 'pin.jpg');
  const jobs = join(dir, 'jobs.json');
  writeFileSync(jobs, JSON.stringify([{ src: photo, out, title: 'Where to stay in Champagne: Reims, Epernay or a grower village?' }]));
  execFileSync(process.execPath, [join(root, 'scripts/pin-render.mjs'), jobs], { env: { ...process.env, FONTCONFIG_FILE: conf, FONTCONFIG_PATH: dir }, stdio: 'pipe' });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 1500);
  const sizes = JSON.parse(readFileSync(jobs + '.sizes.json', 'utf8'));
  assert.ok(sizes[out] > 20000);
  // stats() negeert extract() in dezelfde keten; eerst naar een eigen buffer.
  const region = async (top, height) => sharp(await sharp(out).extract({ left: 0, top, width: 1000, height }).toBuffer()).removeAlpha().stats();
  const panel = await region(1000, 500);
  assert.ok(Math.max(...panel.channels.map((c) => c.stdev)) > 8, 'tekstvlak is leeg');
  const photoTop = await region(0, 1000);
  assert.ok(photoTop.channels.every((c, i) => Math.abs(c.mean - [0x3a, 0x6b, 0x35][i]) < 12), `foto gewijzigd: ${photoTop.channels.map((c) => c.mean)}`);
});

test('LAT-12109: DAM-batch neemt plekken van de rotatie over, 5 per dag blijft', () => {
  const b = PIN_DAM_BATCHES[0];
  assert.equal(b.pins.length, 5);
  assert.deepEqual(b.pins.map((p) => p.articleId), [139, 141, 142, 136, 131]);
  assert.equal(new Set(b.pins.map((p) => p.fileId)).size, 5);
  assert.ok(!b.pins.some((p) => ['5d096786-28f6-431b-a38a-0842120a2970', 'a8eb13f3-2b62-404b-a81c-5aefaaff3204'].includes(p.fileId)));
  assert.ok(b.pins.every((p) => PIN_DAM_SLUGS.has(p.slug)));
  assert.deepEqual(b.pins.filter((p) => p.lang === 'en').map((p) => p.articleId), [139, 141, 142]);
  assert.equal(composeDay([1, 2, 3, 4, 5], ['a', 'b', 'c', 'd', 'e']).length, 5);
  assert.deepEqual(composeDay([1, 2], ['a', 'b', 'c', 'd', 'e']), [1, 2, 'a', 'b', 'c']);
  assert.deepEqual(composeDay([], ['a', 'b']), ['a', 'b']);
});

test('LAT-12109: DAM-item in de feed: PNG-enclosure, media:content 1000x1500, lint-schoon', () => {
  const items = [{
    lang: 'en', slug: 'champagne-overnachten-reims-epernay', clusterId: 'dam', title: 'Where to stay in Champagne', description: 'Reims or Epernay?',
    link: pinUrl('en', 'champagne-overnachten-reims-epernay'), image: pinImageUrl('en', 'champagne-overnachten-reims-epernay', 'png'),
    imageBytes: 138162, imageMime: 'image/png', date: new Date(Date.UTC(2026, 8, 30)),
  }];
  const xml = renderFeed(items, new Date(Date.UTC(2026, 8, 30, 12)));
  assert.match(xml, /<enclosure url="https:\/\/vinomartino.com\/pins\/en\/champagne-overnachten-reims-epernay.png" length="138162" type="image\/png" \/>/);
  assert.match(xml, /<media:content url="[^"]+\.png" medium="image" type="image\/png" width="1000" height="1500" \/>/);
  assert.match(xml, /utm_source=pinterest&amp;utm_medium=social&amp;utm_campaign=pins-feed&amp;utm_content=en-champagne-overnachten/);
  assert.equal(feedTexts(xml).flatMap((t) => lintText(t)).length, 0);
});
