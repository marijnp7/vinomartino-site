// LAT-1719 — interactieve Rhône-kaarten bij de twee Rhône-artikelen.
//
// Twee kaarten, beide via één Leaflet-component (RhoneMap.astro):
//   - Kaart A (route-artikel): routelijn Mâcon → Tain → Gigondas → Châteauneuf →
//     Aix met wijnhuizen, hotels en bezienswaardigheden als gecategoriseerde pins.
//   - Kaart B (benchmark-artikel): 10 appellaties noord → zuid, genummerd 1–10,
//     gekleurd per sub-regio (noord/zuid/Tavel) zodat de leerlijn zichtbaar is.
//
// De POI-coördinaten staan hier hardcoded (geen Directus-POI-collectie nodig).
// Plaatsing in het artikel gebeurt door splitBodyForRhoneMap() die de gerenderde
// bodyHtml op een vast anker splitst; [slug].astro rendert de kaart tussen de
// twee helften. Anker niet gevonden → kaart bovenaan i.p.v. stil verdwijnen.

export type RhonePoiKind = 'wijnhuis' | 'hotel' | 'bezienswaardigheid' | 'noord' | 'zuid' | 'tavel';

export interface RhonePoi {
  n: number;
  naam: string;
  lat: number;
  lng: number;
  kind: RhonePoiKind;
  detail?: string;
}

export interface RhoneKindMeta {
  kind: RhonePoiKind;
  label: string;
  color: string;
}

export interface RhoneMapConfig {
  variant: 'route' | 'benchmark';
  title: string;
  caption: string;
  pois: RhonePoi[];
  kindMeta: RhoneKindMeta[];
  routeLine?: [number, number][];
}

// VinoMartino-palet (tokens.css): burgundy #5A1A1F, rust #A14F2A, vine #5C6B3F.
const C_WIJNHUIS = '#5A1A1F';
const C_HOTEL = '#5C6B3F';
const C_ZICHT = '#A14F2A';

// --- Kaart A: route-artikel -------------------------------------------------
const ROUTE_POIS: RhonePoi[] = [
  // Wijnhuizen
  { n: 1, naam: "L'Atrium du Pouilly-Fuissé", lat: 46.2986, lng: 4.7156, kind: 'wijnhuis', detail: 'Solutré-Pouilly · walk-in' },
  { n: 2, naam: 'Cave de Tain', lat: 45.0689, lng: 4.8567, kind: 'wijnhuis', detail: "Tain-l'Hermitage · walk-in" },
  { n: 3, naam: 'Caveau du Gigondas', lat: 44.1033, lng: 5.0020, kind: 'wijnhuis', detail: 'Place Gabrielle Andéol, Gigondas · walk-in' },
  { n: 4, naam: 'Vinadea — Maison des Vins', lat: 44.0558, lng: 4.8320, kind: 'wijnhuis', detail: 'Châteauneuf-du-Pape · walk-in' },
  // Hotels
  { n: 5, naam: "Logis Hôtel l'Abricotine", lat: 45.0712, lng: 4.8462, kind: 'hotel', detail: "Tain-l'Hermitage" },
  { n: 6, naam: 'Hôtel Les Deux Coteaux', lat: 45.0672, lng: 4.8330, kind: 'hotel', detail: 'Tournon-sur-Rhône' },
  { n: 7, naam: 'Hôtel Les Florets', lat: 44.1225, lng: 5.0130, kind: 'hotel', detail: 'Gigondas' },
  // Bezienswaardigheden
  { n: 8, naam: 'Roche de Solutré', lat: 46.2983, lng: 4.7178, kind: 'bezienswaardigheid', detail: 'Solutré-Pouilly' },
  { n: 9, naam: "Temple d'Auguste et de Livie", lat: 45.5254, lng: 4.8741, kind: 'bezienswaardigheid', detail: 'Vienne' },
  { n: 10, naam: 'Palais des Papes & Pont Saint-Bénézet', lat: 43.9509, lng: 4.8076, kind: 'bezienswaardigheid', detail: 'Avignon' },
  { n: 11, naam: 'Cours Mirabeau', lat: 43.5283, lng: 5.4476, kind: 'bezienswaardigheid', detail: 'Aix-en-Provence' },
];

// Routelijn Mâcon → Tain → Gigondas → Châteauneuf → Aix (noord → zuid).
const ROUTE_LINE: [number, number][] = [
  [46.3069, 4.8287], // Mâcon
  [45.0689, 4.8567], // Tain-l'Hermitage
  [44.1031, 5.0019], // Gigondas
  [44.0561, 4.8324], // Châteauneuf-du-Pape
  [43.5297, 5.4474], // Aix-en-Provence
];

