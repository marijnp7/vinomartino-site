// LAT-12620 — proefmeting: komt een echte browser door Booking's anti-bot-challenge?
//
// Eenmalige meting, geen onderdeel van de nightly. Opent elke URL uit sample.txt
// (20 aselect getrokken CJ→Booking-links uit run 37296470937) in Chromium en
// deelt de uitkomst in vier bakken:
//   OK        hotelpagina geladen (pad /hotel/…, property-kop aanwezig)
//   GONE      Booking leidde om naar zoekresultaten/home → hotel weg (= rood)
//   CHALLENGE 202 / challenge-pagina / geen hotelkop → géén oordeel
//   ERROR     navigatie faalde (timeout e.d.) → géén oordeel
//
// Gebruik: node booking-browser-probe.mjs <variant>   (variant = label in de uitvoer)
// Uitvoer: tabel op stdout + probe-<variant>.json + screenshots in shots-<variant>/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const variant = process.argv[2] || 'headless';
const here = path.dirname(new URL(import.meta.url).pathname);
const urls = fs.readFileSync(path.join(here, 'sample.txt'), 'utf8').trim().split('\n');
const shots = path.join(process.cwd(), `shots-${variant}`);
fs.mkdirSync(shots, { recursive: true });

const intended = (u) => {
  try {
    const inner = new URL(u).searchParams.get('url');
    return inner ? new URL(inner).pathname : null;
  } catch { return null; }
};

const browser = await chromium.launch({ headless: variant !== 'headed', channel: 'chromium' });
const ctx = await browser.newContext({ locale: 'nl-NL', viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const rows = [];
for (const [i, u] of urls.entries()) {
  const want = intended(u);
  let status = null, finalUrl = null, title = '', header = false, verdict;
  try {
    const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp?.status() ?? null;
    // Challenge-pagina's lossen zichzelf op na JS; geef ze tijd.
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    finalUrl = page.url();
    title = (await page.title()).slice(0, 80);
    header = await page
      .locator('[data-testid="property-header"], h2.pp-header__title, #hp_hotel_name')
      .first().isVisible({ timeout: 5000 }).catch(() => false);
    const p = new URL(finalUrl).pathname;
    if (header && p.startsWith('/hotel/')) verdict = 'OK';
    else if (/searchresults|\/index\.|^\/$/.test(p)) verdict = 'GONE';
    else verdict = 'CHALLENGE';
  } catch (e) {
    verdict = 'ERROR';
    title = String(e.message).slice(0, 80);
  }
  if (i < 5) await page.screenshot({ path: path.join(shots, `${i}.png`) }).catch(() => {});
  const finalPath = finalUrl ? new URL(finalUrl).pathname : null;
  rows.push({ i, verdict, status, want, finalPath, samePath: want === finalPath, header, title });
  console.log([i, verdict, status, finalPath, want === finalPath ? 'pad=ok' : 'pad≠', title].join(' | '));
  await page.waitForTimeout(3000); // traag en klein: geen scraping-volume
}
await browser.close();

const tally = rows.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
const assessed = (tally.OK || 0) + (tally.GONE || 0);
console.log(`\nSAMENVATTING ${variant}: ${JSON.stringify(tally)} — beoordeeld ${assessed}/${rows.length}`);
fs.writeFileSync(`probe-${variant}.json`, JSON.stringify({ variant, tally, assessed, n: rows.length, rows }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### ${variant}: beoordeeld ${assessed}/${rows.length}\n\n\`${JSON.stringify(tally)}\`\n\n`);
}
