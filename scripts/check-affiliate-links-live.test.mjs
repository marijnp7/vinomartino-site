// LAT-2532 — netwerkloze unit-tests voor het eindbestemmings-oordeel van de
// live affiliate-check. De browser-navigatie zelf is niet testbaar zonder
// externe host; hier borgen we de *beoordelingsregels* (soft-redirect naar
// /s?..., Booking-home, foutstatus) én de gedeelde URL-verzameling.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeGetYourGuide,
  judgeBooking,
  isBlockOrThrottle,
  isBookingChallenge,
  bookingSourceIntent,
} from './check-affiliate-links-live.mjs';
import { collectAffiliateUrls } from './check-affiliate-links.mjs';

const gyg = (s) => new URL(s);

test('GYG: echte tourpagina is ok', () => {
  assert.equal(judgeGetYourGuide(gyg('https://www.getyourguide.com/nl-nl/langhe-l1234/barolo-tour-t567890/'), 200), null);
});

test('GYG: soft-redirect naar /s?... = rood (LAT-2529)', () => {
  assert.match(judgeGetYourGuide(gyg('https://www.getyourguide.com/s/?q=barolo'), 200), /zoekpagina/);
});

test('GYG: geland op home = rood', () => {
  assert.match(judgeGetYourGuide(gyg('https://www.getyourguide.com/nl-nl/'), 200), /home/);
});

test('GYG: zoeklijst met ?q op ondiepe listing = rood', () => {
  assert.match(judgeGetYourGuide(gyg('https://www.getyourguide.com/langhe-l1234/?q=tour'), 200), /zoeklijst/);
});

test('GYG: 404 op eindbestemming = rood', () => {
  assert.match(judgeGetYourGuide(gyg('https://www.getyourguide.com/nl-nl/langhe-l1/x-t9/'), 404), /HTTP 404/);
});

test('GYG: 403 anti-bot op geldige tourpad = geen rood (block, geen dood)', () => {
  assert.equal(judgeGetYourGuide(gyg('https://www.getyourguide.com/nl-nl/langhe-l1234/barolo-tour-t567890/'), 403), null);
});

test('GYG: soft-redirect naar /s?... blijft rood ongeacht 200', () => {
  assert.match(judgeGetYourGuide(gyg('https://www.getyourguide.com/s/?q=barolo'), 200), /zoekpagina/);
});

test('Booking: property-pagina is ok', () => {
  assert.equal(judgeBooking(new URL('https://www.booking.com/hotel/it/villa-example.nl.html'), 200), null);
});

test('Booking: geland op home = rood', () => {
  assert.match(judgeBooking(new URL('https://www.booking.com/'), 200), /home/);
});

test('Booking: zoekresultaten i.p.v. property = rood', () => {
  assert.match(judgeBooking(new URL('https://www.booking.com/searchresults.nl.html?ss=barolo'), 200), /zoekresultaten/);
});

test('Booking: redirect weg van booking.com = rood', () => {
  assert.match(judgeBooking(new URL('https://example.com/oops'), 200), /kapotte redirect/);
});

// ── LAT-5014: de twee false-red-klassen uit run 31459168822 (2026-08-11) ─────
// Alle URL's hieronder zijn letterlijk overgenomen uit die run, zodat de tests
// aan gemeten werkelijkheid hangen en niet aan een bedacht voorbeeld.

test('Booking-challenge: 202 + chal_t/force_referer = onbereikbaar, geen rood (LAT-5014)', () => {
  // 25 van de 55 reds. Pad en `ss` identiek aan de bron: er is niets geladen.
  const chal = new URL(
    'https://www.booking.com/searchresults.html?ss=Langhe+Piemonte&chal_t=1786423624443&force_referer=',
  );
  assert.equal(isBookingChallenge(chal), true);
  // ...en de status waarop Booking hem serveert valt bewust NIET onder
  // isBlockOrThrottle — precies waarom deze klasse rood werd.
  assert.equal(isBlockOrThrottle(202), false);
});

