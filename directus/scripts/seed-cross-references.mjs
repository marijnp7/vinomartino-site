#!/usr/bin/env node
/**
 * Seed cross-references voor VinoMartino-content.
 *
 * Maakt + linkt al wat ontbreekt zodat de site doorlinkt:
 *  1. 6 landen (Italië, Portugal, Duitsland, Spanje, Frankrijk, Oostenrijk)
 *  2. 7 nieuwe streken (Toscane, Etna, Priorat, Champagne, Pfalz, Wachau, Burgenland)
 *  3. land_id op de 3 bestaande streken (Langhe, Douro, Mosel)
 *  4. streek_id op de 3 bestaande wijnhuizen
 *  5. M2M junctions voor 11 artikelen + 3 routes
 *
 * Idempotent: identificeert items op slug, skipt wat al bestaat / al gelinkt is.
 *
 * Nieuwe streken worden op `status=draft` gezet — editor reviewt vóór live.
 * Nieuwe landen op `status=published` zodat de hiërarchie direct werkt.
 *
 * Vereist:
 *   DIRECTUS_URL
 *   DIRECTUS_TOKEN  — token met write op alle wijn-collections
 *
 * Modes:
 *   DRY_RUN=1  → toon alleen plan, geen writes (default veilig)
 *   APPLY=1    → daadwerkelijk uitvoeren
 *
 * Run: node directus/scripts/seed-cross-references.mjs
 */

const DIRECTUS_URL = (process.env.DIRECTUS_URL || '').replace(/\/$/, '');
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true';

if (!DIRECTUS_URL || !DIRECTUS_TOKEN) {
  console.error('FOUT: DIRECTUS_URL en DIRECTUS_TOKEN zijn vereist.');
  process.exit(1);
}
if (!DRY_RUN && !APPLY) {
  console.error('FOUT: zet DRY_RUN=1 (plan) of APPLY=1 (echt doen).');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'vinomartino-seed/1.0',
};

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function fetchAll(collection, fields = '*') {
  const r = await api('GET', `/items/${collection}?limit=-1&fields=${fields}`);
  return r?.data || [];
}

// ── Definities ──────────────────────────────────────────────────────────

const LANDEN_TO_CREATE = [
  { slug: 'italie',     name: 'Italië',     continent: 'Europa', capital: 'Rome',       status: 'published', description: 'De wijnen van Italië — van Piemonte tot Sicilië.' },
  { slug: 'portugal',   name: 'Portugal',   continent: 'Europa', capital: 'Lissabon',   status: 'published', description: 'Portugese wijnen — de Douro voorbij Port.' },
  { slug: 'duitsland',  name: 'Duitsland',  continent: 'Europa', capital: 'Berlijn',    status: 'published', description: 'Duitse Riesling, Spätburgunder en de Pfalz-renaissance.' },
  { slug: 'spanje',     name: 'Spanje',     continent: 'Europa', capital: 'Madrid',     status: 'published', description: 'Spaanse wijnen — Priorat, Rioja en daarbuiten.' },
  { slug: 'frankrijk',  name: 'Frankrijk',  continent: 'Europa', capital: 'Parijs',     status: 'published', description: 'Frankrijk — bakermat van de moderne wijncultuur.' },
  { slug: 'oostenrijk', name: 'Oostenrijk', continent: 'Europa', capital: 'Wenen',      status: 'published', description: 'Oostenrijkse Grüner Veltliner en Blaufränkisch.' },
];

