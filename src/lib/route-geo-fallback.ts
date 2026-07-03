import type { RouteStopGeo } from './routes';

// LAT-1997 — code-side coördinaten-fallback voor de geografische routekaart
// (RouteGeoMap). De kaart is het kernonderdeel van de route-ervaring, maar rendert
// alleen bij ≥2 stops mét coördinaten. Routes waarvan de Directus-velden
// `stops_geo`/`stops` (nog) leeg zijn, tonen daardoor géén kaart.
//
// Deze tabel levert town-niveau coördinaten per route-slug zodat élke route een
// echte kaart heeft, ook zonder CMS-data. Directus `stops_geo` heeft ALTIJD
// voorrang (zie routes.ts): zodra de redactie de stops in Directus cureert,
// overschrijft dat deze fallback zonder codewijziging. Coördinaten zijn afgeleid
// uit de route-tekst (dorpen/steden op de as), niet van specifieke wijnhuizen.
export const ROUTE_GEO_FALLBACK: Record<string, RouteStopGeo[]> = {
    // Côte des Bar (Aube, zuidelijke Champagne): Troyes als toegangspoort, dan de
    // N→Z-as door de Aubische wijndorpen tot Les Riceys (zuidelijkste Champagnegemeente).
    'champagne-aube': [
        { naam: 'Troyes', lat: 48.2973, lng: 4.0744 },
        { naam: 'Bar-sur-Seine', lat: 48.0561, lng: 4.3711 },
        { naam: 'Celles-sur-Ource', lat: 48.0339, lng: 4.3997 },
        { naam: 'Buxeuil', lat: 48.0139, lng: 4.3903 },
        { naam: 'Les Riceys', lat: 47.9928, lng: 4.3669 },
    ],
    // Kaapse wijnroute: Kaapstad → binnenland-appellaties → over de bergpas naar de
    // koele Hemel-en-Aarde-vallei bij Hermanus.
    'kaap-wijnroute': [
        { naam: 'Kaapstad', lat: -33.9249, lng: 18.4241 },
        { naam: 'Stellenbosch', lat: -33.9321, lng: 18.8602 },
        { naam: 'Paarl', lat: -33.7342, lng: 18.9621 },
        { naam: 'Franschhoek', lat: -33.9119, lng: 19.1226 },
        { naam: 'Hemel-en-Aarde', lat: -34.3900, lng: 19.1900 },
    ],
};

export function fallbackStopsGeo(slug: string): RouteStopGeo[] {
    return ROUTE_GEO_FALLBACK[slug] ?? [];
}
