// LAT-14721: dezelfde vijf stappen als tests/a11y/vsr-steps.mjs (LAT-14720), nu met echte
// VoiceOver via Guidepup op een macOS-runner. Alleen lezen tegen de publieke site; opent
// geen affiliate-links (REGEL 11). Per stap een JSON-verslag in $A11Y_OUT.
import { voiceOverTest as test } from '@guidepup/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.A11Y_BASE || 'https://vinomartino.com';
const OUT = process.env.A11Y_OUT || 'voorleesverslag-voiceover';
const MAX = Number(process.env.A11Y_MAX || 120);
mkdirSync(OUT, { recursive: true });

// Namen die zonder context niets zeggen (stap 3 uit LAT-14237). VoiceOver zegt "<naam>, link".
const VAGUE = /^(klik hier|hier|meer|lees meer|meer info|meer informatie|bekijk|click here|here|more|read more|more info)$/i;
const ROLE = /(^|, )(link|visited link|bezochte link|koppeling|button|knop)(,|$)/i;

function nameFindings(log) {
  const out = [];
  for (const ph of log) {
    if (!ROLE.test(ph)) continue;
    const name = ph.replace(/,?\s*(visited link|bezochte link|link|koppeling|button|knop)\b.*$/i, '').trim();
    if (!name) out.push({ phrase: ph, probleem: 'geen naam' });
    else if (VAGUE.test(name)) out.push({ phrase: ph, probleem: 'vage naam' });
  }
  return out;
}

async function open(page, voiceOver, path) {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  await voiceOver.navigateToWebContent();
  await voiceOver.clearSpokenPhraseLog();
}

async function readAll(voiceOver, max = MAX) {
  await voiceOver.clearSpokenPhraseLog();
  for (let i = 0; i < max; i++) await voiceOver.next();
  return voiceOver.spokenPhraseLog();
}

async function headings(voiceOver, max = 40) {
  await voiceOver.clearSpokenPhraseLog();
  const seen = [];
  for (let i = 0; i < max; i++) {
    await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
    const l = await voiceOver.lastSpokenPhrase();
    if (seen.includes(l)) break;
    seen.push(l);
  }
  return seen;
}

function save(stap, data) {
  writeFileSync(join(OUT, `stap-${stap}.json`), JSON.stringify({
    methode: 'geautomatiseerd, echte VoiceOver (@guidepup/guidepup + @guidepup/playwright, WebKit, macOS-runner)',
    base: BASE, gemeten: new Date().toISOString(), stap, ...data,
  }, null, 2));
}

test.describe.configure({ mode: 'serial' });

test('stap 1: home NL, koppen, taalwissel, menu', async ({ page, voiceOver }) => {
  await open(page, voiceOver, '/');
  const koppen = await headings(voiceOver);
  await open(page, voiceOver, '/');
  const all = await readAll(voiceOver);
  // Menu op mobiele breedte
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, voiceOver, '/');
  await page.click('.mobile-toggle'); await page.waitForTimeout(500);
  const naOpenen = { ariaExpanded: await page.getAttribute('.mobile-toggle', 'aria-expanded'), voorgelezen: await voiceOver.spokenPhraseLog() };
  await voiceOver.clearSpokenPhraseLog();
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const naEscape = { ariaExpanded: await page.getAttribute('.mobile-toggle', 'aria-expanded'), voorgelezen: await voiceOver.spokenPhraseLog() };
  await page.setViewportSize({ width: 1280, height: 900 });
  save(1, { pagina: '/', koppen, taalwissel: all.filter((x) => /\b(NL|EN|English|Nederlands)\b/.test(x)), menu: { naOpenen, naEscape }, naamProblemen: nameFindings(all), volledig: all });
});

test('stap 2: /wijnhuizen/ filters en live region', async ({ page, voiceOver }) => {
  await open(page, voiceOver, '/wijnhuizen/');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { if (d.querySelector('#wh-druif')) d.open = true; }));
  const ev = [];
  const act = async (label, fn) => {
    await voiceOver.clearSpokenPhraseLog(); await fn(); await page.waitForTimeout(2500);
    ev.push({ actie: label, telling: (await page.textContent('[data-wh-telling]'))?.trim(), voorgelezen: await voiceOver.spokenPhraseLog() });
  };
  const opt = await page.evaluate(() => [...document.querySelectorAll('#wh-bestemming option')].find((o) => o.value.startsWith('streek:'))?.value);
  await act(`regio ${opt}`, () => page.selectOption('#wh-bestemming', opt));
  const druif = await page.evaluate(() => [...document.querySelectorAll('#wh-druif option')].map((o) => o.value).filter(Boolean));
  if (druif[0]) await act(`druif ${druif[0]}`, () => page.selectOption('#wh-druif', druif[0]));
  const wis = await page.isVisible('[data-wh-wis]');
  await act('reset (Wis filters)', () => (wis ? page.click('[data-wh-wis]') : page.selectOption('#wh-bestemming', '')));
  save(2, { pagina: '/wijnhuizen/', events: ev });
});

test('stap 3: wijnhuispagina, links en knoppen', async ({ page, voiceOver }) => {
  await page.goto(BASE + '/wijnhuizen/', { waitUntil: 'load' });
  const slugs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/wijnhuizen/"]')].map((a) => a.getAttribute('href')).filter((h) => /^\/wijnhuizen\/[a-z0-9-]+\/$/.test(h)))]);
  const path = process.env.A11Y_WIJNHUIS || slugs.find((s) => s.includes('chamirey')) || slugs[0];
  await open(page, voiceOver, path);
  const all = await readAll(voiceOver, MAX * 2);
  save(3, { pagina: path, linksEnKnoppen: all.filter((x) => ROLE.test(x)), naamProblemen: nameFindings(all), volledig: all });
});

test('stap 4: /wijnroutes/ en een route', async ({ page, voiceOver }) => {
  const res = [];
  for (const path of ['/wijnroutes/', process.env.A11Y_ROUTE || '/wijnroutes/bourgogne-cote-dor-villages/']) {
    await open(page, voiceOver, path);
    const all = await readAll(voiceOver, MAX * 2);
    res.push({ pagina: path, lijsten: all.filter((x) => /\blist\b|\blijst\b/i.test(x)), bezocht: all.filter((x) => /visited|bezocht/i.test(x)), naamProblemen: nameFindings(all), volledig: all });
  }
  save(4, { paginas: res });
});

test('stap 5: /en/ home in het Engels', async ({ page, voiceOver }) => {
  await open(page, voiceOver, '/en/');
  const htmlLang = await page.getAttribute('html', 'lang');
  const koppen = await headings(voiceOver);
  await open(page, voiceOver, '/en/');
  const all = await readAll(voiceOver);
  save(5, { pagina: '/en/', htmlLang, koppen, naamProblemen: nameFindings(all), nlWoordenInEN: all.filter((x) => /\b(Bezocht|Lees|Bekijk|Ontdek|wijnhuizen|Zoeken|Menu openen)\b/.test(x)).slice(0, 30), volledig: all });
});
