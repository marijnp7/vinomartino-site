// LAT-12300 / pakket C — C4: productie-verificatie van de eerste-gebruik-tooltip bij "Naar de kelder".
// CI-only (Playwright staat bewust niet in package.json, zie lat2735-mobile-overflow-baseline).
// Exit 1 zodra één controle faalt; het volledige rapport gaat altijd naar stdout als JSON.
import { chromium } from 'playwright';

const BASE = process.env.VERIFY_SITE || 'https://vinomartino.com';
const PAGES = [
  { key: 'nl-home', path: '/', expect: /kelder/i },
  { key: 'nl-route', path: '/wijnroutes/langhe-piemonte/', expect: /kelder/i },
  { key: 'en-home', path: '/en/', expect: /cellar/i },
];
const WIDTHS = [320, 375];

const lum = ([r, g, b]) => {
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); };

const browser = await chromium.launch();
try {
  for (const pg of PAGES) {
    for (const w of WIDTHS) {
      const tag = `${pg.key}@${w}`;
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      const page = await ctx.newPage();
      await page.goto(BASE + pg.path, { waitUntil: 'load' });
      const tip = page.locator('[data-cellar-tip]');
      const toggle = page.locator('[data-cellar-toggle]');

      check(`${tag} initieel verborgen`, await tip.isHidden());
      await tip.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      const visible = await tip.isVisible();
      check(`${tag} zichtbaar na ~1,5 s`, visible);
      if (!visible) { await ctx.close(); continue; }
      await page.waitForTimeout(400); // fade-in afwachten voor de meting

      const m = await page.evaluate(() => {
        const t = document.querySelector('[data-cellar-tip]');
        const b = document.querySelector('[data-cellar-toggle]');
        const r = t.getBoundingClientRect();
        const de = document.documentElement;
        const cs = getComputedStyle(t);
        return {
          text: t.textContent.trim(), role: t.getAttribute('role'), id: t.id,
          describedby: b.getAttribute('aria-describedby'),
          left: Math.round(r.left), right: Math.round(r.right), vw: de.clientWidth,
          overflow: Math.max(de.scrollWidth, document.body.scrollWidth) - de.clientWidth,
          color: cs.color, bg: cs.backgroundColor, opacity: cs.opacity,
          flag: localStorage.getItem('vm-cellar-tip-seen'),
        };
      });
      check(`${tag} tekst in juiste taal`, pg.expect.test(m.text), m.text);
      check(`${tag} role=tooltip + aria-describedby`, m.role === 'tooltip' && m.describedby === m.id, `${m.role}/${m.describedby}`);
      check(`${tag} binnen viewport`, m.left >= 0 && m.right <= m.vw, `${m.left}..${m.right} van ${m.vw}`);
      check(`${tag} geen horizontale overflow`, m.overflow <= 0, `overflow=${m.overflow}`);
      check(`${tag} vlag gezet bij tonen`, m.flag === '1');

      const light = ratio(rgb(m.color), rgb(m.bg));
      check(`${tag} contrast light >= 4.5`, light >= 4.5, light.toFixed(2));
      const dark = await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'cellar');
        const cs = getComputedStyle(document.querySelector('[data-cellar-tip]'));
        const o = { color: cs.color, bg: cs.backgroundColor };
        document.documentElement.removeAttribute('data-theme');
        return o;
      });
      const darkR = ratio(rgb(dark.color), rgb(dark.bg));
      check(`${tag} contrast cellar >= 4.5`, darkR >= 4.5, darkR.toFixed(2));

      await page.keyboard.press('Escape');
      check(`${tag} Escape sluit`, await tip.isHidden());
      check(`${tag} aria-describedby weg na sluiten`, (await toggle.getAttribute('aria-describedby')) === null);

      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(2500);
      check(`${tag} komt niet terug na reload`, await tip.isHidden());
      await ctx.close();
    }
  }

  // Gedrag dat niet per pagina/breedte hoeft: klik op toggle, klik op tip, timeout, toetsenbord, cellar, reeds gekozen thema.
  const base = BASE + '/';
  const fresh = async (init) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'load' });
    return { ctx, page };
  };

  {
    const { ctx, page } = await fresh();
    await page.locator('[data-cellar-tip]').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-cellar-toggle]').click();
    check('klik op toggle sluit tip én schakelt naar cellar',
      (await page.locator('[data-cellar-tip]').isHidden()) &&
      (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'cellar');
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    const tip = page.locator('[data-cellar-tip]');
    await tip.waitFor({ state: 'visible', timeout: 5000 });
    await tip.click();
    check('klik op tip sluit', await tip.isHidden());
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    const tip = page.locator('[data-cellar-tip]');
    await tip.waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(10500);
    check('timeout (10 s) sluit', await tip.isHidden());
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    const tip = page.locator('[data-cellar-tip]');
    await tip.waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('[data-cellar-toggle]').focus();
    const focused = await page.evaluate(() => document.activeElement?.hasAttribute('data-cellar-toggle'));
    await page.keyboard.press('Enter');
    check('toetsenbord: toggle focusbaar, Enter schakelt + sluit tip',
      focused && (await tip.isHidden()) &&
      (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'cellar');
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(() => localStorage.setItem('vm-theme', 'cellar'));
    await page.waitForTimeout(2500);
    check('niet tonen als gebruiker al in cellar staat', await page.locator('[data-cellar-tip]').isHidden());
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(() => localStorage.setItem('vm-theme', 'paper'));
    await page.waitForTimeout(2500);
    check('niet tonen als thema al eens gekozen is', await page.locator('[data-cellar-tip]').isHidden());
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ site: BASE, total: results.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
