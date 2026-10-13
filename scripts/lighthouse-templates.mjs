#!/usr/bin/env node
// LAT-12558/LAT-12594 — labmeting op de vaste sjablonen (mobiel, gesimuleerde throttling).
// Geen devDependency: Lighthouse draait via `npx lighthouse@<versie>`, Chrome via CHROME_PATH
// of de Playwright/Puppeteer-cache. Schrijft JSON naar --out, voegt een samenvatting toe aan
// dist/build-info.json (sleutel `lighthouse`) en faalt (exit 1) onder de drempel met --enforce.
//
//   node scripts/lighthouse-templates.mjs --base https://www.vinomartino.com --runs 3 --enforce
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LIGHTHOUSE_VERSION = '13.5.0';
export const THRESHOLDS = { performance: 85, lcpMs: 2500, cls: 0.1 };
// LAT-12594: Chrome start op de runner soms niet ("waiting for dynamic debugging port", run
// 38255026679). Eén mislukte start gooide de hele meting weg; nu een beperkte herkansing per run.
export const ATTEMPTS_PER_RUN = 3;
export const TEMPLATES = [
  { template: 'home', path: '/' },
  { template: 'streek', path: '/streken/langhe-piemonte/' },
  { template: 'artikel', path: '/artikelen/waar-slapen-langhe-piemonte/' },
  { template: 'artikel-grower', path: '/artikelen/grower-champagne-waarom-marijn-gestopt-is-met-grandes-marques/' },
  { template: 'route', path: '/wijnroutes/mosel-bernkastel-traben-trarbach/' },
  { template: 'artikel-en', path: '/en/artikelen/waar-slapen-langhe-piemonte/' },
  // LAT-12594 (actieplan kwaliteit-acht, vlak K): beide indexes + Bourgogne-detail.
  { template: 'index-wijnhuizen', path: '/wijnhuizen/' },
  { template: 'index-wijnroutes', path: '/wijnroutes/' },
  { template: 'streek-bourgogne', path: '/streken/bourgogne/' },
  { template: 'route-bourgogne', path: '/wijnroutes/bourgogne-cote-dor-villages/' },
  { template: 'artikel-bourgogne', path: '/artikelen/bourgogne-villages-zonder-grand-cru/' },
  { template: 'streek-bourgogne-en', path: '/en/streken/bourgogne/' },
];

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(rows) {
  return rows.map((r) => ({
    template: r.template,
    url: r.url,
    runs: r.runs.length,
    performance: median(r.runs.map((x) => x.performance)),
    lcpMs: Math.round(median(r.runs.map((x) => x.lcpMs))),
    fcpMs: Math.round(median(r.runs.map((x) => x.fcpMs))),
    tbtMs: Math.round(median(r.runs.map((x) => x.tbtMs))),
    cls: Math.round(median(r.runs.map((x) => x.cls)) * 1000) / 1000,
    perRunPerformance: r.runs.map((x) => x.performance),
    perRunLcpMs: r.runs.map((x) => Math.round(x.lcpMs)),
    perRunAttribution: r.runs.map(({ lcpElement, lcpPhases, layoutShifts }) => ({ lcpElement, lcpPhases, layoutShifts })),
  }));
}

export const passes = (s) => s.performance >= THRESHOLDS.performance && s.lcpMs < THRESHOLDS.lcpMs && s.cls <= THRESHOLDS.cls;

