// LAT-13406 — affiliate-links in de redactionele body krijgen data-affiliate-track,
// zodat de click-tracker ze ziet. Draait op de echte pipeline (zie i18n-body-links.test.mjs).
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

const { markdownToHtml, affiliatePartnerForHref } = await import('../src/lib/markdown.ts');
const { renderEnrichedRouteBody } = await import('../src/lib/route-body.ts');

const anchors = (html) => [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

const BODY = [
  '[DiscoverCars](https://www.discovercars.com/italy/sardinia?a_aid=vinomartino&chan=artikel-x)',
  '[CJ](https://www.kqzyfj.com/click-101734849-15734209?url=https%3A%2F%2Fwww.booking.com%2Fhotel%2Fit%2Fx.html&sid=artikel-x)',
  '[GYG](https://www.getyourguide.nl/x-l1/y-t123/?partner_id=CRMZDZ6)',
  '[Sunny](https://tc.tradetracker.net/?c=1&m=2&a=3&r=artikel-x)',
  '[Booking](https://www.booking.com/hotel/it/x.html)',
  '[Intern](/streken/sardegna/) [Extern](https://nl.wikipedia.org/wiki/Sardinie)',
].join('\n\n');

test('partner wordt van de host afgeleid', () => {
  assert.equal(affiliatePartnerForHref('https://www.discovercars.com/x'), 'discovercars');
  assert.equal(affiliatePartnerForHref('https://www.anrdoezrs.net/click-1-2'), 'booking');
  assert.equal(affiliatePartnerForHref('https://www.getyourguide.com/x'), 'getyourguide');
  assert.equal(affiliatePartnerForHref('https://www.stay22.com/allez/x'), 'stay22');
  assert.equal(affiliatePartnerForHref('https://www.sunnycars.nl/x'), 'sunnycars');
  assert.equal(affiliatePartnerForHref('https://evil-discovercars.com/x'), null);
  assert.equal(affiliatePartnerForHref('/streken/x/'), null);
});

test('elke affiliate-link in de body is getrackt, interne en gewone externe links niet', async () => {
  const html = await markdownToHtml(BODY, { affiliateContext: 'auto-huren-sardinie' });
  const as = anchors(html);
  const aff = as.filter((a) => /discovercars|kqzyfj|stay22|getyourguide|tradetracker/.test(a));
  assert.equal(aff.length, 5, html);
  for (const a of aff) {
    assert.match(a, /data-affiliate-track/);
    assert.match(a, /data-affiliate-placement="body-link"/);
    assert.match(a, /data-affiliate-context="auto-huren-sardinie"/);
    assert.match(a, /rel="[^"]*sponsored[^"]*"/);
    assert.match(a, /rel="[^"]*nofollow[^"]*"/);
    assert.match(a, /rel="[^"]*noopener[^"]*"/);
  }
  assert.match(html, /chan=artikel-x"[^>]*data-affiliate-partner="discovercars"/);
  assert.match(html, /tradetracker[^>]*data-affiliate-partner="sunnycars"/);
  for (const a of as.filter((x) => /sardegna|wikipedia/.test(x))) assert.doesNotMatch(a, /data-affiliate/);
});

test('regressie: kale booking.com wordt via Stay22 Allez n14-body gewrapt (LAT-14258), en daarna getrackt', async () => {
  const html = await markdownToHtml('[B](https://www.booking.com/hotel/it/x.html)', { affiliateContext: 'x' });
  const [a] = anchors(html);
  assert.doesNotMatch(a, /kqzyfj|click-101734849/);
  const href = a.match(/href="([^"]+)"/)[1].replace(/&#x26;|&amp;/g, '&');
  const u = new URL(href);
  assert.equal(u.hostname, 'www.stay22.com');
  assert.equal(u.pathname, '/allez/booking');
  assert.equal(u.searchParams.get('aid'), 'vinomartino');
  assert.equal(u.searchParams.get('campaign'), 'n14-body');
  assert.match(u.searchParams.get('link'), /^https:\/\/www\.booking\.com\/hotel\/it\/x\.html/);
  assert.match(a, /rel="[^"]*sponsored[^"]*"/);
  assert.match(a, /data-affiliate-partner="booking"/);
});

test('GYG-bodylink wordt via Stay22 Allez gewrapt met partner_id in de binnenste link', async () => {
  const html = await markdownToHtml('[G](https://www.getyourguide.com/x-l1/y-t123/?partner_id=CRMZDZ6)', { affiliateContext: 'x' });
  const [a] = anchors(html);
  const u = new URL(a.match(/href="([^"]+)"/)[1].replace(/&#x26;|&amp;/g, '&'));
  assert.equal(u.hostname, 'www.stay22.com');
  assert.equal(u.pathname, '/allez/getyourguide');
  assert.equal(u.searchParams.get('aid'), 'vinomartino');
  assert.equal(u.searchParams.get('campaign'), 'n14-body');
  assert.equal(new URL(u.searchParams.get('link')).searchParams.get('partner_id'), 'CRMZDZ6');
  assert.match(a, /rel="[^"]*sponsored[^"]*nofollow|rel="[^"]*nofollow[^"]*sponsored/);
  assert.match(a, /data-affiliate-track/);
});

test('een al gemarkeerde link houdt zijn eigen plaatsing', async () => {
  const html = await markdownToHtml('<a href="https://www.getyourguide.com/x" data-affiliate-track data-affiliate-placement="eigen">x</a>');
  const [a] = anchors(html);
  assert.match(a, /data-affiliate-placement="eigen"/);
  assert.doesNotMatch(a, /body-link/);
  assert.match(a, /rel="[^"]*sponsored/);
});

test('route-body met directives krijgt de route-slug als context', async () => {
  const { html } = await renderEnrichedRouteBody('Tekst [GYG](https://www.getyourguide.com/x-t1/)\n', {
    disclosure: '', locale: 'nl', affiliateContext: 'route-x',
    downloadFoto: async () => null, resolveBoekHref: async () => '',
  });
  assert.match(html, /data-affiliate-context="route-x"/);
});