test('Booking-challenge: een gewone eind-URL is géén challenge', () => {
  assert.equal(isBookingChallenge(new URL('https://www.booking.com/hotel/it/casa-di-langa.html')), false);
});

test('Booking: bron is zelf een zoeklink → landen op zoekresultaten is ok (LAT-5014)', () => {
  assert.equal(
    judgeBooking(
      new URL('https://www.booking.com/searchresults.nl.html?ss=Langhe+Piemonte'),
      200,
      'https://www.booking.com/searchresults.html?ss=Langhe+Piemonte',
    ),
    null,
  );
});

test('Booking: property-bron die op zoekresultaten landt blijft rood (closed_msg)', () => {
  // De 11 gesloten properties uit dezelfde run. Deze MOETEN rood blijven —
  // de zoek-intentie-versoepeling mag ze niet opslokken.
  assert.match(
    judgeBooking(
      new URL('https://www.booking.com/searchresults.nl.html?closed_msg=673610&dest_id=900040865'),
      202,
      'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fcasa-di-langa.html%3Fkeep_landing%3D1&sid=x',
    ),
    /zoekresultaten/,
  );
});

test('Booking: onvindbare zoekterm → home blijft rood, met eigen reden (LAT-5014)', () => {
  assert.match(
    judgeBooking(
      new URL('https://www.booking.com/index.nl.html?errorc_searchstring_not_found=ss'),
      202,
      'https://www.booking.com/searchresults.html?ss=agriturismo+La+Morra+Barolo',
    ),
    /zoekterm levert niets op/,
  );
});

test('Booking: 404 op zoek-URL noemt het echte pad-probleem, niet "property weg"', () => {
  assert.match(
    judgeBooking(
      new URL('https://www.booking.com/search.html?ss=Nuoro'),
      404,
      'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fsearch.html%3Fss%3DNuoro%252C%2BSardinia&sid=x',
    ),
    /searchresults\.html/,
  );
});

test('bookingSourceIntent: CJ-wrapper wordt uitgepakt', () => {
  assert.equal(
    bookingSourceIntent(
      'https://www.kqzyfj.com/click-101734849-15734897?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fcasa-di-langa.html&sid=x',
    ),
    'property',
  );
  assert.equal(bookingSourceIntent('https://www.booking.com/searchresults.html?ss=Langhe'), 'search');
});

test('isBlockOrThrottle: 403/429/5xx = block/throttle (waarschuwing)', () => {
  for (const s of [401, 403, 407, 408, 429, 500, 502, 503, 504]) {
    assert.equal(isBlockOrThrottle(s), true, `status ${s} hoort block/throttle te zijn`);
  }
});

test('isBlockOrThrottle: 404/410/200 = geen block (dood of ok)', () => {
  for (const s of [200, 301, 404, 410]) {
    assert.equal(isBlockOrThrottle(s), false, `status ${s} hoort GEEN block te zijn`);
  }
});

test('collectAffiliateUrls: dedupe + partner-detectie op gemengde HTML', () => {
  const html = `
    <a href="https://www.getyourguide.com/nl-nl/langhe-l1/barolo-t1?partner_id=CRMZDZ6&amp;cmp=streek-langhe">a</a>
    <a href="https://www.getyourguide.com/nl-nl/langhe-l1/barolo-t1?partner_id=CRMZDZ6&amp;cmp=streek-langhe">dup</a>
    <a href="https://www.kqzyfj.com/click-1-2?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fx.html&amp;sid=s1">b</a>
    <a href="/interne-link">skip</a>
    <a href="https://vinomartino.com/streken/langhe/">skip</a>`;
  const urls = collectAffiliateUrls(html);
  assert.equal(urls.length, 2);
  assert.deepEqual(urls.map((u) => u.partner).sort(), ['booking-cj', 'getyourguide']);
});
