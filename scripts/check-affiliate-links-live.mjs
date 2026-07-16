#!/usr/bin/env node
/**
 * LAT-2532 — live affiliate-eindbestemmings-check (nightly, NIET-blokkerend).
 *
 * Aanvulling op de deterministische offline vormguard
 * (`check-affiliate-links.mjs`, LAT-2531). Die vangt alle harde 404's
 * (verzonnen GYG-pad zonder tour-id) en ontbrekende attributie offline. Wat hij
 * bewust NIET kan zien: een geldig-gevormde tour die ná merge uit de
 * GetYourGuide-catalogus valt, HTTP 200 geeft, maar **soft-redirect naar de
 * generieke zoekpagina `/s?...`**. Dat waren 5 van de 12 GYG-links in LAT-2529.
 *
 * Waarom een echte browser: GetYourGuide geeft `403` op elke curl-request,
 * ongeacht User-Agent (LAT-2252 glipte daardoor door). En een soft-redirect
 * geeft HTTP 200 — alleen op de status kijken mist hem. Je moet de
 * *eindbestemming* beoordelen. Daarom draait dit in een echte headless chromium.
 *
 * Waarom niet-blokkerend / nightly: het raakt een externe host. Een flaky net
 * of tijdelijke 5xx mag de deploy niet vals-rood maken. Een netwerktimeout is
 * hier GEEN rood (→ waarschuwing), alleen een echt kapotte eindbestemming wel.
 *
 * Werking:
 *   1. Verzamel alle unieke affiliate-eind-URL's (via de gedeelde
 *      `collectAffiliateUrls` — zelfde host-detectie als de offline guard),
 *      standaard uit de **live productie** (crawl `sitemap.xml`) zodat
 *      catalogus-drift ná deploy zichtbaar wordt. GitHub-hosted runners kunnen
 *      Directus (VPS-Docker-netwerk) niet bereiken, dus bouwen op GHA kan niet —
 *      en de live site is precies wat we willen checken. Zet `AFFILIATE_LIVE_SITE`
 *      (bv. `https://vinomartino.com`). Zonder die var valt het terug op een
 *      lokale `dist/`-scan voor handmatig testen.
 *   2. Open elke unieke URL in headless chromium, volg redirects, beoordeel de
 *      eindbestemming per partner (tourpagina vs. `/s?...`; property vs. home).
 *   3. Retry 2–3x met exponentiële backoff; cache per URL binnen de run;
 *      timeout/onbereikbaar = grijs (waarschuwing), geen rood.
 *   4. Bij ≥1 rood: schrijf een per-link rapport (Markdown) naar
 *      `AFFILIATE_LIVE_REPORT` en exit 2, zodat de nightly-workflow er een issue
 *      van maakt. Alleen waarschuwingen → exit 0.
 *
 * Exitcodes: 0 = schoon (of alleen onbereikbaar), 2 = ≥1 kapotte eindbestemming,
 * 1 = onverwachte scriptfout.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectAffiliateUrls } from './check-affiliate-links.mjs';

const DIST_DIR = process.env.DIST_DIR || process.argv[2] || 'dist';
const LIVE_SITE = (process.env.AFFILIATE_LIVE_SITE || '').replace(/\/+$/, '');
const MAX_PAGES = Number(process.env.AFFILIATE_LIVE_MAX_PAGES || 3000);
const REPORT_PATH = process.env.AFFILIATE_LIVE_REPORT || 'affiliate-live-report.md';
const MAX_ATTEMPTS = Number(process.env.AFFILIATE_LIVE_RETRIES || 3);
const NAV_TIMEOUT_MS = Number(process.env.AFFILIATE_LIVE_TIMEOUT_MS || 30000);
const CONCURRENCY = Number(process.env.AFFILIATE_LIVE_CONCURRENCY || 2);
// Beleefdheids-throttle per navigatie (jitter 0.5–1.5×) om Booking-rate-limit
// (429 vanaf één runner-IP) te dempen; 0 = uit.
const THROTTLE_MS = Number(process.env.AFFILIATE_LIVE_THROTTLE_MS || 600);
// Aparte, gecapte issue-body (de volledige lijst kan >65536 tekens worden en
// laat `gh issue create` omvallen). De volledige lijst blijft in REPORT_PATH.
const ISSUE_BODY_PATH = process.env.AFFILIATE_LIVE_ISSUE_BODY || 'affiliate-live-issue.md';
const ISSUE_BODY_MAX_REDS = Number(process.env.AFFILIATE_LIVE_ISSUE_MAX_REDS || 30);

function normHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, '');
}

// ── HTTP-status-klassen ──────────────────────────────────────────────────────
// Een block (403) of rate-limit (429) van een externe host is GEEN dood-signaal:
// GetYourGuide blokkeert elk headless/datacenter-IP met 403, en Booking throttlet
// honderden deeplinks vanaf één GHA-runner-IP met 429. Die als "kapot" markeren
// gaf ~79% false-reds in de eerste nachtrun (LAT-2532). Alleen een definitief
// "weg"-signaal (404/410) of een soft-redirect naar een zoek-/home-pagina telt
// als rood; block/throttle/5xx → onbereikbaar (waarschuwing, geen rood).
const DEAD_STATUS = new Set([404, 410]);
export function isBlockOrThrottle(status) {
  return (
    status === 401 ||
    status === 403 ||
    status === 407 ||
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

// Strip een leidend locale-segment (nl-nl, en, de-de) — zelfde regel als de
// offline guard, zodat "tour" vs. "zoekpagina" op het echte pad wordt bepaald.
function pathSegments(u) {
  const segs = u.pathname.split('/').filter(Boolean);
  if (segs.length > 0 && /^[a-z]{2}(-[a-z]{2})?$/.test(segs[0])) segs.shift();
  return segs;
}

// ── Per-partner eindbestemmings-oordeel ──────────────────────────────────────
// Krijgt (finalUrl-object, httpStatus) → null (ok) of reden-string (rood).

export function judgeGetYourGuide(fu, status) {
  if (status && DEAD_STATUS.has(status)) return `HTTP ${status} op eindbestemming — tour weg`;
  const host = normHost(fu.hostname);
  if (!/(^|\.)getyourguide\.[a-z.]+$/.test(host)) {
    return `eindbestemming van GYG-host (${host}) — onverwachte redirect`;
  }
  const segs = pathSegments(fu);
  // Geen pad meer over → geland op GYG-home i.p.v. de tour.
  if (segs.length === 0) return 'soft-redirect naar GYG-home — tour bestaat niet meer in de catalogus';
  // Eerste segment exact "s" (of "search") → generieke zoekpagina /s?... .
  if (segs[0] === 's' || segs[0] === 'search') {
    return 'soft-redirect naar zoekpagina /s?... — tour uit de catalogus gevallen (LAT-2529-patroon)';
  }
  // Zoekquery op een verder lege listing → ook zoeklijst.
  if (fu.searchParams.has('q') && segs.length <= 1) {
    return 'geland op zoeklijst (?q=…) i.p.v. tourpagina';
  }
  return null;
}

export function judgeBooking(fu, status) {
  if (status && DEAD_STATUS.has(status)) return `HTTP ${status} op eindbestemming — property weg`;
  const host = normHost(fu.hostname);
  if (host !== 'booking.com') {
    return `eindbestemming niet booking.com maar "${host}" — kapotte redirect`;
  }
  const path = fu.pathname.toLowerCase();
  // Property-pagina's zitten onder /hotel/… (of /hostel/, /apartments/, …).
  // Landen op de home of een generieke zoek-/foutpagina = kapot.
  if (path === '/' || path === '' || path.startsWith('/index')) {
    return 'geland op Booking-home i.p.v. de property-pagina — deeplink verlopen';
  }
  if (path.includes('/searchresults') || fu.searchParams.has('ss')) {
    return 'geland op Booking-zoekresultaten i.p.v. de specifieke property';
  }
  if (path.includes('error') || path.includes('unavailable')) {
    return 'Booking-fout-/onbeschikbaar-pagina';
  }
  return null;
}

const JUDGES = {
  getyourguide: judgeGetYourGuide,
  'booking-cj': judgeBooking,
  'booking-direct': judgeBooking,
  awin: judgeBooking,
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Open één URL in de browser en beoordeel de eindbestemming.
 * @returns {{status:'ok'|'red'|'unreachable', httpStatus:number|null, finalUrl:string|null, reason:string|null}}
 */
