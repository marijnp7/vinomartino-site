#!/usr/bin/env node
/**
 * LAT-14304 (C5) — live-controle van accommodatiebeelden.
 *
 * Per gepubliceerde `/accommodaties/<streek>/`-pagina (NL + EN, uit de prod-sitemap)
 * wordt van elke accommodatiekaart (`article.acc-kaart`) de `<img src>` opgehaald.
 * Rood bij: non-200, `content-length` 0 / lege body, geen `image/*`-content-type
 * (de 0-byte-klasse uit HARDE REGEL 29), of een kaart zonder beeld.
 *
 * Alleen eigen domein-beelden; er wordt geen affiliate-link geopend (REGEL 11).
 *
 * Exit: 0 = schoon, 2 = ≥1 rood, 1 = scriptfout / niets gecontroleerd.
 * `--self-test` draait de canary tegen een lokale fixture-server (geen netwerk).
 */

import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { resolveSitemapUrls } from './check-affiliate-links-live.mjs';

const SITE = (process.env.ACC_IMAGES_SITE || process.env.AFFILIATE_LIVE_SITE || 'https://vinomartino.com')
  .replace(/[?#].*$/, '')
  .replace(/\/+$/, '');
const REPORT_PATH = process.env.ACC_IMAGES_REPORT || 'accommodation-images-report.md';
const UA = 'vinomartino-acc-images/1.0 (+LAT-14304)';

/** `/accommodaties/<streek>/` en `/en/accommodaties/<streek>/`, niet de index. */
export function isAccommodationPage(url) {
  try {
    return /^\/(en\/)?accommodaties\/[^/]+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Kaarten met id + img-src (null = kaart zonder beeld). Pure functie (getest). */
export function extractCards(html) {
  const cards = [];
  const re = /<article\b[^>]*class="[^"]*\bacc-kaart\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = (m[0].match(/\bid="([^"]*)"/) || [])[1] || `kaart-${cards.length + 1}`;
    const img = m[1].match(/<img\b[^>]*\bsrc="([^"]+)"/i);
    cards.push({ id, src: img ? img[1].replace(/&amp;/g, '&') : null });
  }
  return cards;
}

/** Oordeel over één beeldrespons. Pure functie (getest). */
export function judgeImage({ status, contentType, length }) {
  if (status !== 200) return `HTTP ${status ?? 'geen respons'}`;
  if (!/^image\//i.test(contentType || '')) return `geen image/* (content-type: ${contentType || 'leeg'})`;
  if (!length) return '0 bytes (HARDE REGEL 29-klasse)';
  return null;
}

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'user-agent': UA } });
  } finally {
    clearTimeout(t);
  }
}

async function probeImage(url) {
  try {
    const res = await fetchWithTimeout(url);
    const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    return { status: res.status, contentType: res.headers.get('content-type'), length: buf ? buf.length : 0 };
  } catch (err) {
    return { status: null, contentType: null, length: 0, error: String(err.message || err) };
  }
}

/** Controleer de opgegeven pagina's; geeft { pages, images, reds, cards }. */
export async function checkPages(pageUrls) {
  const reds = [];
  const seen = new Map(); // img-url → oordeel (dedup over NL/EN)
  let cards = 0;
  let pages = 0;
  for (const pageUrl of pageUrls) {
    let html;
    try {
      const res = await fetchWithTimeout(pageUrl);
      if (!res.ok) {
        reds.push({ page: pageUrl, card: '-', src: null, reason: `pagina HTTP ${res.status}` });
        continue;
      }
      html = await res.text();
    } catch (err) {
      reds.push({ page: pageUrl, card: '-', src: null, reason: `pagina onbereikbaar: ${err.message}` });
      continue;
    }
    pages++;
    for (const c of extractCards(html)) {
      cards++;
      if (!c.src) {
        reds.push({ page: pageUrl, card: c.id, src: null, reason: 'kaart zonder beeld' });
        continue;
      }
      const abs = new URL(c.src, pageUrl).toString();
      if (!seen.has(abs)) seen.set(abs, judgeImage(await probeImage(abs)));
      const reason = seen.get(abs);
      if (reason) reds.push({ page: pageUrl, card: c.id, src: abs, reason });
    }
  }
  return { pages, cards, images: seen.size, reds };
}

