// LAT-1406 QA — numerieke validatie van de 40-min-clustering met realistische
// Toscane-coordinaten. Geen visuele QA mogelijk (zie MEMORY: validate geometry
// numerically). Run: node --experimental-strip-types scripts/qa-cluster.ts
import { clusterKaarten, haversineKm } from '../src/lib/accommodatie-cluster.ts';
import type { AccommodatieKaart } from '../src/lib/accommodaties.ts';

function kaart(naam: string, plaats: string, tier: AccommodatieKaart['tier'], lat: number | null, lng: number | null): AccommodatieKaart {
  return { naam, slug: naam.toLowerCase().replace(/\s+/g, '-'), plaats, tier, lat, lng, beschrijving: '', foto: '/x.jpg' };
}

// Chianti-kern (Greve, Panzano, Castellina, Radda, Gaiole) — onderling ~10-25 km.
// Montalcino/Montepulciano liggen ~50-70 km zuidelijker → moet apart cluster zijn.
const toscane: AccommodatieKaart[] = [
  kaart('Villa Greve', 'Greve in Chianti', 'prijs_kwaliteit', 43.5836, 11.3158),
  kaart('Locanda Panzano', 'Panzano in Chianti', 'pure_luxe', 43.5446, 11.3094),
  kaart('Castellina Stay', 'Castellina in Chianti', 'slim_geboekt', 43.4682, 11.2837),
  kaart('Radda Rooms', 'Radda in Chianti', 'slim_geboekt', 43.4847, 11.3760),
  kaart('Gaiole Agriturismo', 'Gaiole in Chianti', 'prijs_kwaliteit', 43.4690, 11.4338),
  kaart('Brunello Resort', 'Montalcino', 'pure_luxe', 43.0570, 11.4894),
  kaart('Vino Nobile Inn', 'Montepulciano', 'slim_geboekt', 43.0975, 11.7807),
];

let failures = 0;
function assert(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`);
  if (!cond) failures++;
}

// Sanity op de haversine zelf.
const dGreveCastellina = haversineKm(43.5836, 11.3158, 43.4682, 11.2837);
assert(dGreveCastellina > 12 && dGreveCastellina < 16, `Greve↔Castellina ≈ ${dGreveCastellina.toFixed(1)} km (verwacht ~13)`);
const dCastellinaMontalcino = haversineKm(43.4682, 11.2837, 43.0570, 11.4894);
assert(dCastellinaMontalcino > 45, `Castellina↔Montalcino ≈ ${dCastellinaMontalcino.toFixed(1)} km (verwacht >45, dus aparte cluster)`);

const clusters = clusterKaarten(toscane, 'Toscane');
console.log('\nClusters:');
for (const c of clusters) {
  console.log(`  • ${c.titel} [${c.plaatsen.length} plaats(en), ${c.kaarten.length} kaart(en)] tiers=${c.kaarten.map(k => k.tier).join(',')}`);
}

// 1. Chianti-kern wordt één cluster met 5 verblijven over 5 plaatsen.
const chianti = clusters.find((c) => c.kaarten.some((k) => k.plaats === 'Greve in Chianti'));
assert(!!chianti && chianti.kaarten.length === 5, `Chianti-kern = 1 cluster van 5 verblijven (kreeg ${chianti?.kaarten.length})`);
assert(!!chianti && chianti.plaatsen.length === 5, `Chianti-cluster mengt 5 plaatsen (kreeg ${chianti?.plaatsen.length})`);

// 2. Montalcino & Montepulciano (>40 min van Chianti én ~30 km van elkaar) apart.
const montalcino = clusters.find((c) => c.kaarten.some((k) => k.plaats === 'Montalcino'));
assert(!!montalcino && !montalcino.kaarten.some((k) => k.plaats === 'Greve in Chianti'), 'Montalcino niet samengevoegd met Chianti');

// 3. Tier-volgorde binnen het Chianti-cluster: budget → prijs-kwaliteit → luxe.
const order = ['slim_geboekt', 'prijs_kwaliteit', 'pure_luxe'];
const tierSeq = (chianti?.kaarten ?? []).map((k) => order.indexOf(k.tier!));
const sorted = [...tierSeq].sort((a, b) => a - b);
assert(JSON.stringify(tierSeq) === JSON.stringify(sorted), `Kaarten gesorteerd op tier budget→luxe (kreeg ${tierSeq})`);

// 4. Fallback: zonder coordinaten groeperen per plaats, geen dataverlies.
const zonderCoords: AccommodatieKaart[] = [
  kaart('A', 'Lucca', null, null, null),
  kaart('B', 'Lucca', null, null, null),
  kaart('C', 'Pisa', null, null, null),
];
const fb = clusterKaarten(zonderCoords, 'Toscane');
const totaal = fb.reduce((n, c) => n + c.kaarten.length, 0);
assert(totaal === 3, `Fallback verliest geen kaarten (kreeg ${totaal}/3)`);
assert(fb.length === 2, `Fallback groepeert 2 plaatsen apart (kreeg ${fb.length})`);

// 5. Gemengd: sommige met, sommige zonder coordinaten — alles blijft behouden.
const mixed = [...toscane, kaart('Zonder Coord', 'Onbekend', null, null, null)];
const mixedClusters = clusterKaarten(mixed, 'Toscane');
const mixedTotal = mixedClusters.reduce((n, c) => n + c.kaarten.length, 0);
assert(mixedTotal === mixed.length, `Gemengd: alle ${mixed.length} kaarten behouden (kreeg ${mixedTotal})`);

// 6. LAT-1460 — Priorat (DOQ-kern) is compact: alle dorpen liggen binnen ~15 km,
//    dus de curated-stay-kaart moet exact 1 cluster tonen ("In en rond Priorat").
//    Coords = realistische dorpscoördinaten in de Priorat (Catalonië).
const priorat: AccommodatieKaart[] = [
  kaart('Cal Llop', 'Gratallops', 'prijs_kwaliteit', 41.2493, 0.7918),
  kaart('Hotel Priorat', 'Falset', 'slim_geboekt', 41.1456, 0.8193),
  kaart('Mas Ardevol', 'Porrera', 'prijs_kwaliteit', 41.1822, 0.8567),
  kaart('Lo Cigronet', 'Torroja del Priorat', 'slim_geboekt', 41.2181, 0.8232),
  kaart('Trossos del Priorat', 'La Vilella Baixa', 'pure_luxe', 41.2470, 0.7512),
  kaart('Cal Compte', 'Poboleda', 'pure_luxe', 41.2360, 0.8421),
];
const prioratClusters = clusterKaarten(priorat, 'Priorat');
assert(prioratClusters.length === 1, `Priorat = 1 cluster (kreeg ${prioratClusters.length})`);
assert(
  prioratClusters[0]?.kaarten.length === priorat.length,
  `Priorat-cluster bevat alle ${priorat.length} verblijven (kreeg ${prioratClusters[0]?.kaarten.length})`,
);
const prioratSeq = (prioratClusters[0]?.kaarten ?? []).map((k) => order.indexOf(k.tier!));
assert(
  JSON.stringify(prioratSeq) === JSON.stringify([...prioratSeq].sort((a, b) => a - b)),
  `Priorat tier-gesorteerd budget→luxe (kreeg ${prioratSeq})`,
);

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