export function withRetry(fn, attempts = ATTEMPTS_PER_RUN) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return fn(); } catch (e) { last = e; console.error(`poging ${i + 1}/${attempts} mislukt: ${e.message.slice(0, 200)}`); }
  }
  throw last;
}

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/paperclip/.cache/ms-playwright', `${process.env.HOME}/.cache/ms-playwright`]) {
    if (!root || !existsSync(root)) continue;
    for (const d of readdirSync(root).filter((n) => n.startsWith('chromium-'))) {
      const p = join(root, d, 'chrome-linux64', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

// LAT-12594: LCP-element, LCP-fasen en layout-shift-bronnen uit het ruwe Lighthouse-JSON, zodat
// een FAIL te herleiden is tot een element in plaats van alleen een getal.
export function attribution(j) {
  const a = j.audits || {};
  // Lighthouse 13 levert dit via insights (lcp-breakdown-insight, cls-culprits-insight); oudere
  // versies via largest-contentful-paint-element / layout-shifts. Beide vormen worden gelezen.
  const flat = (d) => (d?.items || []).flatMap((it) => (it?.type === 'table' || it?.type === 'list' ? flat(it) : [it]));
  const node = (n) => (n ? { selector: n.selector, nodeLabel: n.nodeLabel, snippet: n.snippet?.slice(0, 300) } : null);
  const lcpItems = [...flat(a['lcp-breakdown-insight']?.details), ...flat(a['largest-contentful-paint-element']?.details)];
  const lcpNode = lcpItems.find((x) => x?.type === 'node') || lcpItems.find((x) => x?.node)?.node;
  const lcpPhases = Object.fromEntries(lcpItems.filter((x) => (x?.subpart || x?.phase) && (x.duration ?? x.timing) != null)
    .map((x) => [x.subpart || x.phase, Math.round(x.duration ?? x.timing)]));
  const shiftItems = [...flat(a['cls-culprits-insight']?.details), ...flat(a['layout-shifts']?.details)];
  const layoutShifts = shiftItems.filter((x) => x?.node && (x.value ?? x.score) != null).map((x) => ({
    score: Math.round(Number(x.value ?? x.score) * 10000) / 10000, ...node(x.node),
    causes: (x.subItems?.items || []).map((c) => c.cause || c.extra?.value || c.reason).filter(Boolean),
  }));
  return { lcpElement: node(lcpNode), lcpPhases, layoutShifts };
}

function runOnce(url, chrome, tmp, rawPath) {
  const out = join(tmp, 'lh.json');
  const args = ['--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, url, '--quiet', '--output=json', `--output-path=${out}`,
    '--only-categories=performance', '--form-factor=mobile', '--throttling-method=simulate',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu'];
  const r = spawnSync('npx', args, { env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) }, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0 || !existsSync(out)) throw new Error(`lighthouse faalde op ${url}: ${(r.stderr || '').slice(-400)}`);
  const raw = readFileSync(out, 'utf8');
  if (rawPath) writeFileSync(rawPath, raw);
  const j = JSON.parse(raw);
  const a = j.audits;
  return {
    ...attribution(j),
    performance: Math.round(j.categories.performance.score * 100),
    lcpMs: a['largest-contentful-paint'].numericValue,
    fcpMs: a['first-contentful-paint'].numericValue,
    tbtMs: a['total-blocking-time'].numericValue,
    cls: a['cumulative-layout-shift'].numericValue,
  };
}

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? def : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]);
}

async function main() {
  const base = String(arg('base', 'https://vinomartino.com')).replace(/\/$/, '');
  const runs = Number(arg('runs', 3));
  const enforce = arg('enforce', false) === true;
  const outDir = arg('out-dir', existsSync('/paperclip/reports') ? '/paperclip/reports/lighthouse' : 'lighthouse-out');
  const buildInfo = arg('build-info', 'dist/build-info.json');
  const chrome = findChrome();
  const tmp = mkdtempSync(join(tmpdir(), `lh-${process.env.PAPERCLIP_RUN_ID || process.pid}-`));
  const rows = [];
  try {
    for (const t of TEMPLATES) {
      const url = base + t.path;
      const rs = [];
      mkdirSync(join(outDir, 'raw'), { recursive: true });
      for (let i = 0; i < runs; i++) rs.push(withRetry(() => runOnce(url, chrome, tmp, join(outDir, 'raw', `${t.template}-run${i + 1}.json`))));
      rows.push({ ...t, url, runs: rs });
      console.log(`${t.template}: perf ${rs.map((x) => x.performance)} lcp ${rs.map((x) => Math.round(x.lcpMs))}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const templates = summarize(rows);
  const result = {
    measuredAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    base, lighthouse: LIGHTHOUSE_VERSION, formFactor: 'mobile', throttling: 'simulate', runsPerTemplate: runs,
    thresholds: THRESHOLDS, allPass: templates.every(passes), templates,
  };
  mkdirSync(outDir, { recursive: true });
  const stamp = result.measuredAt.slice(0, 10);
  writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(result, null, 2) + '\n');
  writeFileSync(join(outDir, 'latest.json'), JSON.stringify(result, null, 2) + '\n');
  if (existsSync(buildInfo)) {
    const info = JSON.parse(readFileSync(buildInfo, 'utf8'));
    info.lighthouse = { measuredAt: result.measuredAt, base, allPass: result.allPass, templates: templates.map(({ template, performance, lcpMs, cls, runs: n }) => ({ template, performance, lcpMs, cls, runs: n })) };
    writeFileSync(buildInfo, JSON.stringify(info) + '\n');
  }
  console.log(JSON.stringify({ allPass: result.allPass, out: join(outDir, 'latest.json') }));
  if (enforce && !result.allPass) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(2); });