const NEW_STREKEN = [
  { slug: 'toscane-italie',     name: 'Toscane',     land_slug: 'italie',     status: 'draft', description: 'Sangiovese-thuisland — Chianti Classico, Brunello, Bolgheri.' },
  { slug: 'etna-sicilie',       name: 'Etna',        land_slug: 'italie',     status: 'draft', description: 'Vulkanische wijnstreek op Sicilië — Nerello Mascalese en Carricante.' },
  { slug: 'priorat-catalonie',  name: 'Priorat',     land_slug: 'spanje',     status: 'draft', description: 'Leisteen (llicorella) en oude Garnacha — Spanjes meest dramatische wijnstreek.' },
  { slug: 'champagne',          name: 'Champagne',   land_slug: 'frankrijk',  status: 'draft', description: 'Frankrijks koudste wijnregio — grower champagne als alternatief voor de grandes marques.' },
  { slug: 'pfalz',              name: 'Pfalz',       land_slug: 'duitsland',  status: 'draft', description: 'Duitslands warmste wijnregio — Riesling, Spätburgunder en nieuwe energie.' },
  { slug: 'wachau',             name: 'Wachau',      land_slug: 'oostenrijk', status: 'draft', description: 'Donau-vallei — terrassen vol Grüner Veltliner en Riesling.' },
  { slug: 'burgenland',         name: 'Burgenland',  land_slug: 'oostenrijk', status: 'draft', description: 'Blaufränkisch-land aan de Neusiedlersee.' },
];

// Bestaande streek → land mapping
const STREKEN_LAND_PATCH = {
  'langhe-piemonte': 'italie',
  'douro-portugal':  'portugal',
  'mosel-duitsland': 'duitsland',
};

// Bestaande wijnhuizen → streek mapping
const WIJNHUIZEN_STREEK_PATCH = {
  'bartolo-mascarello-barolo': 'langhe-piemonte',
  'cornelissen-etna-sicilie':  'etna-sicilie',
  'niepoort-douro-portugal':   'douro-portugal',
};

// Routes → M2M junctions
const ROUTE_LINKS = {
  'etna-noord-randazzo-solicchiata':  { streken: ['etna-sicilie'],  wijnhuizen: ['cornelissen-etna-sicilie'] },
  'mosel-bernkastel-traben-trarbach': { streken: ['mosel-duitsland'], wijnhuizen: [] },
  'priorat-porrera-gratallops':       { streken: ['priorat-catalonie'], wijnhuizen: [] },
};

// Artikelen → M2M junctions (slug-gebaseerd)
const ARTICLE_LINKS = {
  'wijnreizen-piemonte-complete-gids':                                         { streken: ['langhe-piemonte'],    wijnhuizen: ['bartolo-mascarello-barolo'], routes: [] },
  'brunello-di-montalcino-wat-vijf-jaar-wachten-je-leert-over-een-wijn':       { streken: ['toscane-italie'],     wijnhuizen: [], routes: [] },
  'etna-wijnen-van-de-vulkaan-die-europa-opnieuw-leert-zien':                  { streken: ['etna-sicilie'],       wijnhuizen: ['cornelissen-etna-sicilie'], routes: ['etna-noord-randazzo-solicchiata'] },
  'priorat-leisteen-oudhout-en-wijnen-die-niet-om-goedkeuring-vragen':         { streken: ['priorat-catalonie'],  wijnhuizen: [], routes: ['priorat-porrera-gratallops'] },
  'wijnreizen-toscane-voorbij-de-toeristische-chianti-route':                  { streken: ['toscane-italie'],     wijnhuizen: [], routes: [] },
  'een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin':              { streken: ['langhe-piemonte'],    wijnhuizen: ['bartolo-mascarello-barolo'], routes: [] },
  'grower-champagne-waarom-martin-gestopt-is-met-grandes-marques':             { streken: ['champagne'],          wijnhuizen: [], routes: [] },
  'de-pfalz-in-het-voorjaar-riesling-renaissance-en-waarom-duitsland-wijn-anders-do': { streken: ['pfalz'],         wijnhuizen: [], routes: [] },
  'oostenrijk-gruner-veltliner-in-de-wachau-en-blaufrankisch-in-het-burgenland': { streken: ['wachau', 'burgenland'], wijnhuizen: [], routes: [] },
  'de-douro-vallei-meer-dan-port':                                             { streken: ['douro-portugal'],     wijnhuizen: ['niepoort-douro-portugal'], routes: [] },
  // seizoenskalender: cross-cut artikel — tag aan alle 10 streken zodat het overal opduikt
  'de-seizoenskalender-wanneer-is-welke-wijnregio-op-zijn-best': {
    streken: ['langhe-piemonte','douro-portugal','mosel-duitsland','toscane-italie','etna-sicilie','priorat-catalonie','champagne','pfalz','wachau','burgenland'],
    wijnhuizen: [], routes: [],
  },
};

