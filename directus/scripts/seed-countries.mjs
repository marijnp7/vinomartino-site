#!/usr/bin/env node
/**
 * Seed 5 country stubs into Directus.
 * Run after bootstrap-schema.mjs: DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<token> node directus/scripts/seed-countries.mjs
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

const countries = [
  {
    name: 'Thailand',
    slug: 'thailand',
    status: 'published',
    continent: 'Azië',
    capital: 'Bangkok',
    currency: 'THB (Thaise Baht)',
    language: 'Thai',
    timezone: 'UTC+7',
    visa_rules: 'NL-paspoort: 30 dagen visumvrij bij aankomst per vliegtuig. Verlenging tot 60 dagen mogelijk bij immigratiekantoor.',
    vaccinations: 'Hepatitis A en DTP aanbevolen. Rabiës bij langere reizen of contact met dieren.',
    safety_level: 'Goed — standaard reisvoorzorgen, let op in het verkeer',
    best_travel_time: { jan: 9, feb: 9, mrt: 8, apr: 6, mei: 5, jun: 5, jul: 5, aug: 5, sep: 4, okt: 6, nov: 8, dec: 9 },
    description: 'Van de bruisende straten van Bangkok tot de serene tempels van Chiang Mai en de paradijselijke eilanden in het zuiden — Thailand is de perfecte mix van cultuur, natuur en culinaire avonturen.',
    meta_title: 'Thailand Reisgids — Alles voor je reis naar Thailand',
    meta_description: 'Praktische reisinformatie over Thailand: visum, beste reistijd, veiligheid, bestemmingen en reisroutes.',
  },
  {
    name: 'Portugal',
    slug: 'portugal',
    status: 'published',
    continent: 'Europa',
    capital: 'Lissabon',
    currency: 'EUR (Euro)',
    language: 'Portugees',
    timezone: 'UTC+0 (WET)',
    visa_rules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. DTP en Hepatitis A op advies van huisarts.',
    safety_level: 'Zeer goed — een van de veiligste landen in Europa',
    best_travel_time: { jan: 6, feb: 6, mrt: 7, apr: 8, mei: 9, jun: 9, jul: 8, aug: 8, sep: 9, okt: 8, nov: 7, dec: 6 },
    description: 'Lissabon, Porto, de Algarve en de verborgen dorpen van het binnenland — Portugal combineert oude cultuur met een relaxte sfeer, fantastisch eten en betaalbare prijzen.',
    meta_title: 'Portugal Reisgids — Alles voor je reis naar Portugal',
    meta_description: 'Praktische reisinformatie over Portugal: bestemmingen, reistijd, tips en reisroutes.',
  },
  {
    name: 'Italië',
    slug: 'italie',
    status: 'published',
    continent: 'Europa',
    capital: 'Rome',
    currency: 'EUR (Euro)',
    language: 'Italiaans',
    timezone: 'UTC+1 (CET)',
    visa_rules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. Standaard reisvaccinaties op advies van huisarts.',
    safety_level: 'Goed — let op zakkenrollers in grote steden',
    best_travel_time: { jan: 5, feb: 5, mrt: 7, apr: 8, mei: 9, jun: 9, jul: 8, aug: 7, sep: 9, okt: 8, nov: 6, dec: 5 },
    description: 'Van de Dolomieten tot Sicilië, van Romeinse ruïnes tot Toscaanse heuvels — Italië is een eindeloze ontdekking van kunst, architectuur, landschappen en de beste keuken ter wereld.',
    meta_title: 'Italië Reisgids — Alles voor je reis naar Italië',
    meta_description: 'Complete reisgids voor Italië: Rome, Toscane, Amalfikust en meer.',
  },
  {
    name: 'Japan',
    slug: 'japan',
    status: 'published',
    continent: 'Azië',
    capital: 'Tokio',
    currency: 'JPY (Japanse Yen)',
    language: 'Japans',
    timezone: 'UTC+9',
    visa_rules: 'NL-paspoort: 90 dagen visumvrij voor toerisme. Paspoort moet geldig zijn tijdens verblijf.',
    vaccinations: 'Geen verplicht. Japanse encefalitis overwegen bij langere reizen naar rurale gebieden.',
    safety_level: 'Uitstekend — een van de veiligste landen ter wereld',
    best_travel_time: { jan: 6, feb: 6, mrt: 8, apr: 9, mei: 8, jun: 5, jul: 5, aug: 5, sep: 7, okt: 9, nov: 9, dec: 7 },
    description: 'Eeuwenoude tempels naast neonlichten, uitmuntende keukens van ramen tot kaiseki, en een treinnetwerk dat op de seconde rijdt — Japan is een land van fascinerende contrasten.',
    meta_title: 'Japan Reisgids — Alles voor je reis naar Japan',
    meta_description: 'Complete reisgids voor Japan: Tokio, Kyoto, reisroutes en praktische tips.',
  },
  {
    name: 'Spanje',
    slug: 'spanje',
    status: 'published',
    continent: 'Europa',
    capital: 'Madrid',
    currency: 'EUR (Euro)',
    language: 'Spaans (Castellano)',
    timezone: 'UTC+1 (CET)',
    visa_rules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. Standaard reisvaccinaties op advies van huisarts.',
    safety_level: 'Goed — standaard voorzorgen, zakkenrollers in toeristische gebieden',
    best_travel_time: { jan: 6, feb: 6, mrt: 7, apr: 8, mei: 9, jun: 8, jul: 7, aug: 7, sep: 9, okt: 8, nov: 7, dec: 6 },
    description: 'Van flamenco in Sevilla tot de stranden van de Costa Brava, van Gaudí in Barcelona tot de tapascultuur van San Sebastián — Spanje is levendig, warm en oneindig divers.',
    meta_title: 'Spanje Reisgids — Alles voor je reis naar Spanje',
    meta_description: 'Complete reisgids voor Spanje: Barcelona, Madrid, Andalusië en meer.',
  },
];

async function run() {
  console.log(`\nSeeding ${countries.length} countries into Directus at ${DIRECTUS_URL}\n`);

  for (const country of countries) {
    console.log(`  Creating: ${country.name}`);
    const res = await fetch(`${DIRECTUS_URL}/items/countries`, {
      method: 'POST',
      headers,
      body: JSON.stringify(country),
    });
    if (res.ok) {
      console.log(`    ✓ created`);
    } else if (res.status === 400) {
      const body = await res.json();
      if (body?.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
        console.log(`    ↳ already exists, skipping`);
      } else {
        console.error(`    ✗ error:`, body);
      }
    } else {
      console.error(`    ✗ ${res.status}:`, await res.text());
    }
  }

  console.log('\n✅ Country seeding complete.\n');
}

run().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});
