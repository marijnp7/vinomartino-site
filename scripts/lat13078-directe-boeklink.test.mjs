// LAT-13078 — een boeklink op het eigen domein van een huis (geen Booking-listing)
// gaat ongewijzigd door, en de affiliate-disclosure staat alleen bij CJ/Booking/Stay22.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { accommodatieBookingDeeplink, isAffiliateHref, isDirectBoeklink } = await import('../src/lib/affiliates.ts');
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('directe boeklink blijft ongewijzigd', () => {
  const chassy = 'https://chassy.org/contact-us/';
  assert.equal(accommodatieBookingDeeplink('Domaine de Chassy', 'Loire', chassy, 'sid'), chassy);
  assert.equal(isDirectBoeklink(chassy), true);
  assert.equal(isAffiliateHref(chassy), false);
});

test('booking.com en lege links lopen via CJ en zijn affiliate', () => {
  const hotel = accommodatieBookingDeeplink('X', 'Loire', 'https://www.booking.com/hotel/fr/x.html', 'sid');
  const zoek = accommodatieBookingDeeplink('X', 'Loire', null, 'sid');
  const stay22 = accommodatieBookingDeeplink('X', 'Loire', 'https://www.stay22.com/allez/x', 'sid');
  for (const href of [hotel, zoek, stay22]) {
    assert.match(href, /kqzyfj\.com/);
    assert.equal(isAffiliateHref(href), true);
  }
  assert.equal(isDirectBoeklink('https://www.stay22.com/allez/x'), false);
  assert.equal(isDirectBoeklink('/accommodaties/loire/'), false);
});

test('verblijfkaarten tonen disclosure alleen bij affiliate', () => {
  for (const f of ['StreekDetail.astro', 'RouteItineraryDays.astro', 'AccommodatieKaart.astro']) {
    const s = src(`../src/components/${f}`);
    assert.doesNotMatch(s, /disclosure: ui\.t\('stay\.disclosure\.microcopy'\),/, f);
    assert.match(s, /isAffiliateHref/, f);
  }
});

test('REGEL 58: geen gedachtestreepjes in beeldcredits', () => {
  for (const f of ['PoiCard.astro', 'ArtikelDetail.astro', 'RouteDetail.astro', 'StreekDetail.astro', 'pages/WijnhuisPageContent.astro']) {
    assert.doesNotMatch(src(`../src/components/${f}`), /<> — |\} — <\/>/, f);
  }
});
