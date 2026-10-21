#!/usr/bin/env node
/**
 * LAT-12562 — klik-tijd-attributie: wat doet een ECHTE klik op een affiliate-CTA?
 *
 * De bronhref in de HTML bewijst niet welke attributie de browser uiteindelijk
 * gebruikt (Stay22/LinkSwap kan bij laden of bij klik herschrijven). Deze meting
 * opent per pagina een verse browsercontext, wacht tot externe scripts geladen
 * zijn, doet een echte `locator.click()` op een representatieve CTA per type
 * (CJ-hotel, GYG-tour, autohuur, Stay22 Hyperlink22) en legt vast:
 *   - bronhref zoals de DOM hem vlak vóór de klik heeft (na Stay22-load);
 *   - elke document-request daarna, inclusief serverredirects (redirectedFrom);
 *   - de uiteindelijke bestemming en de partnerparameters daarin;
 *   - het eigen beacon naar /api/clicks/affiliate (partner, subid, first_referrer_host).
 *
 * Testevents apart: de pagina krijgt `?lat12562=clicktime` en de CTA vóór de klik
 * `data-affiliate-placement=lat12562-clicktime`, zodat de rij in affiliate_clicks
 * uit de echte tellingen te filteren is. Er wordt niets geboekt of ingevuld: de
 * meting stopt bij het laden van de landingspagina van de partner.
 *
 * Geactiveerd vanuit check-affiliate-links-live.mjs, alleen bij handmatige
 * dispatch van de nightly met site=`https://vinomartino.com/?lat12562=clicktime`.
 * De nachtelijke run verandert niet.
 */
import { writeFile } from 'node:fs/promises';

const PAGES = ['/streken/bourgogne/', '/en/streken/bourgogne/', '/artikelen/auto-huren-sardinie/', '/en/artikelen/auto-huren-sardinie/'];

const CTAS = [
  { type: 'hotel-cj', selector: 'a[href*="kqzyfj.com"], a[href*="anrdoezrs.net"], a[href*="dpbolvw.net"]' },
  { type: 'tour-gyg', selector: 'a[href*="getyourguide."]' },
  { type: 'autohuur', selector: 'a[href*="discovercars"], a[href*="sunnycars"], a[href*="tradetracker"]' },
  { type: 'stay22-hyperlink22', selector: 'a[data-is-hyperlink22], a[href*="stay22.com"]' },
  // LAT-13406: een affiliate-link die de redactie in de body zette (markdown.ts trackAffiliateHastLinks).
  { type: 'body-link', selector: 'a[data-affiliate-placement="body-link"]', placement: 'lat12562-clicktime-body-link' },
];

const PARAM_KEYS = ['aid', 'label', 'sid', 'partner_id', 'cmp', 'a_aid', 'affiliate', 'campaign', 'utm_source', 'utm_medium', 'utm_campaign', 'chan', 'r'];
const SETTLE_MS = Number(process.env.LAT12562_SETTLE_MS || 6000);
const AFTER_CLICK_MS = Number(process.env.LAT12562_AFTER_CLICK_MS || 15000);

function pickParams(url) {
  try {
    const u = new URL(url);
    const out = {};
    for (const k of PARAM_KEYS) if (u.searchParams.has(k)) out[k] = u.searchParams.get(k);
    return out;
  } catch {
    return {};
  }
}

function short(url, n = 220) {
  return url && url.length > n ? `${url.slice(0, n)}…` : url;
}

