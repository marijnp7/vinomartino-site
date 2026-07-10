#!/usr/bin/env node
/**
 * Seed (VOORSTEL): gecureerde GetYourGuide-tours per streek (LAT-2252).
 *
 * Vult streken.gyg_tours (json) met door de Lead Editor beoordeelde curatie.
 * Basiscopy uit LAT-2018 (copy-gate LAT-1835), aangevuld 2026-07-10 met de
 * Lead-Editor-curatie op LAT-2252 (comment 17302c86): Toscane #3, Bourgogne #3,
 * Loire #3 en de nieuwe streek Champagne (4 tours). AC #4 gate: DOORGEGEVEN.
 *
 * AC #1 (≥5 renderende streken, elk 3–4 tours) is nu gedekt — alle vijf streken
 * zijn live op prod (slugs geverifieerd tegen sitemap):
 *   - langhe-piemonte (3), toscane-italie (3), bourgogne (3), loire (3),
 *     champagne (4).
 *
 * `url` = kale getyourguide.com-deeplink zonder tracking; partner_id=CRMZDZ6 +
 * cmp=streek-<slug> komen op render-tijd (decorateGyGTourUrl).
 *
 * Vereist eerst het veld: directus/scripts/add-gyg-tours-field.mjs.
 *
 * Run:  DIRECTUS_URL=http://vinomartino-directus-1:8055 \
 *       DIRECTUS_TOKEN=<admin-login-token> \
 *       node directus/scripts/seed-gyg-tours.mjs
 *
 * Idempotent: PATCht per streek (overschrijft gyg_tours met de curatie hier).
 * Dry-run: zet DRY_RUN=1 om alleen te tonen wat het zou doen.
 */

const DIRECTUS_URL   = process.env.DIRECTUS_URL   || "http://localhost:8055";
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const DRY_RUN        = process.env.DRY_RUN === "1";
if (!DIRECTUS_TOKEN) { console.error("DIRECTUS_TOKEN is required."); process.exit(1); }

