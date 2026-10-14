// LAT-13443 (K2): lokale A/B-proxy. Beide armen draaien via dezelfde lokale cache-proxy op de
// runner, zodat het serveerpad voor A en B identiek is (geen CDN, geen preview-slot).
//   A (poort 4401) = de productie-build byte-voor-byte.
//   B (poort 4402) = dezelfde bytes met de diff van variant 47a733e toegepast: body-@font-face
//                    (Inter, JetBrains Mono, Source Serif 4) uit de CSS, als /fonts/body-fonts.css
//                    pas na window.load geladen (noscript-fallback). Cormorant-preload en beelden
//                    ongewijzigd.
// Waarom geen astro build: de build leest Directus en de runner heeft daar geen token voor
// (de echte build draait op de VPS met een .env daar). Deze transformatie raakt alleen de bytes
// die de variant-commit ook raakt; /__ab/report bewijst per arm wat er veranderd is.
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';

const UPSTREAM = (process.env.AB_UPSTREAM || 'https://vinomartino.com').replace(/\/$/, '');
const BODY_FAMILIES = /font-family:\s*['"]?(Inter|JetBrains Mono|Source Serif 4)['"]?/;
const SNIPPET = `<script>addEventListener('load',function(){var l=document.createElement('link');l.rel='stylesheet';l.href='/fonts/body-fonts.css';document.head.appendChild(l)})</script><noscript><link rel="stylesheet" href="/fonts/body-fonts.css" /></noscript>`;

export function stripBodyFaces(css, removed) {
  return css.replace(/@font-face\s*\{[^}]*\}/g, (block) => {
    if (!BODY_FAMILIES.test(block)) return block;
    removed.push(block);
    return '';
  });
}

export function transformHtml(html, removed) {
  let out = html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_, a, css, b) => a + stripBodyFaces(css, removed) + b);
  const preload = /<link[^>]*rel="preload"[^>]*cormorant[^>]*>/i;
  const inserted = preload.test(out) ? 'after-cormorant-preload' : 'before-head-end';
  out = preload.test(out) ? out.replace(preload, (m) => m + SNIPPET) : out.replace('</head>', SNIPPET + '</head>');
  return { html: out, inserted };
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
  const report = { variant, html: {}, css: {}, removedFaces: 0 };
  const faces = new Map();
  const derived = new Map();
  async function serve(path) {
    const u = await upstream(path);
    if (variant === 'A' || u.status !== 200) return u;
    if (!derived.has(path)) {
      const removed = [];
      let body = u.body;
      if (u.type.includes('text/css')) {
        body = Buffer.from(stripBodyFaces(u.body.toString('utf8'), removed));
        report.css[path] = removed.length;
      } else if (u.type.includes('text/html')) {
        const t = transformHtml(u.body.toString('utf8'), removed);
        body = Buffer.from(t.html);
        report.html[path] = { inserted: t.inserted, inlineFacesRemoved: removed.length };
      }
      for (const f of removed) faces.set(f, true);
      report.removedFaces = faces.size;
      derived.set(path, { ...u, body });
    }
    return derived.get(path);
  }
  return createServer(async (req, res) => {
    const path = req.url || '/';
    try {
      if (path === '/__ab/report') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(report));
      let r;
      if (variant === 'B' && path === '/fonts/body-fonts.css') {
        r = { status: 200, type: 'text/css', body: Buffer.from([...faces.keys()].join('\n')) };
      } else {
        r = await serve(path);
      }
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
