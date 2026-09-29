// LAT-12032: eerste DiscoverCars-plaatsingen. Kaap (routes/4): 3e vergelijkingsoptie NL + EN.
// Toscane (routes/10): nieuw comparison-blok NL + EN. Idempotent. Slugs uit VERIFIED_DISCOVERCARS_DEST.
// Run: directus-run-internal.sh --script directus/scripts/lat12032-discovercars-placements.mjs [-- --dry-run]
const URL_ = process.env.DIRECTUS_URL || 'http://directus:8055';
const H = { Authorization: `Bearer ${process.env.DIRECTUS_TOKEN}`, 'Content-Type': 'application/json' };
const DRY = process.argv.includes('--dry-run');
const api = async (m, p, b) => {
  const r = await fetch(`${URL_}${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  return { ok: r.ok, status: r.status, json: t ? JSON.parse(t) : null };
};
const opt = (title, why, dest, label) => ({ tier: 'huurauto', title, why, link: { partner: 'discovercars', dest, label } });

const KAAP = {
  nl: opt('Huurauto: Kaapstad',
    'Zonder auto kom je niet van De Molen naar Franschhoek, Paarl en Hemel-en-Aarde. Pak hem op bij aankomst in Kaapstad en lever hem na dag 5 weer in. In Zuid-Afrika rijd je links.',
    'south-africa/cape-town', "Bekijk huurauto's bij DiscoverCars"),
  en: opt('Rental car: Cape Town',
    'Without a car you cannot get from De Molen to Franschhoek, Paarl and Hemel-en-Aarde. Collect it on arrival in Cape Town and return it after day 5. In South Africa you drive on the left.',
    'south-africa/cape-town', 'Compare rental cars at DiscoverCars'),
};
const TOSCANE = {
  nl: {
    heading: 'Wat regel je vooraf?',
    why: 'Bolgheri, Montalcino en Carmignano liggen ver uit elkaar en zijn niet met het openbaar vervoer te combineren. De route gaat uit van een huurauto.',
    options: [opt('Huurauto: Pisa Airport',
      'Pisa ligt het dichtst bij Bolgheri, waar dag 1 begint. Dag 3 eindigt bij Carmignano, veertig minuten van Florence.',
      'italy-mainland/pisa/psa', "Bekijk huurauto's bij DiscoverCars")],
  },
  en: {
    heading: 'What to arrange in advance',
    why: 'Bolgheri, Montalcino and Carmignano are far apart and cannot be combined by public transport. The route assumes a rental car.',
    options: [opt('Rental car: Pisa Airport',
      'Pisa is the closest airport to Bolgheri, where day 1 starts. Day 3 ends at Carmignano, forty minutes from Florence.',
      'italy-mainland/pisa/psa', 'Compare rental cars at DiscoverCars')],
  },
};

async function patch(coll, id, cta) {
  console.log(`${DRY ? '[dry] ' : ''}PATCH ${coll}/${id}`);
  if (DRY) return;
  const r = await api('PATCH', `/items/${coll}/${id}`, { cta_blocks: cta });
  console.log(`  -> ${r.status}`);
  if (!r.ok) process.exit(1);
}
const get = async (coll, id) => (await api('GET', `/items/${coll}/${id}?fields=cta_blocks`)).json?.data?.cta_blocks;
const has = (cta) => JSON.stringify(cta ?? {}).includes('"discovercars"');

// Kaap: bestaande structuur behouden, optie achteraan (merge is index-gebaseerd).
for (const [coll, id, lang] of [['routes', 4, 'nl'], ['routes_translations', 7, 'en']]) {
  const cta = await get(coll, id);
  if (has(cta)) { console.log(`= ${coll}/${id} heeft al DiscoverCars`); continue; }
  cta.comparison.options.push(KAAP[lang]);
  await patch(coll, id, cta);
}
// Toscane: alleen comparison; primary/closing blijven weg (geen bewezen verblijf-copy).
for (const [coll, id, lang] of [['routes', 10, 'nl'], ['routes_translations', 13, 'en']]) {
  const cta = await get(coll, id);
  if (has(cta)) { console.log(`= ${coll}/${id} heeft al DiscoverCars`); continue; }
  const base = Array.isArray(cta) || !cta ? {} : cta;
  await patch(coll, id, { ...base, comparison: TOSCANE[lang] });
}
