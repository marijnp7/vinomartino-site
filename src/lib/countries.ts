export interface Country {
  slug: string;
  name: string;
  continent: string;
  capital: string;
  currency: string;
  language: string;
  timezone: string;
  visaRules: string;
  vaccinations: string;
  safetyLevel: string;
  bestTravelTime: Record<string, number>;
  heroImage: string;
  description: string;
  metaTitle: string;
  metaDescription: string;
}

const DIRECTUS_URL = process.env['DIRECTUS_URL'] || '';
const DIRECTUS_TOKEN = process.env['DIRECTUS_TOKEN'] || '';

const stubCountries: Country[] = [
  {
    slug: 'thailand',
    name: 'Thailand',
    continent: 'Azië',
    capital: 'Bangkok',
    currency: 'THB (Thaise Baht)',
    language: 'Thai',
    timezone: 'UTC+7',
    visaRules: 'NL-paspoort: 30 dagen visumvrij bij aankomst per vliegtuig. Verlenging tot 60 dagen mogelijk bij immigratiekantoor.',
    vaccinations: 'Hepatitis A en DTP aanbevolen. Rabiës bij langere reizen of contact met dieren.',
    safetyLevel: 'Goed — standaard reisvoorzorgen, let op in het verkeer',
    bestTravelTime: { jan: 9, feb: 9, mrt: 8, apr: 6, mei: 5, jun: 5, jul: 5, aug: 5, sep: 4, okt: 6, nov: 8, dec: 9 },
    heroImage: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=1200&h=600&fit=crop&q=80',
    description: 'Van de bruisende straten van Bangkok tot de serene tempels van Chiang Mai en de paradijselijke eilanden in het zuiden — Thailand is de perfecte mix van cultuur, natuur en culinaire avonturen.',
    metaTitle: 'Thailand Reisgids — Alles voor je reis naar Thailand',
    metaDescription: 'Praktische reisinformatie over Thailand: visum, beste reistijd, veiligheid, bestemmingen en reisroutes. Plan je reis met onze complete gids.',
  },
  {
    slug: 'portugal',
    name: 'Portugal',
    continent: 'Europa',
    capital: 'Lissabon',
    currency: 'EUR (Euro)',
    language: 'Portugees',
    timezone: 'UTC+0 (WET)',
    visaRules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. DTP en Hepatitis A op advies van huisarts.',
    safetyLevel: 'Zeer goed — een van de veiligste landen in Europa',
    bestTravelTime: { jan: 6, feb: 6, mrt: 7, apr: 8, mei: 9, jun: 9, jul: 8, aug: 8, sep: 9, okt: 8, nov: 7, dec: 6 },
    heroImage: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1200&h=600&fit=crop&q=80',
    description: 'Lissabon, Porto, de Algarve en de verborgen dorpen van het binnenland — Portugal combineert oude cultuur met een relaxte sfeer, fantastisch eten en betaalbare prijzen.',
    metaTitle: 'Portugal Reisgids — Alles voor je reis naar Portugal',
    metaDescription: 'Praktische reisinformatie over Portugal: bestemmingen, reistijd, tips en reisroutes. Van Lissabon tot de Algarve.',
  },
  {
    slug: 'italie',
    name: 'Italië',
    continent: 'Europa',
    capital: 'Rome',
    currency: 'EUR (Euro)',
    language: 'Italiaans',
    timezone: 'UTC+1 (CET)',
    visaRules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. Standaard reisvaccinaties op advies van huisarts.',
    safetyLevel: 'Goed — let op zakkenrollers in grote steden',
    bestTravelTime: { jan: 5, feb: 5, mrt: 7, apr: 8, mei: 9, jun: 9, jul: 8, aug: 7, sep: 9, okt: 8, nov: 6, dec: 5 },
    heroImage: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=1200&h=600&fit=crop&q=80',
    description: 'Van de Dolomieten tot Sicilië, van Romeinse ruïnes tot Toscaanse heuvels — Italië is een eindeloze ontdekking van kunst, architectuur, landschappen en de beste keuken ter wereld.',
    metaTitle: 'Italië Reisgids — Alles voor je reis naar Italië',
    metaDescription: 'Complete reisgids voor Italië: Rome, Toscane, Amalfikust en meer. Praktische tips, reisroutes en bestemmingen.',
  },
  {
    slug: 'japan',
    name: 'Japan',
    continent: 'Azië',
    capital: 'Tokio',
    currency: 'JPY (Japanse Yen)',
    language: 'Japans',
    timezone: 'UTC+9',
    visaRules: 'NL-paspoort: 90 dagen visumvrij voor toerisme. Paspoort moet geldig zijn tijdens verblijf.',
    vaccinations: 'Geen verplicht. Japanse encefalitis overwegen bij langere reizen naar rurale gebieden.',
    safetyLevel: 'Uitstekend — een van de veiligste landen ter wereld',
    bestTravelTime: { jan: 6, feb: 6, mrt: 8, apr: 9, mei: 8, jun: 5, jul: 5, aug: 5, sep: 7, okt: 9, nov: 9, dec: 7 },
    heroImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&h=600&fit=crop&q=80',
    description: 'Eeuwenoude tempels naast neonlichten, uitmuntende keukens van ramen tot kaiseki, en een treinnetwerk dat op de seconde rijdt — Japan is een land van fascinerende contrasten.',
    metaTitle: 'Japan Reisgids — Alles voor je reis naar Japan',
    metaDescription: 'Complete reisgids voor Japan: Tokio, Kyoto, reisroutes en praktische tips. Visum, vervoer en de beste reistijd.',
  },
  {
    slug: 'spanje',
    name: 'Spanje',
    continent: 'Europa',
    capital: 'Madrid',
    currency: 'EUR (Euro)',
    language: 'Spaans (Castellano)',
    timezone: 'UTC+1 (CET)',
    visaRules: 'EU/NL-burgers: geen visum nodig. Vrij reizen binnen Schengen.',
    vaccinations: 'Geen verplicht. Standaard reisvaccinaties op advies van huisarts.',
    safetyLevel: 'Goed — standaard voorzorgen, zakkenrollers in toeristische gebieden',
    bestTravelTime: { jan: 6, feb: 6, mrt: 7, apr: 8, mei: 9, jun: 8, jul: 7, aug: 7, sep: 9, okt: 8, nov: 7, dec: 6 },
    heroImage: 'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=1200&h=600&fit=crop&q=80',
    description: 'Van flamenco in Sevilla tot de stranden van de Costa Brava, van Gaudí in Barcelona tot de tapascultuur van San Sebastián — Spanje is levendig, warm en oneindig divers.',
    metaTitle: 'Spanje Reisgids — Alles voor je reis naar Spanje',
    metaDescription: 'Complete reisgids voor Spanje: Barcelona, Madrid, Andalusië en meer. Tips, reisroutes en de beste reistijd.',
  },
];

