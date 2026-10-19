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