const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}`, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${DIRECTUS_URL}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.status >= 200 && res.status < 300, status: res.status, data };
}

// Curatie per streek. `slugCandidates` vangt naming-drift op (langhe vs
// langhe-piemonte): het eerste bestaande record wint.
const CURATION = [
  {
    slugCandidates: ["langhe", "langhe-piemonte", "piemonte"],
    tours: [
      {
        title: "Barolo & Barbaresco-wijntour vanuit Alba",
        url: "https://www.getyourguide.com/alba/barolo-barbaresco-wine-tour",
        duration: "4–5 uur",
        blurb: "Vanuit Alba liggen de kleine producenten van Monforte en Verduno op een halfuur rijden. Twee wijnhuizen op één dag — het terroir-verschil tussen Barolo en Barbaresco wordt in het glas zichtbaar, niet op een kaart.",
      },
      {
        title: "Wijnmakerij-tour & proeverij Barolo en Barbaresco met lokaal eten",
        url: "https://www.getyourguide.com/nl-nl/langhe/piemonte-wijnmakerij-tour-proef-barolo-barbaresco-lokaal-eten",
        duration: "2 uur",
        blurb: "Twee uur, gericht, midden in de Langhe (UNESCO-gebied). Geen stadsbezoek — de heuvels zijn het decor en de wijn geeft er uitleg bij.",
      },
      {
        title: "Privétour: Piemonte-wijnproeverij in de Barolo-streek",
        url: "https://www.getyourguide.com/turin/private-tour-piedmont-wine-tasting-of-the-barolo-region",
        duration: "Flexibel (privé)",
        blurb: "Flexibel vertrek vanuit Turijn. Een kleine groep in de Barolo-heuvels, zonder vaste route — de namen op de flessen worden herkenbaar terrein.",
      },
    ],
  },
  {
    slugCandidates: ["toscane-italie", "toscane", "toscana", "chianti"],
    tours: [
      {
        title: "Truffeljacht, lunch & wijnproeverij in San Miniato",
        url: "https://www.getyourguide.com/florence/chianti-and-truffle-hunting-tour-in-san-miniato-tuscany",
        duration: "5–6 uur",
        blurb: "San Miniato staat bekend om zijn witte truffels (Tuber magnatum). In de bossen zoeken met een jager en zijn hond, de vondst in de handen, daarna bij de wijn — de volgorde maakt het verschil.",
      },
      {
        title: "Toscaanse wijngaard-tour in een oude Jeep, met proeverij en lunch",
        url: "https://www.getyourguide.com/tuscany/classic-tuscan-vineyard-old-jeep-tour-wine-tasting-lunch",
        duration: "Halve dag",
        blurb: "Een open Jeep door de Toscaanse heuvels: het landschap op armslengte, niet achter glas. Proeverij en lunch tussen de wijnstokken, met terroir als tafelgesprek.",
      },
      {
        title: "Small Group Tuscany Wine Tasting Safaris with Lunch/Dinner",
        url: "https://www.getyourguide.com/florence-l32/small-group-tuscany-wine-tasting-safaris-with-lunch-dinner-t100899/",
        duration: "6 uur",
        blurb: "Het Gallo Nero op het nekbandlabel is geen decoratie maar een aanduiding: Chianti Classico DOCG, geclassificeerd in 1996, uit het kerngebied tussen Florence en Siena. In kleine groep bezoek je twee producenten die het verschil laten proeven tussen de bodemtypes per zone — zandrijker richting Greve, galestro-leisteen richting Gaiole. Met lunch, geen shopping-stops. Proeven inclusief lokale pecorino en vleeswaren.",
      },
    ],
  },
  {
    slugCandidates: ["bourgogne", "bourgogne-cote-dor", "cote-dor"],
    tours: [
      {
        title: "Bourgogne wijnhuis-tour van Dijon naar Beaune, met lunch",
        url: "https://www.getyourguide.com/beaune/small-group-winery-tour-from-dijon-to-beaune-with-lunch",
        duration: "Volledige dag (8 uur)",
        blurb: "De Côte d’Or in één dag: Côte de Nuits én Côte de Beaune, met Beaune als middengebied. De climats liggen naast elkaar — het verschil in bodem en helling wordt in het glas zichtbaar.",
      },
      {
        title: "Bourgogne Grand Cru-proeverij vanuit Dijon",
        url: "https://www.getyourguide.com/dijon/burgundy-wines-full-day-tasting-tour-from-dijon",
        duration: "Volledige dag (10+ proeven)",
        blurb: "Gericht op de Grand Crus: mineraliteit en structuur die hun betekenis pas tonen wanneer ze naast elkaar zijn geproefd.",
      },
      {
        title: "From Beaune: Burgundy Day Trip with 14 Wine Tastings",
        url: "https://www.getyourguide.com/beaune-l5076/from-beaune-burgundy-day-trip-with-14-wine-tastings-t106615/",
        duration: "8 uur",
        blurb: "Veertien wijnen in één dag klinkt als overdaad. In Bourgondië is het gewoon het curriculum. De route loopt langs de Route des Grands Crus, met stops in Nuits-Saint-Georges, Gevrey-Chambertin en Beaune. Het leerzame zit in de vergelijking: twee appellaties naast elkaar, beide Pinot Noir, en toch een volledig ander gesprek — dan begint het verschil tussen Premier Cru en Grand Cru voelbaar te worden.",
      },
    ],
  },
  {
    slugCandidates: ["loire", "loire-vallei", "vallee-de-la-loire"],
    tours: [
      {
        title: "3-daagse: kastelen, champagne & Chablis (privé)",
        url: "https://www.getyourguide.com/chenonceaux/3-day-castles-champagne-chablis-wine-tasting-private-tour",
        duration: "Meerdaags (privé)",
        blurb: "Drie dagen, privé: kastelen langs de Loire, een stop in de Champagne-kelders, en tot slot Chablis — de meest noordelijke Bourgogne-appellatie, Chardonnay op Kimmeridgien-krijtbodem.",
      },
      {
        title: "Loire-wijngaarden dagtrip vanuit Tours",
        url: "https://www.getyourguide.com/tours-france/small-group-full-day-wine-trip-to-loire-valley-from-tours",
        duration: "Volledige dag (8 uur)",
        blurb: "Vanuit Tours de lokale routes rond Chinon in, weg van de massa. Kleine wijnhuizen, echte gesprekken.",
      },
      {
        title: "From Tours: Afternoon Loire Valley Wine Tour to Vouvray",
        url: "https://www.getyourguide.com/tours-france-l1320/from-tours-afternoon-loire-valley-wine-tour-to-vouvray-t62317/",
        duration: "4,5 uur",
        blurb: "Vouvray is de reden waarom de Loire meer is dan kastelen. Chenin Blanc op tuffsteen maakt hier iets dat nergens anders bestaat: een witte wijn die droog, demi-sec of mousseux uitkomt — afhankelijk van het jaar en de keuze van de wijnmaker. Dit namiddagsbezoek gaat naar twee producenten. Geen kastelen, geen toeristische afleiding, wel Chenin Blanc die laat zien waarom Martin de Loire serieus neemt.",
      },
    ],
  },
  {
    slugCandidates: ["champagne", "reims", "epernay", "champagne-france"],
    tours: [
      {
        title: "Full Day Pommery Small Group Tour",
        url: "https://www.getyourguide.com/reims-l365/easy-small-group-champagne-tour-t448850/",
        duration: "7 uur",
        blurb: "Pommery is de reden waarom de Champagne-streek niet reduceert tot een bubbel op een verjaardag. De crayères — Gallo-Romijnse krijtkamers, twintig meter onder de stad — reguleren temperatuur en vochtigheid zonder mechanische klimaatinstallatie; dat is geen verhaalsjee maar de verklaring voor de consistente stijl van het huis. Kleine groep, twee tastings, en genoeg tijd om het schaalverschil te begrijpen tussen de stapels kelderflessen en de fles die thuis opengaat bij een gewone donderdagavond.",
      },
      {
        title: "From Reims: Champagne Day Trip to 3 Family Domains & Lunch",
        url: "https://www.getyourguide.com/reims-l365/all-inclusive-small-group-day-tour-reims-epernay-t85284/",
        duration: "8 uur",
        blurb: "Drie familiedomeinen in de Marne-vallée, geen grote huizen. Pinot Meunier is hier de hoofddruif — de variëteit die grande marques gebruiken als blending-component maar die in de Marne-vallée op eigen kracht staat: fruitig, vroeger rijpend dan Pinot Noir, minder tannineus. Dit is de Champagne die het systeem je niet stuurt, maar die Martin graag heeft.",
      },
      {
        title: "Épernay: Mercier Champagne Cellar Visit with Tastings",
        url: "https://www.getyourguide.com/epernay-l35220/epernay-mercier-champagne-cellar-visit-with-tastings-t343901/",
        duration: "1,5 uur",
        blurb: "Mercier heeft de meest theatrale kelderlogistiek van de Avenue de Champagne: achttien kilometer tunnel, gebouwd door Eugène Mercier in de 19e eeuw, met een treintje erdoorheen dat toeristen nog altijd gebruikt. Een beetje flamboyant — maar het formaat dwingt respect af. De twee inbegrepen tastings (Brut en Blanc de Noirs) laten in negentig minuten zien wat het verschil is tussen een assemblage met alle drie de champagnedruiven en een cuvée zonder Chardonnay.",
      },
      {
        title: "From Reims/Épernay: The Connoisseurs Private Tour — 9 Tastings",
        url: "https://www.getyourguide.com/epernay-l35220/private-afternoon-tour-the-connoisseurs-with-9-tastings-t451012/",
        duration: "4 uur",
        blurb: "De Côte des Blancs is Chardonnay-territorium — niet als blendingcomponent maar als enige druif. Blanc de Blancs Champagne uit dit gebied smaakt anders dan elke andere methode traditionnelle: hogere zuurgraad, strakker schuim, rijpingspotentieel dat Pinot-blends niet halen. Negen tastings verspreid over de namiddag, vertrouwen als startpunt. Dit is de tour voor wie wil begrijpen waarom sommige Champagnes dertig jaar houdbaar zijn.",
      },
    ],
  },
];

async function resolveStreek(slugCandidates) {
  for (const slug of slugCandidates) {
    const res = await api("GET", `/items/streken?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id,slug,name&limit=1`);
    if (res.ok && res.data?.data?.length > 0) return res.data.data[0];
  }
  return null;
}

async function run() {
  console.log(`\nLAT-2252 seed (VOORSTEL): gyg_tours per streek`);
  console.log(`Target: ${DIRECTUS_URL}${DRY_RUN ? "  [DRY_RUN]" : ""}\n`);
  let seeded = 0, missing = 0;
  for (const entry of CURATION) {
    const streek = await resolveStreek(entry.slugCandidates);
    if (!streek) {
      console.log(`  - (${entry.slugCandidates[0]}) geen streek gevonden — overslaan`);
      missing++;
      continue;
    }
    process.stdout.write(`  + ${streek.name} (${streek.slug}): ${entry.tours.length} tours ... `);
    if (DRY_RUN) { console.log("dry-run"); seeded++; continue; }
    const res = await api("PATCH", `/items/streken/${streek.id}`, { gyg_tours: entry.tours });
    if (res.ok) { console.log("OK"); seeded++; }
    else { console.log(`FAIL (${res.status}): ${JSON.stringify(res.data).slice(0, 200)}`); }
  }
  console.log(`\nKlaar. ${seeded} streken geseed, ${missing} niet gevonden.`);
  console.log(`Let op: dit is een voorstel-curatie. Bevestig met de Lead Editor (AC #4) en`);
  console.log(`voeg curatie toe voor >=1 extra live streek om AC #1 (>=5 streken) te halen.`);
}

run().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
