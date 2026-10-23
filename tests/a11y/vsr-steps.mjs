// LAT-14720: schermlezertest L2 (LAT-14237) met de virtuele schermlezer van Guidepup.
// Alleen lezen tegen de live site. De stappen gebruiken een smalle adapter (sr.*) zodat
// dezelfde stappen later met echte VoiceOver (@guidepup/guidepup) kunnen draaien.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const BASE = process.env.A11Y_BASE || 'https://vinomartino.com';
const OUT = process.env.A11Y_OUT || 'voorleesverslag-virtueel.json';
const MAX = Number(process.env.A11Y_MAX || 1500);
const require = createRequire(import.meta.url);
const bundle = readFileSync(
  require.resolve('@guidepup/virtual-screen-reader').replace(/cjs\/index\.(c?js)$/, 'esm/index.browser.js'), 'utf8',
).replace(/export\{(\w+) as Virtual,([\w$]+) as virtual\}/, 'window.__vsr={Virtual:$1,virtual:$2};');

// Namen die zonder context niets zeggen (stap 3 uit LAT-14237).
const VAGUE = /^(klik hier|hier|meer|lees meer|meer info|bekijk|click here|here|more|read more|bezocht)$/i;

async function open(browser, path, viewport = { width: 1280, height: 900 }, blockMap = false) {
  const page = await browser.newPage({ viewport, locale: path.startsWith('/en') ? 'en-GB' : 'nl-NL' });
  // Headless Chromium crasht op de WebGL-kaart van de hub; dan laden we de kaartbibliotheek niet.
  if (blockMap) await page.route(/maplibre|leaflet|mapbox|tiles|\.pbf(\?|$)/i, (r) => r.abort());
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }); await page.waitForTimeout(1500);
  await page.addScriptTag({ content: bundle, type: 'module' });
  await page.waitForFunction(() => window.__vsr);
  return page;
}

// Adapter: elke functie draait in de pagina. VoiceOver-variant implementeert hetzelfde.
const sr = {
  start: (p, sel = 'body') => p.evaluate(async (s) => { await window.__vsr.virtual.start({ container: document.querySelector(s) }); }, sel),
  stop: (p) => p.evaluate(() => window.__vsr.virtual.stop()),
  clear: (p) => p.evaluate(() => window.__vsr.virtual.clearSpokenPhraseLog()),
  log: (p) => p.evaluate(() => window.__vsr.virtual.spokenPhraseLog()),
  readAll: (p, max) => p.evaluate(async (max) => {
    // Stop zodra de lezer terug is bij het begin (de virtuele lezer wraparound na het einde).
    const v = window.__vsr.virtual; const first = await v.lastSpokenPhrase();
    for (let i = 0; i < max; i++) { await v.next(); if ((await v.lastSpokenPhrase()) === first) break; }
    const log = await v.spokenPhraseLog(); return log.slice(0, -1);
  }, max),
  headings: (p) => p.evaluate(async () => {
    const v = window.__vsr.virtual; await v.clearSpokenPhraseLog(); const seen = [];
    for (let i = 0; i < 200; i++) { await v.perform(v.commands.moveToNextHeading); const l = await v.lastSpokenPhrase(); if (seen[0] === l) break; seen.push(l); }
    return seen;
  }),
};

// Gesproken frases van interactieve elementen zonder (bruikbare) naam.
function nameFindings(log) {
  const out = [];
  for (const ph of log) {
    const m = ph.match(/^(link|button|visited link)(?:, (.*))?$/);
    if (!m) continue;
    const name = (m[2] || '').trim();
    if (!name) out.push({ phrase: ph, probleem: 'geen naam' });
    else if (VAGUE.test(name)) out.push({ phrase: ph, probleem: 'vage naam' });
  }
  return out;
}