// ── Counters ─────────────────────────────────────────────────────────────
const stats = {
  landen_created: 0, landen_skipped: 0,
  streken_created: 0, streken_skipped: 0,
  streken_patched: 0,
  wijnhuizen_patched: 0,
  junctions_created: 0, junctions_skipped: 0,
  errors: [],
};

function logAction(verb, what) {
  const prefix = DRY_RUN ? '  [DRY] ' : '  [DO]  ';
  console.log(`${prefix}${verb} ${what}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function ensureCollection(collection, items, slugMapToLand) {
  console.log(`\n── ${collection.toUpperCase()}: ensure ${items.length} items ──`);
  // Velden minimaal houden — collection-specifieke kolommen kunnen ontbreken
  const existing = await fetchAll(collection, 'id,slug,name,status');
  const bySlug = new Map(existing.map(x => [x.slug, x]));
  const created = new Map(); // slug → id
  for (const x of existing) created.set(x.slug, x.id);

  for (const item of items) {
    if (bySlug.has(item.slug)) {
      logAction('SKIP', `${collection}.${item.slug} (al aanwezig, id=${bySlug.get(item.slug).id})`);
      stats[`${collection}_skipped`]++;
      continue;
    }
    // Resolve land_id voor streken
    const payload = { ...item };
    if (slugMapToLand && item.land_slug) {
      const land = bySlug.has(item.land_slug) ? bySlug.get(item.land_slug) : null;
      // land_id pakken we uit slugMapToLand bij de caller
      payload.land_id = slugMapToLand.get(item.land_slug) || null;
      delete payload.land_slug;
    }
    if (DRY_RUN) {
      logAction('CREATE', `${collection}.${item.slug} (${item.name}, status=${item.status})`);
      // pseudo-id voor dependency-resolution in dry-run
      created.set(item.slug, `dry-${item.slug}`);
    } else {
      try {
        const res = await api('POST', `/items/${collection}`, payload);
        created.set(item.slug, res.data.id);
        logAction('CREATED', `${collection}.${item.slug} → id=${res.data.id}`);
      } catch (err) {
        stats.errors.push(`${collection}.${item.slug}: ${err.message}`);
        console.error(`    ERROR: ${err.message}`);
        continue;
      }
    }
    stats[`${collection}_created`]++;
  }
  return created;
}

async function patchFK(collection, slugToFkMap, fkField, targetMap) {
  console.log(`\n── ${collection.toUpperCase()}: PATCH ${fkField} ──`);
  const existing = await fetchAll(collection, `id,slug,${fkField}`);
  const bySlug = new Map(existing.map(x => [x.slug, x]));
  for (const [slug, targetSlug] of Object.entries(slugToFkMap)) {
    const item = bySlug.get(slug);
    if (!item) {
      console.log(`  WARN: ${collection}.${slug} bestaat niet — overgeslagen`);
      continue;
    }
    const targetId = targetMap.get(targetSlug);
    if (!targetId) {
      console.log(`  WARN: target ${targetSlug} niet gevonden voor ${slug}`);
      continue;
    }
    if (item[fkField] === targetId) {
      logAction('SKIP', `${collection}.${slug}.${fkField} al = ${targetId}`);
      continue;
    }
    if (typeof targetId === 'string' && targetId.startsWith('dry-')) {
      logAction('PATCH', `${collection}.${slug}.${fkField} = (dry-id voor ${targetSlug})`);
      stats[`${collection}_patched`]++;
      continue;
    }
    if (DRY_RUN) {
      logAction('PATCH', `${collection}.${slug}.${fkField} = ${targetId} (${targetSlug})`);
    } else {
      try {
        await api('PATCH', `/items/${collection}/${item.id}`, { [fkField]: targetId });
        logAction('PATCHED', `${collection}.${slug}.${fkField} = ${targetId}`);
      } catch (err) {
        stats.errors.push(`PATCH ${collection}.${slug}: ${err.message}`);
        console.error(`    ERROR: ${err.message}`);
        continue;
      }
    }
    stats[`${collection}_patched`]++;
  }
}

async function ensureJunction(junctionCollection, leftField, rightField, leftId, rightId, label) {
  // Skip dry-pseudo-ids in dry-run, alleen loggen
  if (typeof leftId === 'string' || typeof rightId === 'string') {
    logAction('JUNCTION', `${junctionCollection}: ${label} (dry-id, kan niet checken)`);
    stats.junctions_created++;
    return;
  }
  const filterUrl = `/items/${junctionCollection}?filter[${leftField}][_eq]=${leftId}&filter[${rightField}][_eq]=${rightId}&limit=1`;
  const existing = await api('GET', filterUrl);
  if ((existing.data || []).length > 0) {
    logAction('SKIP', `${junctionCollection}: ${label} (al gelinkt)`);
    stats.junctions_skipped++;
    return;
  }
  if (DRY_RUN) {
    logAction('JUNCTION', `${junctionCollection}: ${label}`);
  } else {
    try {
      await api('POST', `/items/${junctionCollection}`, { [leftField]: leftId, [rightField]: rightId });
      logAction('JUNCTION', `${junctionCollection}: ${label}`);
    } catch (err) {
      stats.errors.push(`junction ${junctionCollection} ${label}: ${err.message}`);
      console.error(`    ERROR: ${err.message}`);
      return;
    }
  }
  stats.junctions_created++;
}

// ── Run ──────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  VinoMartino — seed cross-references');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (geen writes)' : 'APPLY (echt uitvoeren)'}`);
  console.log(`  Directus: ${DIRECTUS_URL}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // Stap 1: landen
  const landenMap = await ensureCollection('landen', LANDEN_TO_CREATE);

  // Stap 2: nieuwe streken (met land_id)
  // Resolve land slug → id voor in payload
  for (const s of NEW_STREKEN) {
    s._land_id = landenMap.get(s.land_slug);
  }
  // Custom ensureCollection-call met land_id payload
  console.log(`\n── STREKEN: ensure ${NEW_STREKEN.length} new items ──`);
  const allStreken = await fetchAll('streken', 'id,slug,name,land_id');
  const strekenMap = new Map(allStreken.map(x => [x.slug, x.id]));
  for (const s of NEW_STREKEN) {
    if (strekenMap.has(s.slug)) {
      logAction('SKIP', `streken.${s.slug} (al aanwezig)`);
      stats.streken_skipped++;
      continue;
    }
    const payload = { slug: s.slug, name: s.name, status: s.status, description: s.description, land_id: s._land_id || null };
    if (DRY_RUN) {
      logAction('CREATE', `streken.${s.slug} (${s.name}, land=${s.land_slug}, status=${s.status})`);
      strekenMap.set(s.slug, `dry-${s.slug}`);
    } else {
      try {
        const res = await api('POST', `/items/streken`, payload);
        strekenMap.set(s.slug, res.data.id);
        logAction('CREATED', `streken.${s.slug} → id=${res.data.id}`);
      } catch (err) {
        stats.errors.push(`streken.${s.slug}: ${err.message}`);
        console.error(`    ERROR: ${err.message}`);
        continue;
      }
    }
    stats.streken_created++;
  }

  // Stap 3: PATCH land_id op bestaande streken
  await patchFK('streken', STREKEN_LAND_PATCH, 'land_id', landenMap);

  // Stap 4: PATCH streek_id op bestaande wijnhuizen
  // Refresh strekenMap to include any newly created ones
  const allStrekenAfter = await fetchAll('streken', 'id,slug');
  for (const s of allStrekenAfter) strekenMap.set(s.slug, s.id);
  await patchFK('wijnhuizen', WIJNHUIZEN_STREEK_PATCH, 'streek_id', strekenMap);

  // Stap 5: M2M junctions voor routes
  console.log(`\n── ROUTES: M2M junctions ──`);
  const allRoutes = await fetchAll('routes', 'id,slug');
  const routesMap = new Map(allRoutes.map(x => [x.slug, x.id]));
  const allWijnhuizen = await fetchAll('wijnhuizen', 'id,slug');
  const wijnhuizenMap = new Map(allWijnhuizen.map(x => [x.slug, x.id]));

  for (const [routeSlug, links] of Object.entries(ROUTE_LINKS)) {
    const routeId = routesMap.get(routeSlug);
    if (!routeId) { console.log(`  WARN: route ${routeSlug} niet gevonden`); continue; }
    for (const streekSlug of links.streken) {
      const streekId = strekenMap.get(streekSlug);
      if (!streekId) { console.log(`  WARN: streek ${streekSlug} niet gevonden`); continue; }
      await ensureJunction('routes_streken', 'routes_id', 'streken_id', routeId, streekId, `${routeSlug} ↔ ${streekSlug}`);
    }
    for (const wSlug of links.wijnhuizen) {
      const wId = wijnhuizenMap.get(wSlug);
      if (!wId) { console.log(`  WARN: wijnhuis ${wSlug} niet gevonden`); continue; }
      await ensureJunction('routes_wijnhuizen', 'routes_id', 'wijnhuizen_id', routeId, wId, `${routeSlug} ↔ ${wSlug}`);
    }
  }

  // Stap 6: M2M junctions voor artikelen
  console.log(`\n── ARTICLES: M2M junctions ──`);
  const allArticles = await fetchAll('articles', 'id,slug');
  const articlesMap = new Map(allArticles.map(x => [x.slug, x.id]));

  for (const [articleSlug, links] of Object.entries(ARTICLE_LINKS)) {
    const articleId = articlesMap.get(articleSlug);
    if (!articleId) { console.log(`  WARN: article ${articleSlug} niet gevonden`); continue; }
    for (const streekSlug of links.streken) {
      const streekId = strekenMap.get(streekSlug);
      if (!streekId) { console.log(`  WARN: streek ${streekSlug} niet gevonden voor article ${articleSlug}`); continue; }
      await ensureJunction('articles_streken', 'articles_id', 'streken_id', articleId, streekId, `${articleSlug} ↔ ${streekSlug}`);
    }
    for (const wSlug of links.wijnhuizen) {
      const wId = wijnhuizenMap.get(wSlug);
      if (!wId) { console.log(`  WARN: wijnhuis ${wSlug} niet gevonden voor article ${articleSlug}`); continue; }
      await ensureJunction('articles_wijnhuizen', 'articles_id', 'wijnhuizen_id', articleId, wId, `${articleSlug} ↔ ${wSlug}`);
    }
    for (const rSlug of links.routes) {
      const rId = routesMap.get(rSlug);
      if (!rId) { console.log(`  WARN: route ${rSlug} niet gevonden voor article ${articleSlug}`); continue; }
      await ensureJunction('articles_routes', 'articles_id', 'routes_id', articleId, rId, `${articleSlug} ↔ ${rSlug}`);
    }
  }

  // ── Samenvatting ─────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`  SAMENVATTING (${DRY_RUN ? 'DRY RUN' : 'APPLY'})`);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`  Landen     created: ${stats.landen_created}    skipped: ${stats.landen_skipped}`);
  console.log(`  Streken    created: ${stats.streken_created}   skipped: ${stats.streken_skipped}   patched: ${stats.streken_patched}`);
  console.log(`  Wijnhuizen patched: ${stats.wijnhuizen_patched}`);
  console.log(`  Junctions  created: ${stats.junctions_created}   skipped: ${stats.junctions_skipped}`);
  if (stats.errors.length > 0) {
    console.log(`\n  ERRORS (${stats.errors.length}):`);
    for (const e of stats.errors) console.log(`    - ${e}`);
    process.exit(2);
  }
  console.log('');
}

run().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