async function visit(browser, entry) {
  const judge = JUDGES[entry.partner];
  // Jitter-throttle vóór de navigatie om rate-limits (Booking 429) te dempen.
  if (THROTTLE_MS > 0) await sleep(Math.round(THROTTLE_MS * (0.5 + Math.random())));
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/124.0.0.0 Safari/537.36',
      locale: 'nl-NL',
    });
    const page = await context.newPage();
    try {
      const resp = await page.goto(entry.url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      });
      // Geef een client-side (JS) redirect nog even de tijd om te settelen.
      await page.waitForTimeout(1500);
      const httpStatus = resp ? resp.status() : null;
      let finalUrl;
      try {
        finalUrl = new URL(page.url());
      } catch {
        finalUrl = null;
      }
      await context.close();
      if (!finalUrl) {
        return { status: 'red', httpStatus, finalUrl: null, reason: 'geen geldige eind-URL' };
      }
      // Block/throttle/serverfout ≠ dood → onbereikbaar (waarschuwing), geen rood.
      if (httpStatus && isBlockOrThrottle(httpStatus)) {
        return {
          status: 'unreachable',
          httpStatus,
          finalUrl: finalUrl.toString(),
          reason: `HTTP ${httpStatus} — block/rate-limit vanaf headless GHA-runner-IP (geen dood-signaal)`,
        };
      }
      const reason = judge ? judge(finalUrl, httpStatus) : null;
      return {
        status: reason ? 'red' : 'ok',
        httpStatus,
        finalUrl: finalUrl.toString(),
        reason,
      };
    } catch (err) {
      lastErr = err;
      await context.close().catch(() => {});
      if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s
    }
  }
  // Alle pogingen faalden op netwerk/timeout → grijs, GEEN rood.
  return {
    status: 'unreachable',
    httpStatus: null,
    finalUrl: null,
    reason: lastErr ? String(lastErr.message || lastErr).split('\n')[0] : 'onbereikbaar',
  };
}

