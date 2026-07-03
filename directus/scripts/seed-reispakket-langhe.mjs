#!/usr/bin/env node
/**
 * Seed het eerste `reispakketten`-item: "Vier dagen Langhe" (LAT-2023).
 *
 * Copy = Marijn-akkoord 2026-07-03 (LAT-1989 comment b49cb74b): em-dashes in
 * dagkoppen vervangen door dubbele punt, Sophie 1 cameo. Draai NA
 * create-reispakketten-schema.mjs.
 *
 * Idempotent: bestaat de slug al, dan wordt het item ge-PATCHt i.p.v. gedupliceerd.
 * De M2M-links (wijnhuizen, accommodaties) worden telkens opnieuw gezet.
 *
 * Entiteiten worden robuust opgezocht (streek + wijnhuizen op naam/slug) i.p.v.
 * op harde id's, zodat een afwijkende id-toewijzing in Directus dit niet breekt.
 * Accommodaties gebruiken de door LAT-2023 opgegeven id's 11 (Locanda del Pilone)
 * en 12 (Palazzo Finati); pas ACC_IDS aan als die in Directus anders zijn.
 *
 * Usage (VPS, admin- of content-token met write op reispakketten):
 *   set -a && source /root/vinomartino-site/.env && set +a
 *   DIRECTUS_TOKEN=<token> node directus/scripts/seed-reispakket-langhe.mjs
 *
 * Publiceren pas na build-verificatie: standaard status=draft. Zet
 * PUBLISH=1 om direct status=published te seeden.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://directus:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const PUBLISH = process.env.PUBLISH === '1';
const ACC_IDS = [11, 12]; // Locanda del Pilone, Palazzo Finati (LAT-2023 / LAT-1964)

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const AUTH = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers: AUTH,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const SLUG = 'langhe-piemonte';

const INTRODUCTIE = `Nebbiolo is geen vergevingsgezinde druif. Op slechte bodem geeft hij dunne, lelijke tannines; op de verkeerde hoogte rijpt hij niet; in een slechte oogst valt hij uiteen. De Langhe-heuvels zijn de smalle zone waar hij dat allemaal overbrugt en iets maakt dat nergens anders bestaat: Barolo op Tortonian-mergel in Serralunga, gespierd en gesloten voor jaren; Barbaresco op kalkrijkere Helvetian-klei in Neive, korter maar aromatischer. Dezelfde druif, dezelfde appellation-regels, twee wezenlijk verschillende wijnen.

In juli 2021 reed ik vier dagen door dit gebied in een gehuurde Fiat Panda. Sophie had een koeltas gekocht bij een Action in Cuneo en zei dat ik te veel wijnhuizen op één dag had ingepland. Dit is de gecorrigeerde versie: vier dagen, twee bases, vijf wijnhuizen en twee restaurants die de moeite waard zijn.`;

const DAG_TOT_DAG = `**Dag 1: Aankomst via Turijn, Alba als basis**

Turijn-Caselle ligt 60 kilometer van Alba. Rijd via de A33 richting Asti en dan de SP31 richting Alba. Incheck bij Palazzo Finati in het centrum. Loop 's middags door de Via Maestra naar de markthal: de truffeljagers zitten in november, maar de kaasverkopers zijn ook in juli de moeite waard. Rijd 's avonds naar Barolo-dorp (20 minuten). VINOLAND zit aan de Piazza San Martino. De wijnlijst is breed, de keuken eenvoudig. De Barbera d'Alba bij het eerste glas werkt beter dan de meeste Barolo na een vliegdag: de friszure structuur van Barbera vraagt minder aandacht dan Nebbiolo.

**Dag 2: Barbaresco-zone, La Spinetta en Produttori del Barbaresco**

Vertrek halfnegen vanuit Alba richting Barbaresco. La Spinetta ontvangt op afspraak bij Neive. De Starderi single-vineyard-Barbaresco DOCG is hun referentie voor de Neive-appellation: de kersachtige, droge tanninestructuur die Nebbiolo op rijpere grond maakt. Proef ook de Gallina als die beschikbaar is; de bodemverschillen tussen de twee percelen zijn in het glas groter dan op de kaart. Middag bij Produttori del Barbaresco: de coöperatie van de appellation, 56 ledenwijnmakers. Hun Rabajà Riserva toont wat Nebbiolo met tien jaar keldering doet. Geen show-ruimte, geen commerciële tour. Proeverij op afspraak.

**Dag 3: Treiso en Neive, Bruna Grimaldi, Montaribaldi en Cantina del Glicine**

Bruna Grimaldi in Barolo werkt over twee appellations. Haar Barbaresco heeft een toegankelijker profiel dan de zwaardere Serralunga-Barolo's: goed startpunt als je appellation-verschil nog aan het scherpstellen bent. Daarna Montaribaldi in Treiso: familiebedrijf, twee generaties, productie zonder franje. De Barbaresco Sorì Montaribaldi is hun vlaggenschip. Afsluiting in Neive bij Cantina del Glicine: klein huis, werkt op afspraak. 's Avonds: Ciabot San Giorgio in Monteu Roero, aan de andere kant van de Tanaro-rivier. Roero is technisch geen Barolo-zone, maar de Arneis die ze hier maken staat ver van de generieke flauw-frisheid die de druif elders heeft.

**Dag 4: La Morra, Mauro Molino en vertrek**

Check out bij Palazzo Finati (of al verplaatst naar Locanda del Pilone voor dag 3 en 4). Mauro Molino werkt vanuit Annunziata, de subzone van La Morra met Helvetian-bodem: rijpere, rondere tannines dan Serralunga. De Vigna Conca-cru is hun meest herkenbare fles. Proeverij 's ochtends, vertrek via de A6 richting Turijn-Caselle.`;

const REISMOMENT = `Mei. De Nebbiolo staat in bloei in de tweede week van mei en de wijnhuizen zijn minder vol dan in oktober. Temperaturen op de heuvels zijn aangenaam voor rijden en proeven. Oktober is alternatief maar druk: de oogst loopt, de kelders ruiken naar gistend sap en een deel van de wijnhuizen ontvangt minder omdat het seizoen het niet toelaat. Augustus is te warm en veel kleinere wijnhuizen zijn dicht. Vermijd de Truffe Blanche-week in november als het je eerste bezoek is: de tarieven verdubbelen en de wijnhuizen zijn vol met inkopers.`;

// Wijnhuizen om te linken (naam-match, case-insensitive, tolerant op accenten).
const WIJNHUIS_NAMEN = [
  'La Spinetta',
  'Produttori del Barbaresco',
  'Bruna Grimaldi',
  'Montaribaldi',
  'Mauro Molino',
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

async function resolveStreekId() {
  const rows = (await api('GET', '/items/streken?limit=-1&fields=id,slug,name')).data || [];
  const match = rows.find((r) => {
    const s = norm(r.slug);
    const n = norm(r.name);
    return s.includes('langhe') || n.includes('langhe') || s === 'piemonte-italie' || n.includes('piemonte');
  });
  if (!match) throw new Error('Geen Langhe/Piemonte-streek gevonden in Directus.');
  console.log(`  streek_id=${match.id} (${match.slug} / ${match.name})`);
  return match.id;
}

async function resolveWijnhuisIds() {
  const rows = (await api('GET', '/items/wijnhuizen?limit=-1&fields=id,slug,name')).data || [];
  const ids = [];
  for (const wanted of WIJNHUIS_NAMEN) {
    const w = norm(wanted);
    const match = rows.find((r) => norm(r.name) === w || norm(r.name).includes(w) || norm(r.slug).includes(w.replace(/ /g, '-')));
    if (match) { ids.push(match.id); console.log(`  wijnhuis "${wanted}" → id=${match.id}`); }
    else console.warn(`  ⚠ wijnhuis "${wanted}" niet gevonden — overgeslagen`);
  }
  return ids;
}

async function findExisting() {
  const rows = (await api('GET', `/items/reispakketten?filter[slug][_eq]=${SLUG}&fields=id,slug`)).data || [];
  return rows[0] || null;
}

async function run() {
  console.log(`\nSeed reispakket "${SLUG}" → ${DIRECTUS_URL}\n`);
  const streekId = await resolveStreekId();
  const wijnhuisIds = await resolveWijnhuisIds();

  const payload = {
    slug: SLUG,
    titel: 'Vier dagen Langhe',
    tagline: 'Vier dagen, twee bases, vijf wijnhuizen: een geteste Nebbiolo-route door de Langhe.',
    status: PUBLISH ? 'published' : 'draft',
    pub_date: new Date().toISOString().slice(0, 10),
    streek_id: streekId,
    introductie: INTRODUCTIE,
    dag_tot_dag: DAG_TOT_DAG,
    reismoment: REISMOMENT,
    cta_heading: 'Plan deze route na',
    cta_tekst: 'Vier dagen Langhe: vijf wijnhuizen op afspraak, twee geteste hotels, één routebeschrijving. Alles hieronder in één overzicht.',
    meta_title: 'Vier dagen Langhe · Reizen nareizen',
    meta_description: 'Een geteste vierdaagse Nebbiolo-route door de Langhe: vijf wijnhuizen op afspraak, twee geteste hotels en het beste reismoment.',
    wijnhuizen: wijnhuisIds.map((id, i) => ({ wijnhuizen_id: id, sort_order: i })),
    accommodaties: ACC_IDS.map((id, i) => ({ accommodations_id: id, sort_order: i })),
  };

  const existing = await findExisting();
  if (existing) {
    console.log(`  bestaand item id=${existing.id} → PATCH`);
    await api('PATCH', `/items/reispakketten/${existing.id}`, payload);
  } else {
    console.log('  nieuw item → POST');
    await api('POST', '/items/reispakketten', payload);
  }

  console.log(`\n✅ Seed klaar (status=${payload.status}). Verifieer de build en zet daarna PUBLISH=1 indien nog draft.\n`);
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
