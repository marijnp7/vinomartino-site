#!/usr/bin/env node
/**
 * LAT-1124: Seed redactionele content per zone voor Italië-infographic.
 *
 * Voert in:
 *   1. Italië (landen id=1) — facts-box velden: infographic_kicker, facts_override,
 *      main_grapes, best_time_to_visit
 *   2. Bestaande streken (Langhe/1, Toscane/4, Etna/5) — wine_style, dominant_grape,
 *      main_grapes, sort_order
 *   3. 7 nieuwe streken — Veneto, Friuli, Trentino, Emilia-Romagna, Campania, Puglia, Sardegna
 *   4. Appellaties per zone (DOCG/DOC)
 *
 * Idempotent: streken worden geselecteerd op slug; appellaties op name+land_id.
 * Slugs voor nieuwe streken staan op DRAFT — bevestig met CTO vóór publish.
 *
 * Run (via docker exec op VPS):
 *   DIRECTUS_URL=http://localhost:8055 \
 *   DIRECTUS_TOKEN=<admin-token> \
 *   node directus/scripts/seed-italie-infographic-content.mjs
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL || 'http://localhost:8055';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN is required.');
  process.exit(1);
}

const headers = {
  'Authorization': `Bearer ${DIRECTUS_TOKEN}`,
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

// ─── 1. Italië facts-box ─────────────────────────────────────────────────────

async function updateItalieLand() {
  log('\n=== Stap 1: Italië (landen id=1) facts-box ===');
  const res = await api('PATCH', '/items/landen/1', {
    main_grapes: ["Sangiovese", "Nebbiolo", "Barbera", "Montepulciano", "Primitivo", "Corvina", "Vermentino", "Nero d'Avola"],
    best_time_to_visit: 'april–juni en september–oktober (vendemmia/oogst)',
    infographic_kicker: '418 erkende appellaties — meer dan welk wijnland ook ter wereld.',
    facts_override: {
      aantal_wijnzones: "~14 relevante wijnbouwzones (20 administratieve regio's)",
      aantal_docg: 77,
      aantal_doc: 341,
      totaal_appellaties: 418,
      beste_reisseizoen: 'april–juni en september–oktober',
    },
  });
  if (res.ok) {
    log(`  ✓ landen/1 bijgewerkt (infographic_kicker, facts_override, main_grapes, best_time_to_visit)`);
  } else {
    log(`  ✗ FAIL (${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`);
    process.exit(1);
  }
}

// ─── 2. Streek-content definities ────────────────────────────────────────────

// Bestaande streken (id bekend)
const EXISTING_STREKEN_UPDATES = [
  {
    id: 1,
    slug: 'langhe-piemonte',
    label: 'Piemonte/Langhe',
    sort_order: 1,
    dominant_grape: 'Nebbiolo',
    main_grapes: ["Nebbiolo", "Barbera", "Dolcetto", "Moscato Bianco", "Cortese", "Arneis"],
    wine_style: 'Tanninrijk, lang rijpend',
  },
  {
    id: 4,
    slug: 'toscane-italie',
    label: 'Toscane',
    sort_order: 2,
    dominant_grape: 'Sangiovese',
    main_grapes: ["Sangiovese", "Cabernet Sauvignon", "Merlot", "Vernaccia di San Gimignano"],
    wine_style: 'Gestructureerd, bewaarwijn',
  },
  {
    id: 5,
    slug: 'etna-sicilie',
    label: 'Sicilië/Etna',
    sort_order: 7,
    dominant_grape: 'Nerello Mascalese',
    main_grapes: ["Nerello Mascalese", "Carricante", "Nero d'Avola", "Frappato", "Catarratto", "Grillo", "Inzolia"],
    wine_style: 'Vulkanisch, mineraal',
  },
];

// Nieuwe streken aanmaken (slug op DRAFT — afstemmen met CTO vóór publish)
const NEW_STREKEN = [
  {
    name: 'Veneto',
    slug: 'veneto-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 3,
    dominant_grape: 'Corvina Veronese',
    main_grapes: ["Corvina Veronese", "Corvinone", "Rondinella", "Garganega", "Glera"],
    wine_style: 'Appassimento, moussend',
  },
  {
    name: 'Friuli-Venezia Giulia',
    slug: 'friuli-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 4,
    dominant_grape: 'Friulano',
    main_grapes: ["Friulano", "Ribolla Gialla", "Pinot Grigio", "Refosco dal Peduncolo Rosso"],
    wine_style: 'Droog wit, oranjewijnen',
  },
  {
    name: 'Trentino-Alto Adige',
    slug: 'trentino-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 5,
    dominant_grape: 'Gewürztraminer',
    main_grapes: ["Gewürztraminer", "Pinot Bianco", "Pinot Grigio", "Lagrein", "Teroldego Rotaliano", "Schiava"],
    wine_style: 'Aromatisch, bergklimaat',
  },
  {
    name: 'Emilia-Romagna',
    slug: 'emilia-romagna-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 6,
    dominant_grape: 'Lambrusco',
    main_grapes: ["Lambrusco", "Sangiovese di Romagna", "Albana"],
    wine_style: 'Moussend, pairing',
  },
  {
    name: 'Campania',
    slug: 'campania-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 8,
    dominant_grape: 'Aglianico',
    main_grapes: ["Aglianico", "Greco di Tufo", "Fiano di Avellino", "Falanghina"],
    wine_style: 'Tanninrijk, zuidelijk',
  },
  {
    name: 'Puglia',
    slug: 'puglia-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 9,
    dominant_grape: 'Primitivo',
    main_grapes: ["Primitivo", "Negroamaro", "Nero di Troia", "Malvasia Nera"],
    wine_style: 'Rijp, krachtig',
  },
  {
    name: 'Sardegna',
    slug: 'sardegna-italie',
    status: 'draft',
    land_id: 1,
    sort_order: 10,
    dominant_grape: 'Vermentino',
    main_grapes: ["Vermentino", "Cannonau", "Carignano", "Nuragus"],
    wine_style: 'Aromatisch, mediterraan',
  },
];

// ─── 3. Streek-insert/update helpers ─────────────────────────────────────────

async function updateStreek(id, label, updates) {
  process.stdout.write(`  PATCH streken/${id} (${label}) ... `);
  const res = await api('PATCH', `/items/streken/${id}`, updates);
  if (res.ok) { log('✓'); return id; }
  log(`✗ FAIL (${res.status}): ${JSON.stringify(res.data).slice(0, 200)}`);
  return null;
}

async function upsertNewStreek(streek) {
  // Check of slug al bestaat
  const checkRes = await api('GET', `/items/streken?filter[slug][_eq]=${streek.slug}&fields=id,slug,name&limit=1`);
  if (checkRes.ok && checkRes.data?.data?.length > 0) {
    const existing = checkRes.data.data[0];
    process.stdout.write(`  PATCH streken (${streek.name}, slug bestaat: ${existing.id}) ... `);
    const patchRes = await api('PATCH', `/items/streken/${existing.id}`, {
      wine_style: streek.wine_style,
      dominant_grape: streek.dominant_grape,
      main_grapes: streek.main_grapes,
      sort_order: streek.sort_order,
    });
    if (patchRes.ok) { log('✓'); return existing.id; }
    log(`✗ FAIL (${patchRes.status}): ${JSON.stringify(patchRes.data).slice(0, 200)}`);
    return null;
  }

  // Maak nieuw record aan
  process.stdout.write(`  POST streken (${streek.name}) ... `);
  const createRes = await api('POST', '/items/streken', streek);
  if (createRes.ok) {
    const newId = createRes.data?.data?.id;
    log(`✓ id=${newId}`);
    return newId;
  }
  log(`✗ FAIL (${createRes.status}): ${JSON.stringify(createRes.data).slice(0, 200)}`);
  return null;
}

// ─── 4. Appellaties definities ────────────────────────────────────────────────

function appellaties(streekIds) {
  const {
    piemonte,    // id=1
    toscane,     // id=4
    etna,        // id=5 (Sicilië)
    veneto,
    friuli,
    trentino,
    emiliaRomagna,
    campania,
    puglia,
    sardegna,
  } = streekIds;

  const LAND_ID = 1; // Italië

  return [
    // ── Piemonte ──
    { name: 'Barolo DOCG', slug: 'barolo-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: '100% Nebbiolo. Min. 38 maanden rijping (62 maanden voor Riserva). 11 Comuni in de Langhe. 170 officieel erkende MGA-percelen.' },
    { name: 'Barbaresco DOCG', slug: 'barbaresco-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: '100% Nebbiolo. Min. 26 maanden rijping (50 maanden Riserva). Kleiner en toegankelijker dan Barolo. 3 Comuni, 780 ha.' },
    { name: 'Asti DOCG', slug: 'asti-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: '100% Moscato Bianco. Zoet mousserend (spumante). Broertje: Moscato d\'Asti DOCG (licht perlé, 5–5,5% alc).' },
    { name: "Moscato d'Asti DOCG", slug: 'moscato-dasti-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 4, status: 'draft',
      description: '100% Moscato Bianco. Licht mousserend (perlé), 5–5,5% alcohol, zoet. Ideaal als dessert-afsluiter.' },
    { name: 'Gavi DOCG', slug: 'gavi-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 5, status: 'draft',
      description: '100% Cortese. Droge witte wijn uit de provincie Alessandria. Fris, licht, citrus.' },
    { name: 'Roero DOCG', slug: 'roero-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 6, status: 'draft',
      description: 'Roero Rosso: 95% Nebbiolo. Roero Bianco: 95% Arneis. Ten noorden van de Tanaro-rivier, tegenover de Langhe.' },
    { name: 'Nizza DOCG', slug: 'nizza-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 7, status: 'draft',
      description: '100% Barbera d\'Asti Superiore. Min. 18 maanden houtrijping. Kwaliteitstop van de Barbera-appellation.' },
    { name: 'Gattinara DOCG', slug: 'gattinara-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 8, status: 'draft',
      description: 'Min. 90% Nebbiolo (lokaal Spanna). Noord-Piemonte. Noordelijkste serieuze Nebbiolo-zone.' },
    { name: 'Ghemme DOCG', slug: 'ghemme-docg', classification: 'DOCG', streek_id: piemonte, land_id: LAND_ID, sort_order: 9, status: 'draft',
      description: 'Min. 85% Nebbiolo (Spanna). Noord-Piemonte, naast Gattinara. Kleinere productie, minder bekend.' },

    // ── Toscane ──
    { name: 'Brunello di Montalcino DOCG', slug: 'brunello-di-montalcino-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: '100% Brunello (Sangiovese Grosso). Min. 5 jaar rijping (6 voor Riserva). 210 producenten. Een van Italië\'s grootste bewaarwijnen.' },
    { name: 'Vino Nobile di Montepulciano DOCG', slug: 'vino-nobile-di-montepulciano-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Min. 70% Prugnolo Gentile (Sangiovese). Montepulciano, tussen Florence en Siena. Min. 2 jaar rijping.' },
    { name: 'Chianti Classico DOCG', slug: 'chianti-classico-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Min. 80% Sangiovese. Kernzone tussen Florence en Siena. Gran Selezione: min. 30 maanden, cru-kwaliteit.' },
    { name: 'Morellino di Scansano DOCG', slug: 'morellino-di-scansano-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 4, status: 'draft',
      description: 'Min. 85% Morellino (Sangiovese). Maremma-kustzone. Ronder en toegankelijker dan Brunello.' },
    { name: 'Vernaccia di San Gimignano DOCG', slug: 'vernaccia-di-san-gimignano-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 5, status: 'draft',
      description: 'Enige witte autochtone DOCG in Toscane. Droog, nootachtig. Eerste DOC van Italië (1966), DOCG 1993.' },
    { name: 'Carmignano DOCG', slug: 'carmignano-docg', classification: 'DOCG', streek_id: toscane, land_id: LAND_ID, sort_order: 6, status: 'draft',
      description: 'Historisch klein gebied ten westen van Florence. Sangiovese + verplicht 10–20% Cabernet Sauvignon of Franc.' },
    { name: 'Bolgheri Sassicaia DOC', slug: 'bolgheri-sassicaia-doc', classification: 'DOC', streek_id: toscane, land_id: LAND_ID, sort_order: 7, status: 'draft',
      description: 'Kleinste appellatie van Italië (één producent: Tenuta San Guido). Cabernet Sauvignon-gedomineerd. De Super Tuscan die de règels herschreef.' },

    // ── Veneto ──
    { name: 'Amarone della Valpolicella DOCG', slug: 'amarone-della-valpolicella-docg', classification: 'DOCG', streek_id: veneto, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Droge rode wijn van gedroogde Corvina/Rondinella-druiven (appassimento). Min. 14% alcohol, complex-vol.' },
    { name: 'Recioto della Valpolicella DOCG', slug: 'recioto-della-valpolicella-docg', classification: 'DOCG', streek_id: veneto, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Zoete versie van Amarone (niet volledig doorgegist). Rosso dessert-wijn van dezelfde appassimento-druiven.' },
    { name: 'Soave Superiore DOCG', slug: 'soave-superiore-docg', classification: 'DOCG', streek_id: veneto, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Min. 70% Garganega. Elegantere, hogere-kwaliteitsversie van de klassieke Soave DOC. Licht, amandelachtig.' },
    { name: 'Recioto di Soave DOCG', slug: 'recioto-di-soave-docg', classification: 'DOCG', streek_id: veneto, land_id: LAND_ID, sort_order: 4, status: 'draft',
      description: 'Zoete witte wijn van Garganega. Appassimento-methode. Dessert-wijn.' },
    { name: 'Conegliano Valdobbiadene Prosecco Superiore DOCG', slug: 'conegliano-valdobbiadene-prosecco-superiore-docg', classification: 'DOCG', streek_id: veneto, land_id: LAND_ID, sort_order: 5, status: 'draft',
      description: '100% Glera. Charmat-methode. Fruitig-fris. Cartizze is de meest geprestigeerde subzone (107 ha).' },

    // ── Friuli-Venezia Giulia ──
    { name: 'Colli Orientali del Friuli Picolit DOCG', slug: 'colli-orientali-del-friuli-picolit-docg', classification: 'DOCG', streek_id: friuli, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Zoete dessert-wijn van Picolit-druif. Lage opbrengst door vruchtrui, zeldzaam en geprezen.' },
    { name: 'Ramandolo DOCG', slug: 'ramandolo-docg', classification: 'DOCG', streek_id: friuli, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Zoete witte wijn van Verduzzo Friulano. Noord-Friuli op steile hellingen.' },
    { name: 'Rosazzo DOCG', slug: 'rosazzo-docg', classification: 'DOCG', streek_id: friuli, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Droge witte wijn (meerdere rassen) uit de Colli Orientali del Friuli-subzone Rosazzo. Historisch abdijdomein.' },

    // ── Trentino-Alto Adige ──
    { name: 'Trentino Superiore DOCG', slug: 'trentino-superiore-docg', classification: 'DOCG', streek_id: trentino, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Kwaliteits-DOCG voor de provincie Trentino. Meerdere druifvarianten (Lagrein, Pinot Bianco, etc.) onder één koepel.' },
    { name: 'Alto Adige / Südtirol DOC', slug: 'alto-adige-sudtirol-doc', classification: 'DOC', streek_id: trentino, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Brede DOC met 30+ sub-variëteiten (Pinot Bianco, Lagrein, Gewürztraminer, Schiava, etc.). Koele bergklimaat op 600–900m.' },
    { name: 'Teroldego Rotaliano DOC', slug: 'teroldego-rotaliano-doc', classification: 'DOC', streek_id: trentino, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Exclusief voor Teroldego op de Campo Rotaliano-vlakte. Donkerpaars, kruidig, inheems druivenras.' },

    // ── Emilia-Romagna ──
    { name: 'Romagna Albana DOCG', slug: 'romagna-albana-docg', classification: 'DOCG', streek_id: emiliaRomagna, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Eerste witte DOCG van Italië (1987, destijds als Albana di Romagna). Albana-druif in diverse stijlen: droog, semi-zoet en passito.' },
    { name: 'Colli Bolognesi Classico Pignoletto DOCG', slug: 'colli-bolognesi-classico-pignoletto-docg', classification: 'DOCG', streek_id: emiliaRomagna, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Droge witte wijn van Pignoletto (Grechetto Gentile) rond Bologna. Fris, licht bitter, gastronomisch.' },

    // ── Sicilië/Etna ──
    { name: 'Cerasuolo di Vittoria DOCG', slug: 'cerasuolo-di-vittoria-docg', classification: 'DOCG', streek_id: etna, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: "Enige DOCG van Sicilië. Min. 50% Nero d'Avola + 50% Frappato. Kersen, bloemenig, fris-medium lichaam." },
    { name: 'Etna DOC', slug: 'etna-doc', classification: 'DOC', streek_id: etna, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Rosso (Nerello Mascalese), Bianco (Carricante), Rosato. Subzones: Contrade (specifieke vulkanische percelen, vergelijkbaar met MGA).' },
    { name: 'Marsala DOC', slug: 'marsala-doc', classification: 'DOC', streek_id: etna, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Gefortificeerde wijn uit West-Sicilië. Secco/Semisecco/Dolce. Vergine/Soleras meest gewaardeerd.' },
    { name: 'Passito di Pantelleria DOC', slug: 'passito-di-pantelleria-doc', classification: 'DOC', streek_id: etna, land_id: LAND_ID, sort_order: 4, status: 'draft',
      description: 'Zoete wijn van Zibibbo (Muscat van Alexandrië) van het eiland Pantelleria. Abrikoos, honing, intens.' },

    // ── Campania ──
    { name: 'Taurasi DOCG', slug: 'taurasi-docg', classification: 'DOCG', streek_id: campania, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: "Min. 85% Aglianico. Min. 3 jaar rijping (4 voor Riserva). Laat rijpend (oogst oktober). 'Barolo van het Zuiden'." },
    { name: 'Greco di Tufo DOCG', slug: 'greco-di-tufo-docg', classification: 'DOCG', streek_id: campania, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Min. 85% Greco. Exclusief in 8 Comuni van de Irpinia op vulkanische tufsteen. Mineralig, amandel, nootachtig.' },
    { name: 'Fiano di Avellino DOCG', slug: 'fiano-di-avellino-docg', classification: 'DOCG', streek_id: campania, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Min. 85% Fiano. Avellino-provincie. Geurig, honing en hazelnoot, uitstekend verouderingspotentieel.' },
    { name: 'Aglianico del Taburno DOCG', slug: 'aglianico-del-taburno-docg', classification: 'DOCG', streek_id: campania, land_id: LAND_ID, sort_order: 4, status: 'draft',
      description: 'Min. 85% Aglianico. Taburno-gebergte, provincie Benevento. Vergelijkbare stijl als Taurasi, minder bekend.' },

    // ── Puglia ──
    { name: 'Primitivo di Manduria Dolce Naturale DOCG', slug: 'primitivo-di-manduria-dolce-naturale-docg', classification: 'DOCG', streek_id: puglia, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Zoete, natuurlijk gefortificeerde stijl van Primitivo. Manduria-DOC-kern. Rozijn, vijg, hoog restsuiker.' },
    { name: 'Castel del Monte Nero di Troia Riserva DOCG', slug: 'castel-del-monte-nero-di-troia-riserva-docg', classification: 'DOCG', streek_id: puglia, land_id: LAND_ID, sort_order: 2, status: 'draft',
      description: 'Kwaliteitstop van Nero di Troia. Castel del Monte-plateau, provincie Bari. Min. 2 jaar rijping.' },
    { name: 'Castel del Monte Bombino Nero DOCG', slug: 'castel-del-monte-bombino-nero-docg', classification: 'DOCG', streek_id: puglia, land_id: LAND_ID, sort_order: 3, status: 'draft',
      description: 'Roséwijn van Bombino Nero. Fris, fruitig. Castel del Monte-gebied in Centraal-Puglia.' },

    // ── Sardegna ──
    { name: 'Vermentino di Gallura DOCG', slug: 'vermentino-di-gallura-docg', classification: 'DOCG', streek_id: sardegna, land_id: LAND_ID, sort_order: 1, status: 'draft',
      description: 'Enige DOCG van Sardegna. Min. 95% Vermentino. Noord-Sardinië (Gallura). Droog, aromatisch, licht bitterheid in de afdronk.' },
  ];
}

// ─── 5. Appellaties-insert helper ─────────────────────────────────────────────

async function upsertAppellatie(app) {
  // Check of record al bestaat op naam + land_id
  const checkRes = await api(
    'GET',
    `/items/appellaties?filter[name][_eq]=${encodeURIComponent(app.name)}&filter[land_id][_eq]=${app.land_id}&fields=id,name&limit=1`
  );
  if (checkRes.ok && checkRes.data?.data?.length > 0) {
    const existing = checkRes.data.data[0];
    process.stdout.write(`  PATCH appellaties (${app.name}) id=${existing.id} ... `);
    const patchRes = await api('PATCH', `/items/appellaties/${existing.id}`, {
      description: app.description,
      classification: app.classification,
      streek_id: app.streek_id,
      sort_order: app.sort_order,
    });
    if (patchRes.ok) { log('✓'); return; }
    log(`✗ FAIL (${patchRes.status}): ${JSON.stringify(patchRes.data).slice(0, 200)}`);
    return;
  }

  process.stdout.write(`  POST appellaties (${app.name}) ... `);
  const createRes = await api('POST', '/items/appellaties', app);
  if (createRes.ok) {
    log(`✓ id=${createRes.data?.data?.id}`);
  } else {
    log(`✗ FAIL (${createRes.status}): ${JSON.stringify(createRes.data).slice(0, 200)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Seed Italië infographic content (LAT-1124) ===');
  log(`Directus URL: ${DIRECTUS_URL}`);

  // Stap 1: Italië facts-box
  await updateItalieLand();

  // Stap 2: Bestaande streken updaten
  log('\n=== Stap 2: Bestaande streken updaten ===');
  const streekIds = {};
  for (const s of EXISTING_STREKEN_UPDATES) {
    const id = await updateStreek(s.id, s.label, {
      wine_style: s.wine_style,
      dominant_grape: s.dominant_grape,
      main_grapes: s.main_grapes,
      sort_order: s.sort_order,
    });
    // Map slug naar zone-key
    if (s.slug === 'langhe-piemonte') streekIds.piemonte = id;
    if (s.slug === 'toscane-italie') streekIds.toscane = id;
    if (s.slug === 'etna-sicilie') streekIds.etna = id;
  }

  // Stap 3: Nieuwe streken aanmaken/bijwerken
  log('\n=== Stap 3: Nieuwe streken aanmaken ===');
  for (const s of NEW_STREKEN) {
    const id = await upsertNewStreek(s);
    if (id) {
      if (s.slug === 'veneto-italie') streekIds.veneto = id;
      if (s.slug === 'friuli-italie') streekIds.friuli = id;
      if (s.slug === 'trentino-italie') streekIds.trentino = id;
      if (s.slug === 'emilia-romagna-italie') streekIds.emiliaRomagna = id;
      if (s.slug === 'campania-italie') streekIds.campania = id;
      if (s.slug === 'puglia-italie') streekIds.puglia = id;
      if (s.slug === 'sardegna-italie') streekIds.sardegna = id;
    }
  }

  log('\nStreek ID mapping:');
  for (const [key, id] of Object.entries(streekIds)) {
    log(`  ${key}: ${id}`);
  }

  // Stap 4: Appellaties aanmaken
  log('\n=== Stap 4: Appellaties aanmaken ===');
  const allAppellaties = appellaties(streekIds);
  log(`  Totaal te verwerken: ${allAppellaties.length} appellaties`);
  for (const app of allAppellaties) {
    await upsertAppellatie(app);
  }

  log('\n=== Klaar ===');
  log(`Samenvatting:`);
  log(`  - landen/1 bijgewerkt (facts-box)`);
  log(`  - ${EXISTING_STREKEN_UPDATES.length} bestaande streken bijgewerkt`);
  log(`  - ${NEW_STREKEN.length} nieuwe streken aangemaakt (status: draft)`);
  log(`  - ${allAppellaties.length} appellaties verwerkt`);
  log('');
  log('Vervolgstap: CTO bevestigt slugs voor de 7 nieuwe streken vóór publish.');
}

main().catch(err => {
  console.error('Onverwachte fout:', err);
  process.exit(1);
});
