// LAT-2532 — netwerkloze unit-tests voor het eindbestemmings-oordeel van de
// live affiliate-check. De browser-navigatie zelf is niet testbaar zonder
// externe host; hier borgen we de *beoordelingsregels* (soft-redirect naar
// /s?..., Booking-home, foutstatus) én de gedeelde URL-verzameling.

import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeGetYourGuide, judgeBooking } from './check-affiliate-links-live.mjs';
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
