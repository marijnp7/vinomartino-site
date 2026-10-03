// Dode Booking-slugs (nightly affiliate-check 03-10-2026) mogen niet meer als
// /hotel/-deeplink gerenderd worden: vervangen door de nieuwe slug of een
// expliciete zoekopdracht op de plaats. Andere links blijven ongemoeid.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
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

const { buildCjBookingLink, applyBookingOverride } = await import('../src/lib/affiliates.ts');
const target = (cj) => decodeURIComponent(new URL(cj).searchParams.get('url'));

test('Burg Schwarzenstein krijgt de nieuwe property-slug', () => {
  const t = target(buildCjBookingLink('https://www.booking.com/hotel/de/burg-schwarzenstein.nl.html', 'x'));
  assert.match(t, /\/hotel\/de\/relais-amp-chateaux-burg-schwarzenstein\.html/);
});

test('property zonder listing wordt zoekopdracht op de plaats', () => {
  for (const [slug, plaats] of [
    ['ge/hestia-wine-and-view-telavi-kakheti-georgia', 'Telavi'],
    ['it/dei-trulli', 'Alberobello'],
    ['it/sole-in-ogliastra', 'Jerzu'],
    ['pt/herdade-dos-grous', 'Albernoa'],
    ['sk/vinarsky', 'Pezinok'],
    ['sk/kastiel-palffy', 'Svätý Jur'],
  ]) {
    const t = target(buildCjBookingLink(`https://www.booking.com/hotel/${slug}.html?keep_landing=1`, 'x'));
    assert.match(t, /\/searchresults\.html/, slug);
    assert.ok(new URL(t).searchParams.get('ss').startsWith(plaats), slug);
  }
});

test('gewone links blijven ongemoeid', () => {
  const u = 'https://www.booking.com/hotel/it/palazzo-finati.html';
  assert.equal(applyBookingOverride(u), u);
  assert.match(target(buildCjBookingLink(u, 'x')), /palazzo-finati\.html/);
});