async function* walkHtml(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(full);
    else if (e.isFile() && e.name.endsWith('.html')) yield full;
  }
}

// Verzamel unieke affiliate-URL's + op welke pagina('s) ze staan.
async function collectFromDist(dir) {
  const byUrl = new Map(); // url → { url, partner, pages:Set }
  let scanned = 0;
  for await (const file of walkHtml(dir)) {
    scanned++;
    const html = await readFile(file, 'utf8');
    for (const { url, partner } of collectAffiliateUrls(html)) {
      const rel = file.startsWith(dir) ? file.slice(dir.length).replace(/^\/+/, '') : file;
      if (!byUrl.has(url)) byUrl.set(url, { url, partner, pages: new Set() });
      byUrl.get(url).pages.add(rel);
    }
  }
  return { scanned, entries: [...byUrl.values()] };
}

// ── Live-modus: crawl de prod-sitemap en verzamel affiliate-URL's ────────────
function extractLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) locs.push(m[1].trim());
  return locs;
}

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': 'vinomartino-affiliate-nightly/1.0 (+LAT-2532)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Astro levert een sitemap-index (sitemap-index.xml → sub-sitemaps) of één
// sitemap.xml. Haal beide plat naar een lijst pagina-URL's.
async function resolveSitemapUrls(base) {
  const candidates = [`${base}/sitemap-index.xml`, `${base}/sitemap.xml`];
  const pages = new Set();
  for (const smUrl of candidates) {
    const xml = await fetchText(smUrl);
    if (!xml) continue;
    const locs = extractLocs(xml);
    for (const loc of locs) {
      if (/\.xml($|\?)/i.test(loc)) {
        const sub = await fetchText(loc);
        if (sub) for (const p of extractLocs(sub)) pages.add(p);
      } else {
        pages.add(loc);
      }
    }
    if (pages.size > 0) break;
  }
  return [...pages].filter((u) => u.startsWith(base)).slice(0, MAX_PAGES);
}

async function collectFromLive(base) {
  const pages = await resolveSitemapUrls(base);
  if (pages.length === 0) {
    throw new Error(`geen pagina's uit sitemap van ${base} — sitemap-index.xml/sitemap.xml onbereikbaar?`);
  }
  const byUrl = new Map();
  let scanned = 0;
  await runPool(
    pages,
    async (pageUrl) => {
      const html = await fetchText(pageUrl);
      if (!html) return;
      scanned++;
      for (const { url, partner } of collectAffiliateUrls(html)) {
        if (!byUrl.has(url)) byUrl.set(url, { url, partner, pages: new Set() });
        byUrl.get(url).pages.add(pageUrl);
      }
    },
    8,
  );
  return { scanned, entries: [...byUrl.values()] };
}

async function runPool(items, worker, size) {
  const results = new Array(items.length);
  let i = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, next));
  return results;
}