async function measure(browser, site, path, cta) {
  const context = await browser.newContext({ locale: path.startsWith('/en/') ? 'en-GB' : 'nl-NL' });
  // LAT-14258: nooit een echte affiliate-klik. Navigaties buiten de site worden na het
  // vastleggen (request-event hierboven) afgebroken, dus geen hit bij Stay22/Booking/GYG.
  await context.route('**/*', (r) => (r.request().isNavigationRequest() && !r.request().url().startsWith(site) ? r.abort() : r.continue()));
  const docs = [];
  const beacons = [];
  const partnerHits = new Set();
  context.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/clicks/affiliate')) {
      let body = req.postData() || '';
      try {
        body = JSON.parse(body);
      } catch {}
      beacons.push(body);
      return;
    }
    if (/[?&](aid|partner_id|a_aid)=/.test(url) && !url.includes('vinomartino.com')) partnerHits.add(short(url));
    if (req.resourceType() === 'document' && !url.startsWith(site)) {
      const chain = [];
      for (let r = req.redirectedFrom(); r; r = r.redirectedFrom()) chain.unshift(short(r.url()));
      docs.push({ url: short(url), redirectedFrom: chain, params: pickParams(url) });
    }
  });
  const row = { page: path, type: cta.type };
  try {
    const page = await context.newPage();
    await page.goto(`${site}${path}?lat12562=clicktime`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    const loc = page.locator(cta.selector).filter({ visible: true }).first();
    if ((await loc.count()) === 0) {
      row.result = 'geen zichtbare CTA van dit type op de pagina';
      return row;
    }
    await loc.scrollIntoViewIfNeeded();
    row.sourceHref = short(await loc.getAttribute('href'), 400);
    row.sourceParams = pickParams(row.sourceHref);
    row.tracked = (await loc.getAttribute('data-affiliate-track')) !== null;
    row.label = ((await loc.innerText().catch(() => '')) || '').trim().slice(0, 80);
    // Vastpinnen vóór de klik: een Playwright-locator resolvet opnieuw, en na het overschrijven van
    // data-affiliate-placement matcht de body-link-selector anders de vólgende body-link (zonder testplacement).
    await loc.evaluate((el, p) => { el.setAttribute('data-affiliate-placement', p); el.setAttribute('data-lat12562-target', '1'); }, cta.placement || 'lat12562-clicktime');
    const hit = page.locator('[data-lat12562-target="1"]');
    docs.length = 0;
    const popup = context.waitForEvent('page', { timeout: AFTER_CLICK_MS }).catch(() => null);
    await hit.click({ timeout: 10000 });
    const target = (await popup) || page;
    await target.waitForLoadState('load', { timeout: AFTER_CLICK_MS }).catch(() => {});
    await target.waitForTimeout(4000);
    row.openedNewTab = target !== page;
    row.finalUrl = short(target.url(), 400);
    row.finalHost = (() => {
      try {
        return new URL(target.url()).hostname;
      } catch {
        return '';
      }
    })();
    row.finalParams = pickParams(target.url());
    row.documentHops = docs;
    row.result = 'geklikt';
  } catch (err) {
    row.result = `fout: ${String(err.message || err).slice(0, 200)}`;
  } finally {
    row.beacons = beacons;
    row.partnerParamRequests = [...partnerHits].slice(0, 15);
    await context.close();
  }
  return row;
}

function toMarkdown(rows, site) {
  const lines = [
    '# LAT-12562 klik-tijd-attributie',
    '',
    `Site: ${site} · gemeten ${new Date().toISOString()} · testplacement \`lat12562-clicktime\``,
    '',
    '| pagina | type | eigen tracking | bron-params | eindhost | eind-params | beacon (partner/subid/first_ref) | resultaat |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const b = r.beacons?.[0];
    const beacon = b && typeof b === 'object' ? `${b.partner || ''} / ${b.subid || '–'} / ${b.first_referrer_host || '–'}` : r.beacons?.length ? 'onleesbaar' : 'geen';
    lines.push(
      `| ${r.page} | ${r.type} | ${r.tracked ?? '–'} | \`${JSON.stringify(r.sourceParams || {})}\` | ${r.finalHost || '–'} | \`${JSON.stringify(r.finalParams || {})}\` | ${beacon} | ${r.result} |`,
    );
  }
  lines.push('', '## Ruwe meting', '', '```json', JSON.stringify(rows, null, 2), '```', '');
  return lines.join('\n');
}

export async function runClicktime(browser, site, reportPath) {
  const rows = [];
  for (const path of PAGES) {
    for (const cta of CTAS) {
      const row = await measure(browser, site, path, cta);
      console.log(`[lat12562] ${path} ${cta.type}: ${row.result} → ${row.finalHost || '-'} ${JSON.stringify(row.finalParams || {})}`);
      rows.push(row);
    }
  }
  await writeFile(reportPath, toMarkdown(rows, site));
  return rows;
}
