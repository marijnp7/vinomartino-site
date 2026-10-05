#!/usr/bin/env node
// LAT-12558 — labmeting op de 6 vaste sjablonen (mobiel, gesimuleerde throttling).
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
export const THRESHOLDS = { performance: 85, lcpMs: 2500 };
export const TEMPLATES = [
  { template: 'home', path: '/' },
  { template: 'streek', path: '/streken/langhe-piemonte/' },
  { template: 'artikel', path: '/artikelen/waar-slapen-langhe-piemonte/' },
  { template: 'artikel-grower', path: '/artikelen/grower-champagne-waarom-marijn-gestopt-is-met-grandes-marques/' },
  { template: 'route', path: '/wijnroutes/mosel-bernkastel-traben-trarbach/' },
  { template: 'artikel-en', path: '/en/artikelen/waar-slapen-langhe-piemonte/' },
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
  }));
}

export const passes = (s) => s.performance >= THRESHOLDS.performance && s.lcpMs < THRESHOLDS.lcpMs;

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

function runOnce(url, chrome, tmp) {
  const out = join(tmp, 'lh.json');
  const args = ['--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, url, '--quiet', '--output=json', `--output-path=${out}`,
    '--only-categories=performance', '--form-factor=mobile', '--throttling-method=simulate',
    '--chrome-flags=--headless=new --no-sandbox --disable-gpu'];
  const r = spawnSync('npx', args, { env: { ...process.env, ...(chrome ? { CHROME_PATH: chrome } : {}) }, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0 || !existsSync(out)) throw new Error(`lighthouse faalde op ${url}: ${(r.stderr || '').slice(-400)}`);
  const j = JSON.parse(readFileSync(out, 'utf8'));
  const a = j.audits;
  return {
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
      for (let i = 0; i < runs; i++) rs.push(runOnce(url, chrome, tmp));
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
    info.lighthouse = { measuredAt: result.measuredAt, base, allPass: result.allPass, templates: templates.map(({ template, performance, lcpMs, runs: n }) => ({ template, performance, lcpMs, runs: n })) };
    writeFileSync(buildInfo, JSON.stringify(info) + '\n');
  }
  console.log(JSON.stringify({ allPass: result.allPass, out: join(outDir, 'latest.json') }));
  if (enforce && !result.allPass) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(2); });
