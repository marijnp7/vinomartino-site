// LAT-14304 — pure functies van de accommodatiebeelden- en linkcheck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCards, judgeImage, isAccommodationPage } from './check-accommodation-images-live.mjs';
import { rotateForWeek, skipReason, isBookingEntry } from './check-affiliate-links-live.mjs';

test('isAccommodationPage: NL/EN streekpagina ja, index nee', () => {
  assert.ok(isAccommodationPage('https://vinomartino.com/accommodaties/loire/'));
  assert.ok(isAccommodationPage('https://vinomartino.com/en/accommodaties/loire/'));
  assert.ok(!isAccommodationPage('https://vinomartino.com/accommodaties/'));
  assert.ok(!isAccommodationPage('https://vinomartino.com/streken/loire/'));
});

test('extractCards: kaart met en zonder beeld', () => {
  const html =
    '<article class="acc-kaart" id="a"><picture><img src="/i/a.jpg" alt=""></picture></article>' +
    '<article class="acc-kaart" id="b"><div class="acc-kaart__body"></div></article>';
  assert.deepEqual(extractCards(html), [{ id: 'a', src: '/i/a.jpg' }, { id: 'b', src: null }]);
});

test('judgeImage: 404, 0 bytes, geen image/*, ok', () => {
  assert.match(judgeImage({ status: 404, contentType: 'text/html', length: 9 }), /404/);
  assert.match(judgeImage({ status: 200, contentType: 'image/jpeg', length: 0 }), /0 bytes/);
  assert.match(judgeImage({ status: 200, contentType: 'text/html', length: 9 }), /geen image/);
  assert.equal(judgeImage({ status: 200, contentType: 'image/jpeg', length: 9 }), null);
});

test('rotateForWeek: zelfde elementen, ander startpunt per week', () => {
  const xs = Array.from({ length: 10 }, (_, i) => i);
  const w = 7 * 86400000;
  assert.deepEqual([...rotateForWeek(xs, 0)].sort((a, b) => a - b), xs);
  assert.notDeepEqual(rotateForWeek(xs, w)[0], rotateForWeek(xs, 2 * w)[0]);
});

test('skipReason: budget op of challenge-cap bereikt', () => {
  assert.equal(skipReason({ partner: 'booking-direct', url: 'https://www.booking.com/hotel/fr/x.html' }, { deadline: 10, challengeStreak: 0 }, 5), null);
  assert.match(skipReason({ partner: 'getyourguide', url: 'https://www.getyourguide.com/x-t1/' }, { deadline: 10, challengeStreak: 0 }, 11), /tijdbudget/);
  assert.match(skipReason({ partner: 'booking-direct', url: 'https://www.booking.com/hotel/fr/x.html' }, { deadline: 99, challengeStreak: 5 }, 5), /challenges/);
  assert.equal(skipReason({ partner: 'getyourguide', url: 'https://www.getyourguide.com/x-t1/' }, { deadline: 99, challengeStreak: 5 }, 5), null);
});

test('isBookingEntry: Stay22-wrap naar Booking telt mee', () => {
  const u = 'https://www.stay22.com/allez/booking?aid=vinomartino&link=' + encodeURIComponent('https://www.booking.com/hotel/fr/x.html');
  assert.ok(isBookingEntry({ partner: 'stay22', url: u }));
  assert.ok(!isBookingEntry({ partner: 'getyourguide', url: 'https://www.getyourguide.com/x-t1/' }));
});

// LAT-14310: explicit absent-image exceptions must never hide broken images.
import { createServer } from 'node:http';
import { checkPages, missingImageException, report } from './check-accommodation-images-live.mjs';

test('exceptions are scoped to region + card, in NL and EN; Fonterutoli still needs an image', () => {
  for (const locale of ['', 'en/']) {
    assert.equal(missingImageException(`https://vinomartino.com/${locale}accommodaties/loire/`, 'acc-domaine-de-chassy')?.issue, 'LAT-14310');
    assert.equal(missingImageException(`https://vinomartino.com/${locale}accommodaties/rhone/`, 'acc-domaine-de-chassy'), null);
    assert.equal(missingImageException(`https://vinomartino.com/${locale}accommodaties/toscane-italie/`, 'acc-castello-di-fonterutoli-wine-resort'), null);
  }
  assert.equal(missingImageException('https://vinomartino.com/streken/loire/', 'acc-domaine-de-chassy'), null);
});

test('accepted blank cards are reported, while unknown blanks and broken excepted images remain red', async () => {
  const server = createServer((req, res) => {
    if (req.url.endsWith('/loire/')) {
      res.writeHead(200, { 'content-type': 'text/html' }).end(
        '<article class="acc-kaart" id="acc-domaine-de-chassy"></article>' +
        '<article class="acc-kaart" id="acc-h-tel-famille-bourgeois"><img src="/broken.jpg"></article>' +
        '<article class="acc-kaart" id="acc-unknown"></article>');
    } else res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const site = `http://127.0.0.1:${server.address().port}`;
    const result = await checkPages([`${site}/accommodaties/loire/`, `${site}/en/accommodaties/loire/`]);
    assert.equal(result.acceptedMissing.length, 2);
    assert.equal(result.reds.length, 4);
    assert.equal(result.images, 1);
    assert.equal(result.reds.filter((r) => r.reason === 'HTTP 404').length, 2);
    assert.equal(result.reds.filter((r) => r.reason === 'kaart zonder beeld').length, 2);
    assert.match(report({ site, ...result }), /LAT-14310 \/ LAT-14019/);
    assert.match(report({ site, ...result }), /Bewust zonder beeld: 2 kaarten/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
