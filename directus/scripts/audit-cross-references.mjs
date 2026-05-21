#!/usr/bin/env node
/**
 * Cross-reference audit voor VinoMartino-content in Directus.
 *
 * Doel: verifieer dat alle artikelen, wijnhuizen, streken en routes correct
 * aan elkaar gelinked zijn zodat een lezer doorlopend door kan klikken
 * (intern linkjuice + UX). Detecteert orphans, gebroken FK-relaties, en
 * dunbevolkte junction-tables.
 *
 * Output:
 *   - Text-rapport op stdout (samenvatting + per-collection details)
 *   - JSON-dump naar /tmp/cross-reference-audit.json (voor visualisatie)
 *
 * Vereist:
 *   DIRECTUS_URL      bv. http://directus:8055
 *   DIRECTUS_TOKEN    token met read-rechten op alle collections
 *
 * Optioneel (alleen extern via CF Access):
 *   CF_ACCESS_CLIENT_ID
 *   CF_ACCESS_CLIENT_SECRET
 *
 * Run: node directus/scripts/audit-cross-references.mjs
 */

const DIRECTUS_URL = (process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const OUTPUT_PATH = process.env.OUTPUT_PATH || '/tmp/cross-reference-audit.json';

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('FOUT: DIRECTUS_URL en DIRECTUS_TOKEN zijn vereist.');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'vinomartino-audit/1.0',
};
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
  headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
  headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
}

async function fetchAll(collection, fields = '*') {
  const url = `${DIRECTUS_URL}/items/${collection}?limit=-1&fields=${fields}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`GET ${collection} → ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.data || [];
}

function pct(num, denom) {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 1000) / 10;
}