async function main() {
  const source = LIVE_SITE ? `live: ${LIVE_SITE}` : `dist: ${DIST_DIR}`;
  console.log(`[affiliate-live] bron = ${source}`);
  const { scanned, entries } = LIVE_SITE
    ? await collectFromLive(LIVE_SITE)
    : await collectFromDist(DIST_DIR);
  if (scanned === 0) {
    console.error(
      LIVE_SITE
        ? `[affiliate-live] FAIL: geen pagina's opgehaald van ${LIVE_SITE}.`
        : `[affiliate-live] FAIL: geen HTML gevonden in '${DIST_DIR}' — is de build gelukt?`,
    );
    process.exit(1);
  }
  if (entries.length === 0) {
    console.log(`[affiliate-live] OK: ${scanned} HTML-bestanden, 0 affiliate-links om live te checken.`);
    return;
  }

  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    console.error(
      '[affiliate-live] FAIL: playwright niet beschikbaar. Deze check draait CI-only in de nightly-workflow ' +
        '(npm i -D playwright && npx playwright install --with-deps chromium). ' +
        'Het staat bewust NIET in package.json om de blokkerende VPS-build niet te belasten.',
    );
    console.error(String(err.message || err));
    process.exit(1);
  }

  console.log(
    `[affiliate-live] ${entries.length} unieke affiliate-URL('s) uit ${scanned} HTML-bestanden — headless chromium…`,
  );
  const browser = await playwright.chromium.launch({ args: ['--no-sandbox'] });
  let results;
  try {
    results = await runPool(entries, (entry) => visit(browser, entry), CONCURRENCY);
  } finally {
    await browser.close();
  }

  const reds = [];
  const unreachable = [];
  results.forEach((r, idx) => {
    const e = entries[idx];
    if (r.status === 'red') reds.push({ ...e, ...r });
    else if (r.status === 'unreachable') unreachable.push({ ...e, ...r });
  });

  const okCount = results.length - reds.length - unreachable.length;
  console.log(
    `[affiliate-live] resultaat: ${okCount} ok, ${reds.length} kapot, ${unreachable.length} onbereikbaar.`,
  );

  for (const u of unreachable) {
    console.warn(`  ⚠ onbereikbaar (${u.partner}): ${u.url} — ${u.reason}`);
  }

  // Groepeer rood per (partner + reden) voor een compacte samenvatting.
  const byReason = new Map();
  for (const h of reds) {
    const key = `${h.partner} — ${h.reason}`;
    byReason.set(key, (byReason.get(key) || 0) + 1);
  }
  const breakdown = [...byReason.entries()].sort((a, b) => b[1] - a[1]);

  const summaryLines = () => {
    const l = [];
    l.push('## Live affiliate-eindbestemmings-check (LAT-2532)');
    l.push('');
    l.push(`- Gescand: ${scanned} HTML-bestanden, ${entries.length} unieke affiliate-URL('s)`);
    l.push(`- Resultaat: **${reds.length} kapot**, ${unreachable.length} onbereikbaar (block/throttle/timeout, geen rood), ${okCount} ok`);
    l.push('');
    if (breakdown.length > 0) {
      l.push('| # | reden |');
      l.push('|---|---|');
      for (const [key, n] of breakdown) l.push(`| ${n} | ${key} |`);
      l.push('');
    }
    return l;
  };

  const redDetail = (h) => {
    const l = [];
    l.push(`- **${h.partner}** — ${h.reason}`);
    l.push(`  - link: \`${h.url}\``);
    if (h.finalUrl) l.push(`  - geland op: \`${h.finalUrl}\`${h.httpStatus ? ` (HTTP ${h.httpStatus})` : ''}`);
    l.push(`  - op pagina('s): ${[...h.pages].map((p) => `\`${p}\``).join(', ')}`);
    return l;
  };

  // Volledig rapport (artifact + job-summary; geen tekenlimiet die telt).
  const full = summaryLines();
  if (reds.length > 0) {
    full.push('### Kapotte eindbestemmingen');
    full.push('');
    for (const h of reds) full.push(...redDetail(h));
    full.push('');
  }
  if (unreachable.length > 0) {
    full.push('### Onbereikbaar (waarschuwing, geen rood)');
    full.push('');
    for (const h of unreachable) full.push(`- ${h.partner}: \`${h.url}\` — ${h.reason}`);
    full.push('');
  }
  await writeFile(REPORT_PATH, full.join('\n'), 'utf8');

  // Gecapte issue-body: GitHub weigert >65536 tekens. Toon de breakdown + de
  // eerste N kapotte links; de rest staat in het volledige rapport-artifact.
  const issue = summaryLines();
  if (reds.length > 0) {
    const shown = reds.slice(0, ISSUE_BODY_MAX_REDS);
    issue.push(`### Kapotte eindbestemmingen (eerste ${shown.length} van ${reds.length})`);
    issue.push('');
    for (const h of shown) issue.push(...redDetail(h));
    if (reds.length > shown.length) {
      issue.push('');
      issue.push(`_… nog ${reds.length - shown.length} kapotte link(s). Volledige lijst: artifact **affiliate-live-report** + de job-summary van deze workflow-run._`);
    }
    issue.push('');
  }
  await writeFile(ISSUE_BODY_PATH, issue.join('\n'), 'utf8');

  if (reds.length > 0) {
    console.error(`[affiliate-live] ${reds.length} kapotte eindbestemming(en) — rapport: ${REPORT_PATH}`);
    for (const h of reds) {
      console.error(`  ✗ ${h.partner}: ${h.url}\n      → ${h.finalUrl || '(geen)'} — ${h.reason}`);
    }
    process.exit(2);
  }

  console.log('[affiliate-live] OK: geen kapotte affiliate-eindbestemmingen.');
}

// Alleen draaien als CLI (niet bij import vanuit de test).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[affiliate-live] onverwachte fout: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
}
