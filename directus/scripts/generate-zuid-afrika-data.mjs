// One-shot generator (run by CTO during heartbeat with Paperclip API access).
// Pulls approved article bodies from LAT-1164 documents, extracts the H1 as the
// Directus `title`, strips the duplicate H1 from the stored body, and bakes in
// the SEO-corrected metadata (LAT-1167 trims supersede the stale LAT-1165 CMS doc).
// Output: directus/data/zuid-afrika-articles.json (consumed by import script).
import { writeFileSync } from 'node:fs';

const API = process.env.PAPERCLIP_API_URL;
const KEY = process.env.PAPERCLIP_API_KEY;
const LAT1164 = 'e56e16ba-5635-42f7-910c-e8d880cce18c';

// documentKey -> Directus record metadata. metaDescription/metaTitle reflect the
// FINAL SEO-validated values from LAT-1167 (the CMS-metadata doc was never updated
// with these trims). category/slug from LAT-1165 CMS-metadata.
const MANIFEST = [
  { key: 'draft-pillar', phase: 1, slug: 'zuid-afrika-wijnland-gids', category: 'Regio-gidsen',
    metaTitle: "Zuid-Afrika als wijnland — regio's, klimaat en hoe te reizen",
    metaDescription: "Swartland, Stellenbosch, Hemel-en-Aarde: waarom de Kaap serieuzer is dan z'n reputatie. Overzicht van regio's, klimaat en beste reistijden." },
  { key: 'draft', phase: 1, slug: 'stellenbosch-wijnregio-gids', category: 'Regio-gidsen',
    metaTitle: 'Stellenbosch wijnregio — gids met Uva Mira, Paarl en Franschhoek route',
    metaDescription: 'Stellenbosch, Franschhoek, Paarl en Hemel-en-Aarde in één route. Uva Mira op de Helderberg, Chenin Blanc in Paarl en Pinot Noir bij Hermanus.' },
  { key: 'draft-franschhoek', phase: 1, slug: 'franschhoek-wijnregio-gids', category: 'Regio-gidsen',
    metaTitle: 'Franschhoek — meer dan de Wine Tram',
    metaDescription: "Kleine producers op hoogte, Blanc de Blancs en een vallei die meer kan dan z'n naam." },
  { key: 'draft-route-vijf-dagen', phase: 1, slug: 'kaap-wijnroute-vijf-dagen', category: 'Routes & logistiek',
    metaTitle: 'Vijf dagen door het Kaapse wijnland — dag-voor-dag route',
    metaDescription: 'De Molen als thuisbasis, Uva Mira dag 1, Franschhoek en Paarl dag 2-3, Hamilton Russell en Creation dag 4. Praktische logistiek en verblijfsadvies.' },
  { key: 'draft-paarl', phase: 2, slug: 'paarl-wijnregio-gids', category: 'Regio-gidsen',
    metaTitle: 'Paarl — Chenin Blanc, graniet en de stille wijnmakers',
    metaDescription: 'Paarl is geen doorrij-regio. Granietbodem, oud-wijnstok Chenin Blanc van vijftig jaar en Rhône-variëteiten die hier hun sterkste argument maken.' },
  { key: 'draft-hemel-en-aarde', phase: 2, slug: 'hemel-en-aarde-vallei-gids', category: 'Regio-gidsen',
    metaTitle: 'Hemel-en-Aarde — de vallei die alles verandert',
    metaDescription: 'Atlantisch gekoeld, 15-18°C groeiseizoen. Hamilton Russell, Creation en Bouchard Finlayson maken hier de beste Pinot Noir van het zuiden.' },
  { key: 'draft-swartland', phase: 2, slug: 'swartland-wijnregio-gids', category: 'Regio-gidsen',
    metaTitle: 'Swartland — de regio die ik ken via de fles',
    metaDescription: 'Geen toeristisch circuit, wel de meest besproken wijnen van de Kaap. Graniet, leischist en vijftig jaar oude Chenin Blanc-stokken.' },
  { key: 'draft-constantia', phase: 2, slug: 'constantia-wijnregio-gids', category: 'Regio-gidsen',
    metaTitle: 'Constantia — het oudste wijngebied van Zuid-Afrika',
    metaDescription: 'Simon van der Stel plantte hier 1685. Vin de Constance, picknick bij Uitsig en waarom Constantia de beste dag is voor een Kaap-reis.' },
  { key: 'draft-dagtrip-swartland', phase: 2, slug: 'swartland-dagtrip-kaapstad', category: 'Routes & logistiek',
    metaTitle: 'Swartland op een dag vanuit Kaapstad',
    metaDescription: 'N7, Riebeek-Kasteel, Badenhorst op Kalmoesfontein en Mullineux bij de Paardeberg. Hoe je de andere Kaap vindt in één dag zonder te overnachten.' },
  { key: 'draft-portret-uva-mira', phase: 2, slug: 'uva-mira-wijnhuis-portret', category: 'Huis-portretten',
    metaTitle: 'Uva Mira Mountain Vineyards — hoog op de Helderberg',
    metaDescription: '400-500 meter, biologische teelt, handmatige oogst. De Single Tree Chardonnay toont wat hoogte doet met een druivensoort.' },
  { key: 'draft-portret-hamilton-russell', phase: 2, slug: 'hamilton-russell-hemel-en-aarde', category: 'Huis-portretten',
    metaTitle: 'Hamilton Russell Vineyards — twee wijnen, niets anders',
    metaDescription: 'Tim Hamilton Russell plantte in 1975 waar niemand dat deed. Pinot Noir en Chardonnay, geen tweede lijn, geen compromise.' },
  { key: 'draft-portret-sadie-family', phase: 2, slug: 'sadie-family-swartland', category: 'Huis-portretten',
    metaTitle: 'Sadie Family Wines — hoe Eben Sadie de Kaap herschreef',
    metaDescription: "Columella, Palladius, Old Vine Series. Waarom Sadie's keuze voor Swartland de meest invloedrijke beslissing was in moderne Zuid-Afrikaanse wijn." },
  { key: 'draft-portret-creation', phase: 2, slug: 'creation-wines-hemel-en-aarde', category: 'Huis-portretten',
    metaTitle: 'Creation Wines — wijn en spijs op de koelste ridge',
    metaDescription: 'Wijn-en-spijsproeverij van Jean-Claude Martin op de Hemel-en-Aarde Ridge. Pinot Noir, Atlantisch uitzicht en twee uur die je wijnbeleving veranderen.' },
  { key: 'draft-portret-boekenhoutskloof', phase: 2, slug: 'boekenhoutskloof-franschhoek', category: 'Huis-portretten',
    metaTitle: 'Boekenhoutskloof — verder dan de Chocolate Box',
    metaDescription: "Marc Kent's Flagship Syrah en Semillon hebben niets van doen met het commerciële label. Serieuzer dan je verwacht." },
  { key: 'draft-portret-constantia-uitsig', phase: 2, slug: 'constantia-uitsig-portret', category: 'Huis-portretten',
    metaTitle: 'Constantia Uitsig — picknick en driehonderd jaar wijnland',
    metaDescription: 'Boutique-hotel op de oudste wijngrond van Zuid-Afrika. Picknick op het gazon, Vin de Constance vijf minuten verderop bij Klein Constantia.' },
  { key: 'draft-de-molen', phase: 2, slug: 'de-molen-guesthouse-review', category: 'Routes & logistiek',
    metaTitle: 'De Molen Guesthouse — thuisbasis in het Kaapse wijnland',
    metaDescription: 'Gastvrouw die weet welke wijnhuizen die week de moeite waard zijn. Stellenbosch 20 min, Franschhoek 30 min. Beste uitvalsbasis voor westelijke Kaap.' },
  { key: 'draft-wijn-meenemen', phase: 2, slug: 'wijn-meenemen-uit-zuidafrika', category: 'Meenemen & doordrinken',
    metaTitle: 'Wijn meenemen uit Zuid-Afrika — douane, inpakken en verschepen',
    metaDescription: 'Wat is belastingvrij, hoe inpakken voor vlucht, wanneer verschepen via estate? Praktische gids voor wie niet ledig door Schiphol wil.' },
];

