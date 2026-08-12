// LAT-2735 / pakket C — C1: mobiele overflow-baseline + basisscreenshots.
//
// Waarom in CI en niet lokaal: agent-containers hebben geen chromium-systeem-
// libraries (libglib-2.0, libnss3, libX11 … ontbreken en er is geen root om ze
// te installeren). Net als de affiliate-nightly (LAT-2532) draait dit daarom op
// een GitHub-hosted runner met een CI-only, ephemere Playwright-install.
//
// Wat het meet, per (pagina x viewportbreedte):
//   • horizontale overflow  = max(documentElement.scrollWidth, body.scrollWidth) - clientWidth
//   • welke elementen buiten de viewport steken (tag/class/breedte/overschrijding)
//   • een full-page screenshot als visuele baseline
//
// Output: mobile-overflow-baseline/<pagina>-<breedte>.png (16 stuks),
//         mobile-overflow-baseline/report.json en een markdown-samenvatting.
//
// Exit-code is ALTIJD 0 zolang de meting zelf lukte: dit is een baseline, geen
// gate. Een pagina die niet laadt is wel een harde fout (exit 1).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASELINE_SITE || 'https://vinomartino.com';
const OUT = process.env.BASELINE_OUT || 'mobile-overflow-baseline';
const REPORT_MD = process.env.BASELINE_REPORT || path.join(OUT, 'report.md');

// 4 pagina's x 4 breedtes = de 16 basisscreenshots uit C1.
const PAGES = [
  { key: 'home', path: '/' },
  { key: 'route-langhe', path: '/wijnroutes/langhe-piemonte/' },
  { key: 'streek-langhe', path: '/streken/langhe-piemonte/' },
  { key: 'accommodaties-langhe', path: '/accommodaties/langhe-piemonte/' },
];
const WIDTHS = [320, 375, 390, 430];

// Draait in de browser. Levert de overflow-meting + de overtreders.
const probe = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    // fixed/hidden elementen veroorzaken geen documentbrede scroll
    if (cs.position === 'fixed' || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const over = Math.round(r.right - vw);
    if (over > 1) {
      offenders.push({
        over,
        left: Math.round(r.left),
        width: Math.round(r.width),
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 90),
        id: el.id || null,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      });
    }
  }
  offenders.sort((a, b) => b.over - a.over);
  // Een overflow-oorzaak zet meestal een hele voorouderketen buiten beeld;
  // dedupe op (overschrijding,left,breedte) houdt één rij per echte oorzaak over.
  const seen = new Set();
  const uniq = offenders.filter((o) => {
    const k = `${o.over}:${o.left}:${o.width}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    viewportWidth: vw,
    docScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    horizontalOverflowPx: Math.max(de.scrollWidth, document.body.scrollWidth) - vw,
    offenderCount: offenders.length,
    offenders: uniq.slice(0, 12),
  };
};

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = { measuredAt: new Date().toISOString(), base: BASE, results: [] };
let loadFailures = 0;

for (const page of PAGES) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
        '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const p = await ctx.newPage();
    const url = BASE + page.path;
    const entry = { page: page.key, path: page.path, width };
    try {
      const resp = await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      entry.status = resp ? resp.status() : null;
      if (!resp || resp.status() >= 400) throw new Error(`HTTP ${entry.status}`);
      await p.waitForTimeout(700); // lazy-load / webfont-shift laten uitrazen
      Object.assign(entry, await p.evaluate(probe));
      const shot = path.join(OUT, `${page.key}-${width}.png`);
      await p.screenshot({ path: shot, fullPage: true });
      entry.screenshot = shot;
    } catch (e) {
      entry.error = String(e).slice(0, 300);
      loadFailures++;
    }
    report.results.push(entry);
    const flag =
      entry.error ? `FOUT ${entry.error.slice(0, 60)}`
      : entry.horizontalOverflowPx > 0 ? `OVERFLOW +${entry.horizontalOverflowPx}px`
      : 'ok';
    console.log(`${page.key.padEnd(22)} ${String(width).padStart(4)}px  ${flag}`);
    await ctx.close();
  }
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

// --- markdown-samenvatting (voor de job-summary en het issue-comment) ---
const lines = [];
lines.push(`# Mobiele overflow-baseline — ${BASE}`);
lines.push('');
lines.push(`Gemeten: ${report.measuredAt}`);
lines.push('');
lines.push('| pagina | 320px | 375px | 390px | 430px |');
lines.push('|---|---|---|---|---|');
for (const page of PAGES) {
  const cells = WIDTHS.map((w) => {
    const r = report.results.find((x) => x.page === page.key && x.width === w);
    if (!r) return '—';
    if (r.error) return 'FOUT';
    return r.horizontalOverflowPx > 0 ? `**+${r.horizontalOverflowPx}px**` : 'ok';
  });
  lines.push(`| \`${page.path}\` | ${cells.join(' | ')} |`);
}
lines.push('');

const withOverflow = report.results.filter((r) => !r.error && r.horizontalOverflowPx > 0);
if (withOverflow.length === 0) {
  lines.push('Geen horizontale overflow gemeten op enige combinatie.');
} else {
  lines.push('## Overtreders');
  for (const r of withOverflow) {
    lines.push('');
    lines.push(`### \`${r.path}\` @ ${r.width}px — +${r.horizontalOverflowPx}px`);
    lines.push('');
    lines.push('| over | left | breedte | element | tekst |');
    lines.push('|---|---|---|---|---|');
    for (const o of r.offenders) {
      const el = `\`<${o.tag}${o.id ? ` id="${o.id}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}>\``;
      lines.push(`| +${o.over}px | ${o.left} | ${o.width} | ${el} | ${o.text.replace(/\|/g, '\\|')} |`);
    }
  }
}
lines.push('');
lines.push(`Screenshots: ${report.results.filter((r) => r.screenshot).length}/16 in artifact \`${OUT}\`.`);

fs.writeFileSync(REPORT_MD, lines.join('\n'));
console.log(`\nrapport: ${REPORT_MD}`);
console.log(`screenshots: ${report.results.filter((r) => r.screenshot).length}/16`);

if (loadFailures > 0) {
  console.error(`\n${loadFailures} pagina('s) konden niet geladen worden — meting onvolledig.`);
  process.exit(1);
}
