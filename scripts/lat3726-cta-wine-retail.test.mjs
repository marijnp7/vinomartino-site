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

test('zonder config blijft het huidige hardcoded gedrag intact', async () => {
  const cta = await loadModule('src/lib/cta-blocks.ts', 'cta-blocks');
  const link = { partner: 'wine-retail', query: 'Barolo' };

  // Geen partner meegegeven → de oude fallback, ongewijzigd.
  const href = cta.resolveCtaHref(link, 'cta-primary-langhe', 'nl');
  assert.match(href, /^https:\/\/www\.grapedistrict\.nl\/search\?q=Barolo$/);
  assert.equal(cta.ctaTrackPartner(link), 'grapedistrict');

  // Een lege/uitgezette singleton levert null en mag hetzelfde opleveren.
  assert.equal(cta.resolveCtaHref(link, 'cta-primary-langhe', 'nl', null), href);
  assert.equal(cta.ctaTrackPartner(link, null), 'grapedistrict');
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

test.after(() => rmSync(workDir, { recursive: true, force: true }));