function splitTitleBody(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  // skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;
  let title = '';
  if (i < lines.length && /^#\s+/.test(lines[i])) {
    title = lines[i].replace(/^#\s+/, '').trim();
    i++;
    // drop a single blank line following the H1
    if (i < lines.length && lines[i].trim() === '') i++;
  }
  const body = lines.slice(i).join('\n').trim();
  return { title, body };
}

async function getDoc(key) {
  const res = await fetch(`${API}/api/issues/${LAT1164}/documents/${key}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`doc ${key}: ${res.status} ${await res.text()}`);
  return (await res.json()).body || '';
}

const out = [];
for (const m of MANIFEST) {
  const raw = await getDoc(m.key);
  const { title, body } = splitTitleBody(raw);
  if (!title) throw new Error(`No H1 title extracted for ${m.key}`);
  out.push({
    documentKey: m.key,
    phase: m.phase,
    slug: m.slug,
    title,
    category: m.category,
    author: 'Martin',
    status: 'draft',
    pub_date: null,
    metaTitle: m.metaTitle,
    metaDescription: m.metaDescription,
    body,
  });
  console.log(`${m.key.padEnd(34)} -> ${m.slug.padEnd(32)} | title: ${title.slice(0, 50)} | metaDesc ${m.metaDescription.length}ch | body ${body.length}ch`);
}

const overLimit = out.filter((a) => a.metaDescription.length > 155);
if (overLimit.length) {
  console.error('\nMETA-DESC OVER 155:', overLimit.map((a) => `${a.slug}(${a.metaDescription.length})`).join(', '));
  process.exit(1);
}

writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
console.log(`\nWrote ${out.length} records to ${process.argv[2]}`);
