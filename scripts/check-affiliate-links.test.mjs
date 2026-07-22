#!/usr/bin/env node
/**
 * LAT-2531 — regressietests voor de affiliate-linkguard.
 *
 * Bewijst de DoD:
 *   - rood op de echte LAT-2529 kapotte GYG-links (7x zonder tour-id),
 *   - rood op een LAT-2251-Booking-regressie (aid/label zonder CJ-wrapper),
 *   - groen op de canonieke gerepareerde vorm (tour-id + attributie) en op de
 *     correct-gewrapte CJ-Booking-link + geldige GYG-zoeklink.
 *
 * Draait zonder netwerk en zonder build: `node --test scripts/check-affiliate-links.test.mjs`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { scanHtml } from './check-affiliate-links.mjs';

const gyg = (path, params = 'partner_id=CRMZDZ6&utm_medium=online_publisher&cmp=streek-langhe') =>
  `<a href="https://www.getyourguide.com${path}?${params}">tour</a>`;

// De HTML-encoder van Astro schrijft & als &amp; in attributen; de guard moet
// dat decoderen vóór het URL-parsen.
const gygEncoded = (path) =>
  `<a href="https://www.getyourguide.com${path}?partner_id=CRMZDZ6&amp;utm_medium=online_publisher&amp;cmp=streek-langhe">tour</a>`;

test('ROOD: GYG-tour zonder tour-id (echte LAT-2529 404-links)', () => {
  // Exact de zeven paden uit de seed die 404'den: geen -t<cijfers>.
  const brokenPaths = [
    '/alba/barolo-barbaresco-wine-tour',
    '/nl-nl/langhe/piemonte-wijnmakerij-tour-proef-barolo-barbaresco-lokaal-eten',
    '/turin/private-tour-piedmont-wine-tasting-of-the-barolo-region',
    '/florence/chianti-and-truffle-hunting-tour-in-san-miniato-tuscany',
    '/tuscany/classic-tuscan-vineyard-old-jeep-tour-wine-tasting-lunch',
    '/beaune/small-group-winery-tour-from-dijon-to-beaune-with-lunch',
    '/dijon/burgundy-wines-full-day-tasting-tour-from-dijon',
  ];
  for (const p of brokenPaths) {
    const v = scanHtml(gyg(p));
    assert.equal(v.length, 1, `verwacht 1 violation voor ${p}`);
    assert.match(v[0].reason, /tour-id/, `verwacht tour-id-reden voor ${p}`);
  }
});

test('GROEN: canonieke GYG-tour-deeplink met tour-id (gerepareerde vorm)', () => {
  const okPaths = [
    '/florence-l32/small-group-tuscany-wine-tasting-safaris-with-lunch-dinner-t100899/',
    '/beaune-l5076/from-beaune-burgundy-day-trip-with-14-wine-tastings-t106615/',
  ];
  for (const p of okPaths) {
    assert.deepEqual(scanHtml(gyg(p)), [], `verwacht groen voor ${p}`);
  }
});

test('GROEN: canonieke tour ook met HTML-encoded &amp; ampersands', () => {
  const html = gygEncoded('/florence-l32/small-group-tuscany-wine-tasting-safaris-with-lunch-dinner-t100899/');
  assert.deepEqual(scanHtml(html), []);
});

test('GROEN: GYG-zoek-/landingslink (geen pad) is een geldig patroon', () => {
  const html = '<a href="https://www.getyourguide.com/?partner_id=CRMZDZ6&amp;utm_medium=online_publisher&amp;cmp=tours-piemonte&amp;q=Barolo">zoek</a>';
  assert.deepEqual(scanHtml(html), []);
});

test('GROEN: GYG-zoekresultatenpad /s/?q= met tracking is geldig (geen tour-id)', () => {
  // getyourguide.com/s/?q=... is GYG's eigen 200-zoekpagina, geen tour-deeplink.
  const html = '<a href="https://www.getyourguide.com/s/?q=barolo+wine+tour&amp;partner_id=CRMZDZ6&amp;utm_medium=online_publisher&amp;cmp=artikel-piemonte">zoek</a>';
  assert.deepEqual(scanHtml(html), []);
});

test('ROOD: GYG /s/?q= zónder partner_id blijft rood (attributie, exact LAT-2531)', () => {
  const html = '<a href="https://www.getyourguide.com/s/?q=barolo+wine+tour+piemonte">zoek</a>';
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /partner_id/);
});

test('ROOD: GYG /s/<iets> (twee segmenten) valt door naar tour-id-check', () => {
  // Alleen het kale `s`-segment is de zoekpagina; een dieper pad hoort een tour te
  // zijn en heeft dus een -t<id> nodig.
  const v = scanHtml(gyg('/s/verzonnen-pad'));
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /tour-id/);
});

test('ROOD: GYG mist partner_id → geen attributie', () => {
  const html = '<a href="https://www.getyourguide.com/florence-l32/x-t100899/?cmp=streek-langhe">tour</a>';
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /partner_id/);
});

test('ROOD: GYG met verkeerd partner_id (ander account)', () => {
  const html = gyg('/florence-l32/x-t100899/', 'partner_id=WRONG123&cmp=streek-langhe');
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /verwacht/);
});

test('ROOD: GYG mist cmp → geen per-regio attributie', () => {
  const html = gyg('/florence-l32/x-t100899/', 'partner_id=CRMZDZ6');
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /cmp/);
});

test('ROOD: directe Booking-deeplink met aid/label zonder CJ-wrapper (LAT-2251)', () => {
  const html = '<a href="https://www.booking.com/hotel/it/brolio.html?aid=818285&amp;label=pub-7938753_site-101734849_clkid-x">boek</a>';
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /CJ-klikdomein/);
});

test('GROEN: correct-gewrapte CJ-Booking-link (kqzyfj + url= + sid=)', () => {
  const inner = encodeURIComponent('https://www.booking.com/hotel/it/brolio.html?keep_landing=1');
  const html = `<a href="https://www.kqzyfj.com/click-101734849-15734897?url=${inner}&amp;sid=accommodation-brolio">boek</a>`;
  assert.deepEqual(scanHtml(html), []);
});

test('ROOD: CJ-klik-URL zonder sid', () => {
  const inner = encodeURIComponent('https://www.booking.com/hotel/it/brolio.html');
  const html = `<a href="https://www.kqzyfj.com/click-101734849-15734897?url=${inner}">boek</a>`;
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /sid/);
});

test('ROOD: Awin-link met placeholder-affid', () => {
  const ued = encodeURIComponent('https://www.booking.com/searchresults.html?ss=Alba');
  const html = `<a href="https://www.awin1.com/cread.php?awinmid=5818&amp;awinaffid=VINOMARTINO_AWIN_PENDING&amp;clickref=hotels-piemonte&amp;ued=${ued}">boek</a>`;
  const v = scanHtml(html);
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /placeholder/);
});

test('GEEN vals-positief: niet-affiliate links en bare booking-vermelding', () => {
  const html = [
    '<a href="https://www.produttoridelbarbaresco.com">producent</a>',
    '<a href="/streken/langhe">interne link</a>',
    '<a href="https://www.booking.com/hotel/it/x.html">redactionele vermelding zonder tracking</a>',
    '<a href="mailto:info@vinomartino.travel">mail</a>',
  ].join('\n');
  assert.deepEqual(scanHtml(html), []);
});

test('CLI: dist/preview/** valt buiten de guard-scope (component-demopagina)', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const run = promisify(execFile);

  const dist = await mkdtemp(join(tmpdir(), 'affguard-'));
  const brokenAwin =
    '<a href="https://www.awin1.com/cread.php?awinmid=5818&awinaffid=VINOMARTINO_AWIN_PENDING&clickref=hotels-piemonte&ued=x">boek</a>';
  await mkdir(join(dist, 'preview', 'lat-1676-componenten'), { recursive: true });
  await writeFile(join(dist, 'preview', 'lat-1676-componenten', 'index.html'), brokenAwin);
  await mkdir(join(dist, 'streken', 'langhe'), { recursive: true });
  await writeFile(join(dist, 'streken', 'langhe', 'index.html'), '<a href="/intern">ok</a>');

  const guard = fileURLToPath(new URL('./check-affiliate-links.mjs', import.meta.url));
  // Exit 0: de enige violation zit in dist/preview/** en wordt overgeslagen.
  await run(process.execPath, [guard, dist]);
});

test('CLI: eenzelfde violation BUITEN preview laat de build wél rood vallen', async () => {
  const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { execFile } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');

  const dist = await mkdtemp(join(tmpdir(), 'affguard-'));
  const brokenAwin =
    '<a href="https://www.awin1.com/cread.php?awinmid=5818&awinaffid=VINOMARTINO_AWIN_PENDING&clickref=hotels-piemonte&ued=x">boek</a>';
  await mkdir(join(dist, 'artikelen', 'x'), { recursive: true });
  await writeFile(join(dist, 'artikelen', 'x', 'index.html'), brokenAwin);

  const guard = fileURLToPath(new URL('./check-affiliate-links.mjs', import.meta.url));
  await new Promise((resolve, reject) => {
    execFile(process.execPath, [guard, dist], (err) => {
      if (err && err.code === 1) resolve();
      else reject(new Error(`verwacht exit 1, kreeg: ${err ? err.code : 0}`));
    });
  });
});