async function run() {
  console.log('\nCross-reference audit — VinoMartino Directus');
  console.log(`URL: ${DIRECTUS_URL}\n`);

  // ── Fetch alle content ──────────────────────────────────────────────
  console.log('Ophalen content...');
  const [landen, streken, wijnhuizen, routes, articles] = await Promise.all([
    fetchAll('landen', 'id,slug,name,status'),
    fetchAll('streken', 'id,slug,name,status,land_id'),
    fetchAll('wijnhuizen', 'id,slug,name,status,streek_id'),
    fetchAll('routes', 'id,slug,title,status'),
    fetchAll('articles', 'id,slug,title,status,category'),
  ]);

  console.log('Ophalen junction-tables...');
  const [routesStreken, routesWijnhuizen, articlesStreken, articlesWijnhuizen, articlesRoutes] = await Promise.all([
    fetchAll('routes_streken', 'routes_id,streken_id'),
    fetchAll('routes_wijnhuizen', 'routes_id,wijnhuizen_id'),
    fetchAll('articles_streken', 'articles_id,streken_id'),
    fetchAll('articles_wijnhuizen', 'articles_id,wijnhuizen_id'),
    fetchAll('articles_routes', 'articles_id,routes_id'),
  ]);

  // ── Build lookup-sets ────────────────────────────────────────────────
  const landenById = new Map(landen.map(x => [x.id, x]));
  const strekenById = new Map(streken.map(x => [x.id, x]));
  const wijnhuizenById = new Map(wijnhuizen.map(x => [x.id, x]));
  const routesById = new Map(routes.map(x => [x.id, x]));
  const articlesById = new Map(articles.map(x => [x.id, x]));

  // Count inbound/outbound per item
  const strekenPerLand = new Map(); // land_id → [streek]
  const wijnhuizenPerStreek = new Map();
  const routesPerStreek = new Map();
  const wijnhuizenPerRoute = new Map();
  const articlesPerStreek = new Map();
  const articlesPerWijnhuis = new Map();
  const articlesPerRoute = new Map();
  const strekenPerArticle = new Map();
  const wijnhuizenPerArticle = new Map();
  const routesPerArticle = new Map();
  const strekenPerRoute = new Map();

  const brokenLinks = [];

  // Direct FK: streek → land
  for (const s of streken) {
    if (s.land_id) {
      if (!landenById.has(s.land_id)) {
        brokenLinks.push({ from: `streek "${s.name}"`, field: 'land_id', missing: `land #${s.land_id}` });
      } else {
        if (!strekenPerLand.has(s.land_id)) strekenPerLand.set(s.land_id, []);
        strekenPerLand.get(s.land_id).push(s);
      }
    }
  }
  // Direct FK: wijnhuis → streek
  for (const w of wijnhuizen) {
    if (w.streek_id) {
      if (!strekenById.has(w.streek_id)) {
        brokenLinks.push({ from: `wijnhuis "${w.name}"`, field: 'streek_id', missing: `streek #${w.streek_id}` });
      } else {
        if (!wijnhuizenPerStreek.has(w.streek_id)) wijnhuizenPerStreek.set(w.streek_id, []);
        wijnhuizenPerStreek.get(w.streek_id).push(w);
      }
    }
  }
  // M2M: routes ↔ streken
  for (const j of routesStreken) {
    const route = routesById.get(j.routes_id);
    const streek = strekenById.get(j.streken_id);
    if (!route) brokenLinks.push({ from: `routes_streken junction`, missing: `route #${j.routes_id}` });
    if (!streek) brokenLinks.push({ from: `routes_streken junction`, missing: `streek #${j.streken_id}` });
    if (route && streek) {
      if (!routesPerStreek.has(streek.id)) routesPerStreek.set(streek.id, []);
      routesPerStreek.get(streek.id).push(route);
      if (!strekenPerRoute.has(route.id)) strekenPerRoute.set(route.id, []);
      strekenPerRoute.get(route.id).push(streek);
    }
  }
  // M2M: routes ↔ wijnhuizen
  for (const j of routesWijnhuizen) {
    const route = routesById.get(j.routes_id);
    const wijnhuis = wijnhuizenById.get(j.wijnhuizen_id);
    if (!route) brokenLinks.push({ from: `routes_wijnhuizen junction`, missing: `route #${j.routes_id}` });
    if (!wijnhuis) brokenLinks.push({ from: `routes_wijnhuizen junction`, missing: `wijnhuis #${j.wijnhuizen_id}` });
    if (route && wijnhuis) {
      if (!wijnhuizenPerRoute.has(route.id)) wijnhuizenPerRoute.set(route.id, []);
      wijnhuizenPerRoute.get(route.id).push(wijnhuis);
    }
  }
  // M2M: articles ↔ streken
  for (const j of articlesStreken) {
    const article = articlesById.get(j.articles_id);
    const streek = strekenById.get(j.streken_id);
    if (!article) brokenLinks.push({ from: `articles_streken junction`, missing: `article #${j.articles_id}` });
    if (!streek) brokenLinks.push({ from: `articles_streken junction`, missing: `streek #${j.streken_id}` });
    if (article && streek) {
      if (!articlesPerStreek.has(streek.id)) articlesPerStreek.set(streek.id, []);
      articlesPerStreek.get(streek.id).push(article);
      if (!strekenPerArticle.has(article.id)) strekenPerArticle.set(article.id, []);
      strekenPerArticle.get(article.id).push(streek);
    }
  }
  // M2M: articles ↔ wijnhuizen
  for (const j of articlesWijnhuizen) {
    const article = articlesById.get(j.articles_id);
    const wijnhuis = wijnhuizenById.get(j.wijnhuizen_id);
    if (!article) brokenLinks.push({ from: `articles_wijnhuizen junction`, missing: `article #${j.articles_id}` });
    if (!wijnhuis) brokenLinks.push({ from: `articles_wijnhuizen junction`, missing: `wijnhuis #${j.wijnhuizen_id}` });
    if (article && wijnhuis) {
      if (!articlesPerWijnhuis.has(wijnhuis.id)) articlesPerWijnhuis.set(wijnhuis.id, []);
      articlesPerWijnhuis.get(wijnhuis.id).push(article);
      if (!wijnhuizenPerArticle.has(article.id)) wijnhuizenPerArticle.set(article.id, []);
      wijnhuizenPerArticle.get(article.id).push(wijnhuis);
    }
  }
  // M2M: articles ↔ routes
  for (const j of articlesRoutes) {
    const article = articlesById.get(j.articles_id);
    const route = routesById.get(j.routes_id);
    if (!article) brokenLinks.push({ from: `articles_routes junction`, missing: `article #${j.articles_id}` });
    if (!route) brokenLinks.push({ from: `articles_routes junction`, missing: `route #${j.routes_id}` });
    if (article && route) {
      if (!articlesPerRoute.has(route.id)) articlesPerRoute.set(route.id, []);
      articlesPerRoute.get(route.id).push(article);
      if (!routesPerArticle.has(article.id)) routesPerArticle.set(article.id, []);
      routesPerArticle.get(article.id).push(route);
    }
  }

  // ── Detecteer orphans ───────────────────────────────────────────────
  // Orphan = item zonder relevante uitgaande OF inkomende relatie
  const orphans = {
    landen: [],       // landen zonder streken
    streken: [],      // streken zonder land_id of zonder wijnhuizen+routes+articles
    wijnhuizen: [],   // wijnhuizen zonder streek_id of zonder articles+routes incoming
    routes: [],       // routes zonder streken/wijnhuizen of zonder articles
    articles: [],     // articles zonder enige tagging
  };
  const partial = {
    streken_no_land: [],
    wijnhuizen_no_streek: [],
    routes_no_streken: [],
    routes_no_wijnhuizen: [],
    articles_no_links: [],
  };

  for (const l of landen) {
    const childCount = (strekenPerLand.get(l.id) || []).length;
    if (childCount === 0) orphans.landen.push({ ...l, reason: 'geen streken' });
  }
  for (const s of streken) {
    if (!s.land_id) partial.streken_no_land.push(s);
    const wijnCount = (wijnhuizenPerStreek.get(s.id) || []).length;
    const routeCount = (routesPerStreek.get(s.id) || []).length;
    const artCount = (articlesPerStreek.get(s.id) || []).length;
    if (wijnCount + routeCount + artCount === 0) {
      orphans.streken.push({ ...s, reason: 'geen wijnhuizen/routes/articles' });
    }
  }
  for (const w of wijnhuizen) {
    if (!w.streek_id) partial.wijnhuizen_no_streek.push(w);
    const inArticles = (articlesPerWijnhuis.get(w.id) || []).length;
    const inRoutes = Array.from(wijnhuizenPerRoute.values()).flat().filter(x => x.id === w.id).length;
    if (inArticles + inRoutes === 0) {
      orphans.wijnhuizen.push({ ...w, reason: 'niet in artikelen of routes' });
    }
  }
  for (const r of routes) {
    const strekenCount = (strekenPerRoute.get(r.id) || []).length;
    const wijnCount = (wijnhuizenPerRoute.get(r.id) || []).length;
    const artCount = (articlesPerRoute.get(r.id) || []).length;
    if (strekenCount === 0) partial.routes_no_streken.push(r);
    if (wijnCount === 0) partial.routes_no_wijnhuizen.push(r);
    if (strekenCount + wijnCount + artCount === 0) {
      orphans.routes.push({ ...r, reason: 'geen streken/wijnhuizen/articles' });
    }
  }
  for (const a of articles) {
    const sCount = (strekenPerArticle.get(a.id) || []).length;
    const wCount = (wijnhuizenPerArticle.get(a.id) || []).length;
    const rCount = (routesPerArticle.get(a.id) || []).length;
    if (sCount + wCount + rCount === 0) {
      orphans.articles.push({ ...a, reason: 'geen streek/wijnhuis/route tags' });
      partial.articles_no_links.push(a);
    }
  }

  // ── Per-item link-count voor visualisatie ─────────────────────────
  const itemDetails = {
    landen: landen.map(l => ({
      ...l,
      streken_count: (strekenPerLand.get(l.id) || []).length,
      streken: (strekenPerLand.get(l.id) || []).map(s => ({ id: s.id, slug: s.slug, name: s.name })),
    })),
    streken: streken.map(s => ({
      ...s,
      land: s.land_id ? landenById.get(s.land_id) || null : null,
      wijnhuizen_count: (wijnhuizenPerStreek.get(s.id) || []).length,
      routes_count: (routesPerStreek.get(s.id) || []).length,
      articles_count: (articlesPerStreek.get(s.id) || []).length,
    })),
    wijnhuizen: wijnhuizen.map(w => ({
      ...w,
      streek: w.streek_id ? strekenById.get(w.streek_id) || null : null,
      articles_count: (articlesPerWijnhuis.get(w.id) || []).length,
      routes_count: Array.from(wijnhuizenPerRoute.entries()).filter(([_, ws]) => ws.some(x => x.id === w.id)).length,
    })),
    routes: routes.map(r => ({
      ...r,
      streken_count: (strekenPerRoute.get(r.id) || []).length,
      wijnhuizen_count: (wijnhuizenPerRoute.get(r.id) || []).length,
      articles_count: (articlesPerRoute.get(r.id) || []).length,
    })),
    articles: articles.map(a => ({
      ...a,
      streken_count: (strekenPerArticle.get(a.id) || []).length,
      wijnhuizen_count: (wijnhuizenPerArticle.get(a.id) || []).length,
      routes_count: (routesPerArticle.get(a.id) || []).length,
    })),
  };

  // ── Tekstrapport ────────────────────────────────────────────────────
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log('SAMENVATTING');
  console.log(line);
  console.log(`  Landen:      ${landen.length}`);
  console.log(`  Streken:     ${streken.length}`);
  console.log(`  Wijnhuizen:  ${wijnhuizen.length}`);
  console.log(`  Routes:      ${routes.length}`);
  console.log(`  Articles:    ${articles.length}`);
  console.log('');
  console.log(`  Junction-rijen:`);
  console.log(`    routes_streken:      ${routesStreken.length}`);
  console.log(`    routes_wijnhuizen:   ${routesWijnhuizen.length}`);
  console.log(`    articles_streken:    ${articlesStreken.length}`);
  console.log(`    articles_wijnhuizen: ${articlesWijnhuizen.length}`);
  console.log(`    articles_routes:     ${articlesRoutes.length}`);

  console.log(`\n${line}`);
  console.log('LINK-COMPLETHEID');
  console.log(line);
  const tot = (n) => n.length;
  console.log(`  Landen met ≥1 streek:               ${tot(landen) - orphans.landen.length}/${tot(landen)} (${pct(tot(landen)-orphans.landen.length, tot(landen))}%)`);
  console.log(`  Streken met land_id:                ${tot(streken) - partial.streken_no_land.length}/${tot(streken)} (${pct(tot(streken)-partial.streken_no_land.length, tot(streken))}%)`);
  console.log(`  Wijnhuizen met streek_id:           ${tot(wijnhuizen) - partial.wijnhuizen_no_streek.length}/${tot(wijnhuizen)} (${pct(tot(wijnhuizen)-partial.wijnhuizen_no_streek.length, tot(wijnhuizen))}%)`);
  console.log(`  Routes met ≥1 streek:               ${tot(routes) - partial.routes_no_streken.length}/${tot(routes)} (${pct(tot(routes)-partial.routes_no_streken.length, tot(routes))}%)`);
  console.log(`  Routes met ≥1 wijnhuis:             ${tot(routes) - partial.routes_no_wijnhuizen.length}/${tot(routes)} (${pct(tot(routes)-partial.routes_no_wijnhuizen.length, tot(routes))}%)`);
  console.log(`  Articles met ≥1 streek/wijn/route:  ${tot(articles) - partial.articles_no_links.length}/${tot(articles)} (${pct(tot(articles)-partial.articles_no_links.length, tot(articles))}%)`);

  console.log(`\n${line}`);
  console.log('ORPHANS (items zonder enige relatie)');
  console.log(line);
  for (const [cat, items] of Object.entries(orphans)) {
    if (items.length === 0) {
      console.log(`  ${cat.padEnd(12)} —  geen orphans ✓`);
    } else {
      console.log(`  ${cat.padEnd(12)} —  ${items.length}:`);
      for (const i of items) {
        console.log(`    • ${i.slug || '(geen slug)'} — ${i.name || i.title || '(geen titel)'}`);
      }
    }
  }

  console.log(`\n${line}`);
  console.log('GEBROKEN FK-VERWIJZINGEN');
  console.log(line);
  if (brokenLinks.length === 0) {
    console.log('  Geen gebroken referenties ✓');
  } else {
    console.log(`  ${brokenLinks.length} gevonden:`);
    for (const b of brokenLinks.slice(0, 30)) {
      console.log(`    • ${b.from} → ${b.missing}`);
    }
    if (brokenLinks.length > 30) console.log(`    ... + ${brokenLinks.length - 30} meer (zie JSON)`);
  }

  // ── JSON-dump voor visualisatie ─────────────────────────────────────
  const { writeFileSync } = await import('node:fs');
  const payload = {
    generated_at: new Date().toISOString(),
    directus_url: DIRECTUS_URL,
    summary: {
      landen: tot(landen),
      streken: tot(streken),
      wijnhuizen: tot(wijnhuizen),
      routes: tot(routes),
      articles: tot(articles),
      junctions: {
        routes_streken: routesStreken.length,
        routes_wijnhuizen: routesWijnhuizen.length,
        articles_streken: articlesStreken.length,
        articles_wijnhuizen: articlesWijnhuizen.length,
        articles_routes: articlesRoutes.length,
      },
    },
    completeness: {
      landen_with_streken: { ok: tot(landen) - orphans.landen.length, total: tot(landen) },
      streken_with_land: { ok: tot(streken) - partial.streken_no_land.length, total: tot(streken) },
      wijnhuizen_with_streek: { ok: tot(wijnhuizen) - partial.wijnhuizen_no_streek.length, total: tot(wijnhuizen) },
      routes_with_streek: { ok: tot(routes) - partial.routes_no_streken.length, total: tot(routes) },
      routes_with_wijnhuis: { ok: tot(routes) - partial.routes_no_wijnhuizen.length, total: tot(routes) },
      articles_with_any_link: { ok: tot(articles) - partial.articles_no_links.length, total: tot(articles) },
    },
    orphans,
    partial,
    broken_links: brokenLinks,
    items: itemDetails,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`\nJSON-dump weggeschreven: ${OUTPUT_PATH}\n`);
}

run().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