function report({ site, pages, cards, images, reds }) {
  const l = ['## Accommodatiebeelden live (LAT-14304, C5)', ''];
  l.push(`- Site: ${site}`);
  l.push(`- Gecontroleerd: ${pages} accommodatiepagina's (NL+EN), ${cards} kaarten, ${images} unieke beelden`);
  l.push(`- Resultaat: **${reds.length} rood**`);
  if (reds.length) {
    l.push('', '| pagina | kaart | beeld | reden |', '|---|---|---|---|');
    for (const r of reds) l.push(`| ${r.page} | ${r.card} | ${r.src || '-'} | ${r.reason} |`);
  }
  return l.join('\n') + '\n';
}

// ── Canary: fixture-server met gezonde en kapotte kaarten ────────────────────
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const card = (id, src) =>
  `<article class="acc-kaart" id="${id}"><div class="acc-kaart__media">${src ? `<img src="${src}" class="acc-kaart__img">` : ''}</div></article>`;

async function selfTest() {
  const server = createServer((req, res) => {
    const u = req.url;
    if (u === '/ok.png') return res.writeHead(200, { 'content-type': 'image/png' }), res.end(PNG);
    if (u === '/leeg.jpg') return res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': '0' }), res.end();
    if (u === '/accommodaties/gezond/') return res.writeHead(200, { 'content-type': 'text/html' }), res.end(card('a', '/ok.png') + card('b', '/ok.png'));
    if (u === '/accommodaties/kapot/')
      return res.writeHead(200, { 'content-type': 'text/html' }), res.end(card('a', '/ok.png') + card('weg', '/bestaat-niet.jpg') + card('nul', '/leeg.jpg') + card('zonder', null));
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const healthy = await checkPages([`${base}/accommodaties/gezond/`]);
    const broken = await checkPages([`${base}/accommodaties/kapot/`]);
    const reasons = broken.reds.map((r) => `${r.card}: ${r.reason}`);
    console.log(`[acc-images canary] gezond: ${healthy.cards} kaarten, ${healthy.reds.length} rood → ${healthy.reds.length === 0 ? 'GROEN' : 'ROOD'}`);
    console.log(`[acc-images canary] kapot: ${broken.cards} kaarten, ${broken.reds.length} rood → ${broken.reds.length ? 'ROOD' : 'GROEN'}`);
    for (const r of reasons) console.log(`    ✗ ${r}`);
    const ok =
      healthy.reds.length === 0 &&
      healthy.cards === 2 &&
      broken.reds.length === 3 &&
      reasons.some((r) => r.startsWith('weg: HTTP 404')) &&
      reasons.some((r) => r.startsWith('nul: 0 bytes')) &&
      reasons.some((r) => r.startsWith('zonder: kaart zonder beeld'));
    console.log(ok ? '[acc-images canary] OK: rood op kapot, groen op gezond.' : '[acc-images canary] FAIL: canary onderscheidt niet.');
    return ok ? 0 : 1;
  } finally {
    server.close();
  }
}

async function main() {
  if (process.argv.includes('--self-test')) process.exit(await selfTest());
  // Eerste GHA-run (39314445010) kreeg 0 pagina's uit de sitemap terwijl de
  // linkcheck-job ernaast er 671 kreeg: opnieuw proberen en de status loggen.
  let pageUrls = [];
  for (let attempt = 1; attempt <= 4 && pageUrls.length === 0; attempt++) {
    pageUrls = (await resolveSitemapUrls(SITE)).filter(isAccommodationPage);
    if (pageUrls.length === 0) {
      const probe = await fetchWithTimeout(`${SITE}/sitemap-index.xml`).then(
        (r) => `HTTP ${r.status} ${r.headers.get('content-type')}`,
        (e) => `fout: ${e.cause?.code || e.message}`,
      );
      console.warn(`[acc-images] poging ${attempt}: 0 accommodatiepagina's (sitemap-index: ${probe})`);
      if (attempt < 4) await new Promise((r) => setTimeout(r, 15000 * attempt));
    }
  }
  console.log(`[acc-images] ${pageUrls.length} accommodatiepagina's uit sitemap van ${SITE}`);
  const res = await checkPages(pageUrls);
  await writeFile(REPORT_PATH, report({ site: SITE, ...res }), 'utf8');
  console.log(`[acc-images] ${res.pages} pagina's, ${res.cards} kaarten, ${res.images} unieke beelden, ${res.reds.length} rood.`);
  for (const r of res.reds) console.error(`  ✗ ${r.page} [${r.card}] ${r.src || ''} — ${r.reason}`);
  if (res.pages === 0 || res.cards === 0) {
    console.error('[acc-images] FAIL: niets gecontroleerd — een lege meting is geen groen.');
    process.exit(1);
  }
  process.exit(res.reds.length ? 2 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[acc-images] onverwachte fout: ${err.stack || err}`);
    process.exit(1);
  });
}
