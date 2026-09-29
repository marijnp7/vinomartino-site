#!/usr/bin/env node
/**
 * LAT-11947 — DOM-test voor affiliate-links (build-script, geen workflow).
 *
 * Draait over dist/**\/*.html (of DIST_DIR / argv[2]). Per affiliate-anker:
 *   - lek: sunnycars.nl zonder TradeTracker-hop, booking.com direct, GYG zonder partner_id,
 *     Stay22 zonder aid
 *   - rel=sponsored ontbreekt
 *   - disclosure-guard: pagina met affiliate-links zonder link naar /affiliate-verklaring/
 * Met --browser (of DOM_BROWSER=1) opent hij een steekproef per sjabloon in chromium op 390 en
 * 1280 px, wacht op hydratie en meet de positie van het eerste affiliate-element en lege kaarten.
 * Exit 1 bij lekken, ontbrekende disclosure of (zonder --lenient) ontbrekende rel=sponsored.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = process.env.DIST_DIR || process.argv.slice(2).find((a) => !a.startsWith('--')) || 'dist';
const BROWSER = process.argv.includes('--browser') || process.env.DOM_BROWSER === '1';
const LENIENT = process.argv.includes('--lenient');
const SKIP_TOP = new Set(['preview']);
const TRACK_HOSTS = ['kqzyfj.com', 'dpbolvw.net', 'anrdoezrs.net', 'jdoqocy.com', 'tkqlhce.com', 'tc.tradetracker.net'];
const has = (h, d) => h === d || h.endsWith(`.${d}`);

export function classify(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  if (TRACK_HOSTS.some((d) => has(h, d))) return { partner: h.includes('tradetracker') ? 'tradetracker' : 'cj', ok: true };
  if (has(h, 'sunnycars.nl') || has(h, 'sunnycars.com')) return { partner: 'sunnycars', ok: false, why: 'Sunny Cars zonder TradeTracker' };
  if (has(h, 'booking.com')) return { partner: 'booking', ok: false, why: 'Booking direct zonder CJ-hop' };
  if (has(h, 'getyourguide.com')) return u.searchParams.get('partner_id') ? { partner: 'gyg', ok: true } : { partner: 'gyg', ok: false, why: 'GYG zonder partner_id' };
  if (has(h, 'stay22.com')) return u.searchParams.get('aid') ? { partner: 'stay22', ok: true } : { partner: 'stay22', ok: false, why: 'Stay22 zonder aid' };
  return null;
}

async function* walk(dir, top = true) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (top && e.isDirectory() && SKIP_TOP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, false);
    else if (e.name.endsWith('.html')) yield p;
  }
}

function anchors(html) {
  const out = [];
  for (const m of html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>/gi)) {
    out.push({ href: m[1].replace(/&amp;/g, '&').replace(/&#x26;/g, '&'), tag: m[0] });
  }
  return out;
}

const stats = { pages: 0, links: 0, leaks: 0, noSponsored: 0, noDisclosure: 0 };
const byPartner = {};
const leaks = [];
const templates = new Map();

for await (const file of walk(DIST)) {
  const html = await readFile(file, 'utf8');
  const rel = '/' + relative(DIST, file).replace(/index\.html$/, '').replace(/\\/g, '/');
  stats.pages++;
  let pageLinks = 0;
  for (const a of anchors(html)) {
    const c = classify(a.href);
    if (!c) continue;
    pageLinks++;
    stats.links++;
    byPartner[c.partner] = (byPartner[c.partner] || 0) + 1;
    if (!c.ok) { stats.leaks++; leaks.push(`${rel} ${c.why} ${a.href.slice(0, 120)}`); }
    if (!/rel="[^"]*\bsponsored\b/.test(a.tag)) stats.noSponsored++;
  }
  if (pageLinks && !/href="(\/en)?\/affiliate-verklaring\/?"/.test(html)) {
    stats.noDisclosure++;
    leaks.push(`${rel} disclosure ontbreekt`);
  }
  if (pageLinks) {
    const tpl = rel.split('/').filter(Boolean).filter((s) => s !== 'en')[0] || 'home';
    if (!templates.has(tpl)) templates.set(tpl, rel);
  }
}

console.log(JSON.stringify({ ...stats, byPartner }, null, 2));
leaks.slice(0, 60).forEach((l) => console.log('LEK', l));

let browserFail = false;
if (BROWSER) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const { createServer } = await import('node:http');
  const { readFile: rf } = await import('node:fs/promises');
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    try { res.end(await rf(join(DIST, p))); } catch { res.statusCode = 404; res.end(); }
  }).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  for (const [tpl, path] of templates) {
    for (const w of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width: w, height: 800 } });
      await page.goto(base + path, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const first = document.querySelector('[data-affiliate-track], a[href*="kqzyfj.com"], a[href*="tradetracker.net"]');
        const empty = [...document.querySelectorAll('.poi-card')].filter((c) => !c.querySelector('a[href]') || !c.textContent.trim()).length;
        return { firstY: first ? Math.round(first.getBoundingClientRect().top + scrollY) : null, emptyCards: empty };
      });
      console.log(`DOM ${tpl} ${path} ${w}px firstAffiliateY=${r.firstY} emptyCards=${r.emptyCards}`);
      if (r.emptyCards) browserFail = true;
      await page.close();
    }
  }
  await browser.close();
  srv.close();
}

const fail = stats.leaks > 0 || stats.noDisclosure > 0 || browserFail || (!LENIENT && stats.noSponsored > 0);
console.log(fail ? 'DOM-affiliate: ROOD' : 'DOM-affiliate: GROEN');
process.exit(fail ? 1 : 0);
