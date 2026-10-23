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

// Namen die zonder context niets zeggen (stap 3 uit LAT-14237). VoiceOver op de runner zegt
// "link Mosel 1 of 3", "visited link …", "menu pop up expanded link Ontdek", "button …".
const VAGUE = /^(klik hier|hier|meer|lees meer|meer info|meer informatie|bekijk|click here|here|more|read more|more info)$/i;
const ROLE = /\b(visited link|bezochte link|link|koppeling|button|knop)\b/i;
const NOISE = /\b(visited link|bezochte link|link|koppeling|button|knop|heading level \d|menu pop up|pop up|expanded|collapsed|current item|clickable|\d+ of \d+)\b/gi;

function nameFindings(log) {
  const out = [];
  for (const ph of log) {
    if (!ROLE.test(ph)) continue;
    const name = ph.replace(NOISE, ' ').replace(/[\s,]+/g, ' ').trim();
    if (!name) out.push({ phrase: ph, probleem: 'geen naam' });
    else if (VAGUE.test(name)) out.push({ phrase: ph, probleem: 'vage naam' });
  }
  return out;
}

async function open(page, voiceOver, path) {
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  // Na een tweede navigatie mist de Item Chooser soms "web content"; één nieuwe poging.
  try { await voiceOver.navigateToWebContent(); } catch {
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000); await voiceOver.navigateToWebContent();
  }
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
  // LAT-14237 (besluit Marijn 23-10, kaart 8c836887): de eerste macOS-run zette het filter via
  // page.selectOption en VoiceOver zei niets. Nu bedient VoiceOver het veld zelf: focus erop
  // (de VO-cursor volgt de toetsenbordfocus), VO+spatie opent het keuzemenu, pijltjes kiezen,
  // Enter bevestigt. Lukt dat niet, dan valt de stap terug op de pagina en staat dat in
  // `bediening`, zodat een stil resultaat nooit voor een VoiceOver-meting doorgaat.
  const viaVoiceOver = async (sel, value) => {
    const idx = await page.evaluate(([s, v]) => [...document.querySelector(s).options].findIndex((o) => o.value === v), [sel, value]);
    const huidig = await page.evaluate((s) => document.querySelector(s).selectedIndex, sel);
    await page.focus(sel); await page.waitForTimeout(400);
    await voiceOver.act(); await page.waitForTimeout(600);
    const stappen = idx - huidig;
    for (let i = 0; i < Math.abs(stappen); i++) await voiceOver.press(stappen > 0 ? 'ArrowDown' : 'ArrowUp');
    await voiceOver.press('Enter');
    await page.waitForTimeout(300);
    if ((await page.inputValue(sel)) === value) return 'voiceover';
    await voiceOver.press('Escape').catch(() => {});
    await page.selectOption(sel, value);
    return 'pagina (VoiceOver-bediening mislukte)';
  };
  const knopViaVoiceOver = async (sel) => {
    await page.focus(sel); await page.waitForTimeout(400);
    await voiceOver.act();
    return 'voiceover';
  };
  const act = async (label, fn) => {
    // De Guidepup-log bevat alleen frases na eigen commando's; spontane live-region-meldingen
    // lezen we uit VoiceOvers eigen "last phrase" (AppleScript). Polite meldingen wachten tot
    // VoiceOver uitgesproken is, dus 8 s in plaats van 4 s.
    const voor = await voiceOver.lastSpokenPhrase();
    await voiceOver.clearSpokenPhraseLog();
    const bediening = await fn();
    const gehoord = [];
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(500);
      const l = await voiceOver.lastSpokenPhrase();
      if (l && l !== voor && !gehoord.includes(l)) gehoord.push(l);
    }
    const telling = (await page.textContent('[data-wh-telling]'))?.trim();
    const live = await page.evaluate(() => { const t = document.querySelector('[data-wh-telling]'); const r = t?.closest('[aria-live]') || t; return { ariaLive: r?.getAttribute('aria-live'), role: r?.getAttribute('role') }; });
    // Pijltjes in een WebKit-select wijzigen de waarde al onderweg, dus VoiceOver kan een
    // tussenstand voorlezen ("17 van 128 wijnhuizen"); elke gehoorde telling telt.
    ev.push({ actie: label, bediening, telling, live, voorgelezen: gehoord, log: await voiceOver.spokenPhraseLog(), tellingGehoord: gehoord.filter((g) => /\d+( van \d+)? wijnhuizen|\d+( of \d+)? wineries/i.test(g)) });
  };
  const opt = await page.evaluate(() => [...document.querySelectorAll('#wh-bestemming option')].find((o) => o.value.startsWith('streek:'))?.value);
  await act(`regio ${opt}`, () => viaVoiceOver('#wh-bestemming', opt));
  const druif = await page.evaluate(() => [...document.querySelectorAll('#wh-druif option')].map((o) => o.value).filter(Boolean));
  if (druif[0]) await act(`druif ${druif[0]}`, () => viaVoiceOver('#wh-druif', druif[0]));
  const wis = await page.isVisible('[data-wh-wis]');
  await act('reset (Wis filters)', () => (wis ? knopViaVoiceOver('[data-wh-wis]') : viaVoiceOver('#wh-bestemming', '')));
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

for (const [i, path] of ['/wijnroutes/', process.env.A11Y_ROUTE || '/wijnroutes/bourgogne-cote-dor-villages/'].entries()) {
  test(`stap 4${'ab'[i]}: ${path}`, async ({ page, voiceOver }) => {
    await open(page, voiceOver, path);
    const all = await readAll(voiceOver, MAX * 2);
    save(`4${'ab'[i]}`, { pagina: path, lijsten: all.filter((x) => /\blist\b|\blijst\b/i.test(x)), bezocht: all.filter((x) => /visited|bezocht/i.test(x)), naamProblemen: nameFindings(all), volledig: all });
  });
}

test('stap 5: /en/ home in het Engels', async ({ page, voiceOver }) => {
  await open(page, voiceOver, '/en/');
  const htmlLang = await page.getAttribute('html', 'lang');
  const koppen = await headings(voiceOver);
  await open(page, voiceOver, '/en/');
  const all = await readAll(voiceOver);
  save(5, { pagina: '/en/', htmlLang, koppen, naamProblemen: nameFindings(all), nlWoordenInEN: all.filter((x) => /\b(Bezocht|Lees|Bekijk|Ontdek|wijnhuizen|Zoeken|Menu openen)\b/.test(x)).slice(0, 30), volledig: all });
});
