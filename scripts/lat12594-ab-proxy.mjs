// LAT-13443 (K2): lokale A/B-proxy. Beide armen draaien via dezelfde lokale cache-proxy op de
// runner, zodat het serveerpad voor A en B identiek is (geen CDN, geen preview-slot).
//   A (poort 4401) = de productie-build byte-voor-byte.
//   B (poort 4402) = dezelfde bytes met de streek-documentbytes van PR #581 (zie transformHtml).
// Waarom geen astro build: de build leest Directus en de runner heeft daar geen token voor
// (de echte build draait op de VPS met een .env daar). Deze transformatie raakt alleen de bytes
// die de variant-commit ook raakt; /__ab/report bewijst per arm wat er veranderd is.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';

const UPSTREAM = (process.env.AB_UPSTREAM || 'https://vinomartino.com').replace(/\/$/, '');
// LAT-12594 (CTO, 16-10, CEO-besluit LAT-13193 21:37Z): variant B = documentbytes streek, gelijk aan PR #581.
// Eén variabele: de locator-SVG in .streekkaart__locator-inset wordt <img src=/geo/locator/<slug>.svg loading=lazy>
// en de GeoJSON-grens in data-streekkaart-data wordt "areaUrl". De weggehaalde inhoud serveert B als statisch bestand.
// Detailpreview, iconen, fonts, CSS en beelden ongewijzigd.
const LOCATOR = /(<div class="streekkaart__locator-inset"[^>]*>\s*)<svg class="wine-area-preview"[^>]*aria-label="([^"]*)"[^>]*?( data-astro-cid-[\w-]+)?>[\s\S]*?<\/svg>/;
const DATA = /(<script type="application\/json" data-streekkaart-data>)([\s\S]*?)(<\/script>)/;
const EMPTY_CTX = /<g class="wine-area-preview__context"[^>]*><\/g>/g;
export const assets = new Map();

export function transformHtml(html) {
  const dm = html.match(DATA);
  if (!dm || !LOCATOR.test(html)) return { html, inserted: 'none' };
  const data = JSON.parse(dm[2]);
  if (!data.area) return { html, inserted: 'none' };
  const slug = data.slug;
  const svg = html.match(LOCATOR)[0].replace(LOCATOR, (m, pre) => m.slice(pre.length));
  assets.set(`/geo/locator/${slug}.svg`, { type: 'image/svg+xml', body: Buffer.from(svg) });
  assets.set(`/geo/area/${slug}.json`, { type: 'application/json', body: Buffer.from(JSON.stringify(data.area)) });
  const { area, ...rest } = data;
  const json = JSON.stringify({ slug: rest.slug, areaUrl: `/geo/area/${slug}.json`, ...rest });
  let out = html.replace(LOCATOR, (m, pre, label, cid = '') => `${pre}<img class="wine-area-preview" src="/geo/locator/${slug}.svg" alt="${label}" loading="lazy" decoding="async"${cid}>`);
  out = out.replace(DATA, (m, a, b, c) => a + json + c).replace(EMPTY_CTX, '');
  return { html: out, inserted: `locator+area -> /geo/*/${slug}` };
}

const cache = new Map();
async function upstream(path) {
  if (!cache.has(path)) {
    cache.set(path, (async () => {
      const r = await fetch(UPSTREAM + path, { redirect: 'manual', headers: { 'user-agent': 'vinomartino-lat12594-ab' } });
      return { status: r.status, type: r.headers.get('content-type') || '', location: r.headers.get('location'), body: Buffer.from(await r.arrayBuffer()) };
    })());
  }
  return cache.get(path);
}

function arm(variant) {
  const report = { variant, html: {}, merged: {} };
  const merged = new Map();
  const derived = new Map();
  async function serve(path) {
    const u = await upstream(path);
    if (variant === 'A' || u.status !== 200 || !u.type.includes('text/html')) return u;
    if (!derived.has(path)) {
      const t = transformHtml(u.body.toString('utf8'));
      report.html[path] = { inserted: t.inserted, bytesBefore: u.body.length, bytesAfter: Buffer.byteLength(t.html) };
      derived.set(path, { ...u, body: Buffer.from(t.html) });
    }
    return derived.get(path);
  }
  async function serveMerged(path) {
    const parts = await Promise.all(merged.get(path).map(upstream));
    if (parts.some((p) => p.status !== 200)) throw new Error(`merge-bron niet 200 voor ${path}`);
    const body = Buffer.concat(parts.flatMap((p) => [p.body, Buffer.from('\n')]));
    report.merged[path] = { parts: merged.get(path), bytes: body.length };
    return { status: 200, type: 'text/css; charset=utf-8', body };
  }
  return createServer(async (req, res) => {
    const path = req.url || '/';
    try {
      if (path === '/__ab/report') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(report));
      const r = variant === 'B' && assets.has(path) ? { status: 200, ...assets.get(path) }
        : variant === 'B' && merged.has(path) ? await serveMerged(path) : await serve(path);
      const headers = { 'content-type': r.type, 'cache-control': 'no-store' };
      if (r.location) headers.location = r.location.replace(UPSTREAM, '');
      let body = r.body;
      if (/text|javascript|json|svg|xml/.test(r.type) && /gzip/.test(req.headers['accept-encoding'] || '')) {
        body = gzipSync(body);
        headers['content-encoding'] = 'gzip';
      }
      res.writeHead(r.status, headers).end(body);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'text/plain' }).end(String(e));
    }
  });
}

// Start beide armen in-process; geeft de bases terug en een close(). Draait binnen
// lighthouse-templates.mjs zodat de workflow zelf niet hoeft te veranderen.
export async function startProxies(ports = { A: 4401, B: 4402 }) {
  const servers = {};
  for (const v of ['A', 'B']) {
    servers[v] = arm(v);
    await new Promise((ok) => servers[v].listen(ports[v], '127.0.0.1', ok));
  }
  const report = async () => Object.fromEntries(await Promise.all(['A', 'B'].map(async (v) => [v, await (await fetch(`http://127.0.0.1:${ports[v]}/__ab/report`)).json()])));
  return { bases: { A: `http://127.0.0.1:${ports.A}`, B: `http://127.0.0.1:${ports.B}` }, report, close: () => Object.values(servers).forEach((s) => s.close()) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\/scripts\//, '/scripts/'))) startProxies().then((p) => console.log(`AB_BASES ${JSON.stringify(p.bases)}`));