// --- Kaart B: benchmark-artikel ---------------------------------------------
// Pins op het geografische zwaartepunt van de appellatie (niet op het wijnhuis),
// zodat de noord→zuid-leerlijn klopt en gedeelde wijnhuizen (Cave de Tain voor
// 3/5/6) niet op elkaar stapelen. Wijnhuis staat in het popup-detail.
const BENCHMARK_POIS: RhonePoi[] = [
  { n: 1, naam: 'Côte-Rôtie', lat: 45.4944, lng: 4.8128, kind: 'noord', detail: 'Maison Guigal · Ampuis' },
  { n: 2, naam: 'Condrieu', lat: 45.4628, lng: 4.7686, kind: 'noord', detail: 'Domaine Georges Vernay · Condrieu' },
  { n: 3, naam: 'Saint-Joseph', lat: 45.0672, lng: 4.8290, kind: 'noord', detail: "Cave de Tain · Tain-l'Hermitage" },
  { n: 4, naam: 'Hermitage', lat: 45.0726, lng: 4.8560, kind: 'noord', detail: 'M. Chapoutier · Tain' },
  { n: 5, naam: 'Crozes-Hermitage', lat: 45.1010, lng: 4.8555, kind: 'noord', detail: "Cave de Tain · Tain-l'Hermitage" },
  { n: 6, naam: 'Cornas', lat: 44.9608, lng: 4.8597, kind: 'noord', detail: "Cave de Tain · Tain-l'Hermitage" },
  { n: 7, naam: 'Châteauneuf-du-Pape', lat: 44.0561, lng: 4.8324, kind: 'zuid', detail: 'Vinadea · Châteauneuf-du-Pape' },
  { n: 8, naam: 'Gigondas', lat: 44.1031, lng: 5.0019, kind: 'zuid', detail: 'Caveau du Gigondas' },
  { n: 9, naam: 'Vacqueyras', lat: 44.1397, lng: 4.9969, kind: 'zuid', detail: 'Caveau de Vacqueyras' },
  { n: 10, naam: 'Tavel', lat: 44.0131, lng: 4.6989, kind: 'tavel', detail: 'Cave des Vignerons de Tavel' },
];

export const RHONE_MAPS: Record<string, RhoneMapConfig> = {
  'van-macon-naar-aix-rhone-route': {
    variant: 'route',
    title: 'Van Mâcon naar Aix — de route',
    caption: 'De route in één oogopslag',
    pois: ROUTE_POIS,
    routeLine: ROUTE_LINE,
    kindMeta: [
      { kind: 'wijnhuis', label: 'Wijnhuis', color: C_WIJNHUIS },
      { kind: 'hotel', label: 'Hotel', color: C_HOTEL },
      { kind: 'bezienswaardigheid', label: 'Bezienswaardigheid', color: C_ZICHT },
    ],
  },
  '10-wijnhuizen-rhone-benchmark': {
    variant: 'benchmark',
    title: 'Tien appellaties, noord naar zuid',
    caption: 'De tien Rhône-appellaties op de kaart',
    pois: BENCHMARK_POIS,
    kindMeta: [
      { kind: 'noord', label: 'Noordelijke Rhône', color: C_WIJNHUIS },
      { kind: 'zuid', label: 'Zuidelijke Rhône', color: C_ZICHT },
      { kind: 'tavel', label: 'Tavel (rosé)', color: C_HOTEL },
    ],
  },
};

// Vaste ankers in de gerenderde bodyHtml (geverifieerd op prod, LAT-1719). De
// kaart komt ná de "in één oogopslag"-kop (route) resp. vóór de eerste
// inhoudskop (benchmark, d.w.z. direct onder de intro).
const SPLIT_ANCHORS: Record<string, { marker: string; place: 'after' | 'before' }> = {
  'van-macon-naar-aix-rhone-route': {
    marker: '<h2 id="de-route-in-een-oogopslag">De route in één oogopslag</h2>',
    place: 'after',
  },
  '10-wijnhuizen-rhone-benchmark': {
    marker: '<h2 id="de-structuur-van-de-rhone">',
    place: 'before',
  },
};

export interface RhoneBodySplit {
  before: string;
  after: string;
  config: RhoneMapConfig;
}

/**
 * Splits a Rhône-article bodyHtml at its fixed anchor so the map can be rendered
 * inline between the two halves. Returns null for non-Rhône articles. If the
 * anchor is missing (content changed), the map is placed at the top so it never
 * silently disappears.
 */
export function splitBodyForRhoneMap(bodyHtml: string, slug: string): RhoneBodySplit | null {
  const config = RHONE_MAPS[slug];
  const anchor = SPLIT_ANCHORS[slug];
  if (!config || !anchor) return null;

  const idx = bodyHtml.indexOf(anchor.marker);
  if (idx === -1) {
    return { before: '', after: bodyHtml, config };
  }
  const cut = anchor.place === 'after' ? idx + anchor.marker.length : idx;
  return {
    before: bodyHtml.slice(0, cut),
    after: bodyHtml.slice(cut),
    config,
  };
}