const steps = [];
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
try {
  // Stap 1: home NL
  {
    const p = await open(browser, '/');
    await sr.start(p);
    const heads = await sr.headings(p);
    await sr.stop(p); await sr.start(p);
    const all = await sr.readAll(p, MAX);
    const nl = all.findIndex((x) => /^link, NL\b/i.test(x) || x === 'link, NL');
    const lang = all.filter((x) => /^link, (NL|EN)\b|English|Nederlands/i.test(x));
    await sr.stop(p); await p.close();
    // Menu op mobiele breedte (hamburger)
    const m = await open(browser, '/', { width: 390, height: 844 });
    await sr.start(m, 'header');
    const before = await sr.readAll(m, 40);
    await sr.clear(m);
    await m.click('.mobile-toggle');
    await m.waitForTimeout(400);
    const exp1 = await m.getAttribute('.mobile-toggle', 'aria-expanded');
    const lab1 = await m.getAttribute('.mobile-toggle', 'aria-label');
    await sr.stop(m); await sr.start(m, 'body');
    const menuOpen = await sr.readAll(m, 60);
    await m.keyboard.press('Escape'); await m.waitForTimeout(300);
    const exp2 = await m.getAttribute('.mobile-toggle', 'aria-expanded');
    const focusAfter = await m.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName);
    await sr.stop(m); await m.close();
    steps.push({ stap: 1, pagina: '/', koppen: heads, taalwissel: lang, naNL: nl >= 0 ? all.slice(nl, nl + 6) : null,
      menu: { header: before, naOpenen: { ariaExpanded: exp1, ariaLabel: lab1, voorgelezen: menuOpen }, naEscape: { ariaExpanded: exp2, focus: focusAfter } },
      naamProblemen: nameFindings(all), volledig: all });
  }
  // Stap 2: /wijnhuizen/ filters + live region
  {
    const p = await open(browser, '/wijnhuizen/');
    await p.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('#wh-druif')) d.open = true; }));
    await sr.start(p);
    const ev = [];
    const act = async (label, fn) => {
      await sr.clear(p); await fn(); await p.waitForTimeout(800);
      ev.push({ actie: label, telling: (await p.textContent('[data-wh-telling]'))?.trim(), voorgelezen: await sr.log(p) });
    };
    const opt = await p.evaluate(() => [...document.querySelectorAll('#wh-bestemming option')].find((o) => o.value.startsWith('streek:'))?.value);
    await act(`regio ${opt}`, () => p.selectOption('#wh-bestemming', opt));
    const druif = await p.evaluate(() => [...document.querySelectorAll('#wh-druif option')].map((o) => o.value).filter(Boolean));
    let gekozen = null;
    for (const d of druif) { // kies een druif die binnen de regio resultaten geeft, anders de eerste
      gekozen = d; await p.selectOption('#wh-druif', d); await p.waitForTimeout(150);
      if (!/^0\b|geen/i.test((await p.textContent('[data-wh-telling]')) || '')) break;
    }
    await p.selectOption('#wh-druif', ''); await p.waitForTimeout(300);
    await act(`druif ${gekozen}`, () => p.selectOption('#wh-druif', gekozen));
    const wis = await p.isVisible('[data-wh-wis]');
    await act('reset (Wis filters)', () => (wis ? p.click('[data-wh-wis]') : p.selectOption('#wh-bestemming', '')));
    const ctrls = await p.evaluate(() => ['wh-zoek', 'wh-bestemming', 'wh-druif'].map((id) => ({ id, label: document.querySelector(`label[for=${id}]`)?.textContent?.trim() })));
    await sr.stop(p); await p.close();
    steps.push({ stap: 2, pagina: '/wijnhuizen/', bedieningslabels: ctrls, events: ev });
  }
  // Stap 3: één wijnhuispagina (eerste in de lijst met een boekknop)
  {
    const lp = await browser.newPage(); await lp.goto(BASE + '/wijnhuizen/', { waitUntil: 'load' });
    const slugs = await lp.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/wijnhuizen/"]')].map((a) => a.getAttribute('href')).filter((h) => /^\/wijnhuizen\/[a-z0-9-]+\/$/.test(h)))]);
    await lp.close();
    const path = process.env.A11Y_WIJNHUIS || slugs.find((s) => s.includes('chamirey')) || slugs[0];
    const p = await open(browser, path);
    await sr.start(p);
    const all = await sr.readAll(p, MAX);
    await sr.stop(p); await p.close();
    steps.push({ stap: 3, pagina: path, linksEnKnoppen: all.filter((x) => /^(link|button|visited link)\b/.test(x)), naamProblemen: nameFindings(all), volledig: all });
  }
  // Stap 4: /wijnroutes/ en één route
  for (const path of ['/wijnroutes/', process.env.A11Y_ROUTE || '/wijnroutes/bourgogne-cote-dor-villages/']) {
    let p;
    let noot = null;
    try { p = await open(browser, path); } catch (e) {
      noot = `eerste poging: ${String(e.message).split('\n')[0]}; opnieuw met kaartbibliotheek geblokkeerd`;
      try { p = await open(browser, path, undefined, true); } catch (e2) {
        steps.push({ stap: 4, pagina: path, fout: String(e2.message).split('\n')[0], noot: `${noot}; tweede poging crasht ook` }); continue;
      }
    }
    const kaart = await p.evaluate(() => [...document.querySelectorAll('.leaflet-container, .maplibregl-map, [class*="map"], iframe')].slice(0, 5).map((e) => ({ tag: e.tagName, cls: String(e.className).slice(0, 60), role: e.getAttribute('role'), label: e.getAttribute('aria-label'), hidden: e.getAttribute('aria-hidden') })));
    await sr.start(p);
    const all = await sr.readAll(p, MAX);
    await sr.stop(p); await p.close();
    steps.push({ stap: 4, pagina: path, noot, kaartElementen: kaart, lijsten: all.filter((x) => /^list\b/.test(x)), naamProblemen: nameFindings(all), volledig: all });
  }
  // Stap 5: /en/ (home herhaald in het Engels)
  {
    const p = await open(browser, '/en/');
    const lang = await p.getAttribute('html', 'lang');
    await sr.start(p);
    const heads = await sr.headings(p);
    await sr.stop(p); await sr.start(p);
    const all = await sr.readAll(p, MAX);
    await sr.stop(p); await p.close();
    steps.push({ stap: 5, pagina: '/en/', htmlLang: lang, koppen: heads, naamProblemen: nameFindings(all), nlWoordenInEN: all.filter((x) => /\b(Bezocht|Lees|Bekijk|Ontdek|wijnhuizen|Zoeken|Menu openen)\b/.test(x)).slice(0, 30), volledig: all });
  }
} finally { await browser.close(); }
const bi = await (await fetch(BASE + '/build-info.json')).json();
writeFileSync(OUT, JSON.stringify({ methode: 'geautomatiseerd, virtueel (@guidepup/virtual-screen-reader + Playwright Chromium)', base: BASE, buildInfo: bi, gemeten: new Date().toISOString(), steps }, null, 2));
console.log('ok', OUT);
