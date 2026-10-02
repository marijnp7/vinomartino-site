/**
 * LAT-3726 — de `wine-retail`-CTA in cta-blocks.ts moet dezelfde Directus-
 * singleton gebruiken als de wijnhuis-onderbalk (LAT-3493).
 *
 * Waarom deze test bestaat
 * ------------------------
 * Er liepen twee onafhankelijke wijnretail-paden: `wineRetailLink()` (Directus)
 * en een lokale hardcoded `buildWineRetailHref()` op grapedistrict.nl, plus een
 * los tracker-label `'grapedistrict'`. Zolang de singleton leeg staat is er geen
 * zichtbaar verschil — precies daarom kan de divergentie ongemerkt terugsluipen.
 * Zodra LAT-3725 de partner invult, publiceren twee codepaden anders een andere
 * affiliate-URL en een ander tracker-label voor dezelfde partner, en dat kost
 * commissie zonder dat iets stukgaat.
 *
 * De derde test is de belangrijke: mét config moeten `resolveCtaHref()` en
 * `wineRetailLink()` op dezelfde zoekterm byte-identieke URL's opleveren.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// Eigen tmp-map: alle agents in deze container delen één /tmp onder dezelfde
// uid, dus een vaste bestandsnaam wordt stil door een andere run overschreven.
const workDir = mkdtempSync(join(tmpdir(), 'lat3726-cta-wine-'));

/** Bundelt een lib-module naar ESM zodat we hem met een gestubde fetch kunnen laden. */
async function loadModule(entry, name) {
  const outfile = join(workDir, `${name}.${process.pid}.${Math.random().toString(36).slice(2)}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  return import(outfile);
}

const PARTNER_ROW = {
  actief: true,
  naam: 'Wijnvoordeel',
  search_template: 'https://www.wijnvoordeel.nl/zoeken?q={q}&pid=vm-42',
  tracker_partner: 'wijnvoordeel',
};

/** Stub Directus zodat de singleton `row` teruggeeft; herstelt env + fetch na afloop. */
function stubDirectus(row) {
  const prev = {
    url: process.env['DIRECTUS_URL'],
    token: process.env['DIRECTUS_TOKEN'],
    fetch: globalThis.fetch,
  };
  process.env['DIRECTUS_URL'] = 'http://directus.test';
  process.env['DIRECTUS_TOKEN'] = 'stub-token';
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: row }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return {
    calls: () => calls,
    restore() {
      if (prev.url === undefined) delete process.env['DIRECTUS_URL'];
      else process.env['DIRECTUS_URL'] = prev.url;
      if (prev.token === undefined) delete process.env['DIRECTUS_TOKEN'];
      else process.env['DIRECTUS_TOKEN'] = prev.token;
      globalThis.fetch = prev.fetch;
    },
  };
}

test('zonder config rendert een wine-retail-CTA niet (fail-closed, geen kaal grapedistrict-pad)', async () => {
  const cta = await loadModule('src/lib/cta-blocks.ts', 'cta-blocks');
  const link = { partner: 'wine-retail', query: 'Barolo' };

  assert.equal(cta.ctaLinkAvailable(link, 'nl', null), false);
  assert.equal(cta.ctaLinkAvailable(link), false);
  assert.equal(cta.resolveCtaHref(link, 'cta-primary-langhe', 'nl', null), '');
  assert.equal(cta.ctaTrackPartner(link, null), 'wine-retail');
});

test('loadCtaWineRetail fetcht alleen bij een wine-retail-CTA', async () => {
  const stub = stubDirectus(PARTNER_ROW);
  try {
    const cta = await loadModule('src/lib/cta-blocks.ts', 'cta-blocks');

    // Geen wijnretail in dit blok → geen Directus-fetch.
    assert.equal(await cta.loadCtaWineRetail([{ partner: 'booking-direct' }, undefined, null]), null);
    assert.equal(stub.calls(), 0);

    const partner = await cta.loadCtaWineRetail([{ partner: 'booking-direct' }, { partner: 'wine-retail' }]);
    assert.equal(partner?.trackerPartner, 'wijnvoordeel');
    assert.equal(stub.calls(), 1);

    // Tweede aanroep komt uit de build-cache: nog steeds één fetch.
    await cta.loadCtaWineRetail([{ partner: 'wine-retail' }]);
    assert.equal(stub.calls(), 1);
  } finally {
    stub.restore();
  }
});

test('met config leveren beide wijnretail-paden dezelfde URL en hetzelfde label', async () => {
  const stub = stubDirectus(PARTNER_ROW);
  try {
    const cta = await loadModule('src/lib/cta-blocks.ts', 'cta-blocks');
    const wine = await loadModule('src/lib/wine-retail.ts', 'wine-retail');

    const producent = 'Giacomo Conterno';
    const link = { partner: 'wine-retail', query: producent };
    const partner = await cta.loadCtaWineRetail([link]);

    const ctaHref = cta.resolveCtaHref(link, 'cta-closing-langhe', 'nl', partner);
    const balkLink = await wine.wineRetailLink(producent);

    // Dit is de hele reden voor het ticket: één partner, één URL-vorm.
    assert.equal(ctaHref, balkLink.href);
    assert.equal(
      ctaHref,
      'https://www.wijnvoordeel.nl/zoeken?q=Giacomo%20Conterno&pid=vm-42',
    );
    // ... en één tracker-label, gelijk aan tracker_partner.
    assert.equal(cta.ctaTrackPartner(link, partner), balkLink.partner);
    assert.equal(cta.ctaTrackPartner(link, partner), 'wijnvoordeel');

    // Geen grapedistrict-restant meer zodra de singleton gevuld is.
    assert.doesNotMatch(ctaHref, /grapedistrict/);
  } finally {
    stub.restore();
  }
});

const DAISYCON_ROW = {
  actief: true,
  naam: 'Wijnkring',
  search_template: 'https://bdt9.net/c/?si=18166&li=1786408&wi=433764&ws={sid}&dl=search%3Fq%3D{q2}',
  tracker_partner: 'wijnkring',
};

test('Wijnkring: NL-only, sub-id per streek/plaatsing, zoekterm 2x gecodeerd binnen dl=', async () => {
  const stub = stubDirectus(DAISYCON_ROW);
  try {
    const cta = await loadModule('src/lib/cta-blocks.ts', 'cta-blocks');
    const wine = await loadModule('src/lib/wine-retail.ts', 'wine-retail');
    const link = { partner: 'wine-retail', query: 'Benanti & Co' };

    // EN: geen config laden, geen link, geen CTA.
    assert.equal(await cta.loadCtaWineRetail([link], 'en'), null);
    assert.equal(stub.calls(), 0);
    assert.equal(await wine.wineRetailLink('Benanti', 'en', 'etna__x'), null);
    assert.equal(cta.ctaLinkAvailable(link, 'en', null), false);

    const partner = await cta.loadCtaWineRetail([link], 'nl');
    assert.equal(cta.ctaLinkAvailable(link, 'nl', partner), true);

    // Sub-id: `<streek-slug>__<plaatsing>`, diakrieten weg.
    assert.equal(wine.wineRetailSubId('Côtes du Rhône', 'wijnhuis-wijnretail'), 'cotes-du-rhone__wijnhuis-wijnretail');
    assert.equal(wine.wineRetailSubId('', 'cta-primary'), 'onbekend__cta-primary');

    const href = cta.resolveCtaHref(link, 'cta-closing-etna', 'nl', partner);
    assert.equal(
      href,
      'https://bdt9.net/c/?si=18166&li=1786408&wi=433764&ws=etna__cta-closing&dl=search%3Fq%3DBenanti%2520%2526%2520Co',
    );
    // Na een keer decoderen van dl (wat Daisycon doet) staat er een geldig, 1x gecodeerd pad.
    const dl = new URL(href).searchParams.get('dl');
    assert.equal(dl, 'search?q=Benanti%20%26%20Co');
    assert.equal(new URL('https://www.wijnkring.nl/' + dl).searchParams.get('q'), 'Benanti & Co');
    assert.equal(new URL(href).searchParams.get('ws'), 'etna__cta-closing');

    const balk = await wine.wineRetailLink('Benanti & Co', 'nl', wine.wineRetailSubId('Etna', 'cta-closing'));
    assert.equal(balk.href, href);
    assert.equal(balk.partner, 'wijnkring');
  } finally {
    stub.restore();
  }
});

test.after(() => rmSync(workDir, { recursive: true, force: true }));