function mapDirectusCountry(d: Record<string, unknown>): Country {
  return {
    slug: String(d.slug),
    name: String(d.name),
    continent: String(d.continent || ''),
    capital: String(d.capital || ''),
    currency: String(d.currency || ''),
    language: String(d.language || ''),
    timezone: String(d.timezone || ''),
    visaRules: String(d.visa_rules || ''),
    vaccinations: String(d.vaccinations || ''),
    safetyLevel: String(d.safety_level || ''),
    bestTravelTime: (d.best_travel_time as Record<string, number>) || {},
    heroImage: d.hero_image ? `${DIRECTUS_URL}/assets/${d.hero_image}` : '',
    description: String(d.description || ''),
    metaTitle: String(d.meta_title || d.name || ''),
    metaDescription: String(d.meta_description || ''),
  };
}

let _cached: Country[] | null = null;

export async function loadCountries(): Promise<Country[]> {
  if (_cached) return _cached;

  if (DIRECTUS_URL && DIRECTUS_TOKEN) {
    try {
      const res = await fetch(
        `${DIRECTUS_URL}/items/countries?limit=-1&sort=name`,
        {
          headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.ok) {
        const json = await res.json();
        const items = (json.data || []).map(mapDirectusCountry);
        if (items.length > 0) {
          _cached = items;
          console.log(`[loadCountries] fetched ${items.length} countries from Directus`);
          return _cached;
        }
      }
    } catch (err) {
      console.warn(`[loadCountries] Directus fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`[loadCountries] using ${stubCountries.length} local stub countries`);
  _cached = stubCountries;
  return _cached;
}

export function getCountryBySlug(slug: string): Country | undefined {
  return (_cached || stubCountries).find((c) => c.slug === slug);
}

export function getCountriesByContinent(): Record<string, Country[]> {
  const countries = _cached || stubCountries;
  const grouped: Record<string, Country[]> = {};
  for (const c of countries) {
    const continent = c.continent || 'Overig';
    if (!grouped[continent]) grouped[continent] = [];
    grouped[continent].push(c);
  }
  return grouped;
}
