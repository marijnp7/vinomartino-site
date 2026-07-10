// LAT-2018 — Gecureerde GetYourGuide-tours per streek (parent LAT-1967).
//
// Marketing & Growth cureerde 9 Tier-1 tours (regio's die Marijn zelf reisde),
// copy in Martino-voice (kennis + sensueel + menselijk, geen superlatieven).
// Bron: LAT-1967-comments (2026-07-02). Copy-gate: Lead Editor LAT-1835.
//
// Deze module is de enige bron van waarheid voor de tour-content. De links
// worden pas op render-tijd gedecoreerd met partner_id (CRMZDZ6) + `cmp`-label
// via `decorateGyGTourUrl` (affiliate-regio.ts), zodat de affiliate-tracking en
// het `[type]-[regio]`-labelcontract centraal blijft (LAT-1676/1688).
//
// Sleutel = streek-slug (zoals in Directus/loadStreken). Streken zonder entry
// (bv. bourgogne/loire zolang die pagina's nog niet live zijn) renderen simpel
// niets — deploy-safe degradatie.

export interface GyGTour {
  /** Titel zoals getoond op de kaart. */
  title: string;
  /** Exacte, gecureerde GetYourGuide-tour-URL (deeplink, zonder tracking). */
  url: string;
  /** Duur/omvang, bv. '4–5 uur' of 'Meerdaags (privé)'. */
  duration: string;
  /** Korte Martino-voice omschrijving: waarom deze tour, wat je voelt/leert. */
  blurb: string;
}

// Regio-slug voor het affiliate-label (`tours-<regio>`), losgekoppeld van de
// streek-slug: meerdere streek-pagina's kunnen dezelfde regio-campagne delen.
export interface GyGRegionTours {
  /** Regio-fragment voor het `tours-<regio>`-trackinglabel (bv. 'piemonte'). */
  regioLabel: string;
  tours: GyGTour[];
}

// Streek-slug → gecureerde tours. Piemonte=`langhe`, Toscane=`toscane`.
// Bourgogne/Loire staan klaar zodra die streek-pagina's bestaan.
export const GYG_TOURS_BY_STREEK: Record<string, GyGRegionTours> = {
  langhe: {
    regioLabel: 'piemonte',
    tours: [
      {
        title: 'Barolo & Barbaresco-wijntour vanuit Alba',
        url: 'https://www.getyourguide.com/alba/barolo-barbaresco-wine-tour',
        duration: '4–5 uur',
        blurb:
          'Vanuit Alba liggen de kleine producenten van Monforte en Verduno op een halfuur rijden. Twee wijnhuizen op één dag — het terroir-verschil tussen Barolo en Barbaresco wordt in het glas zichtbaar, niet op een kaart.',
      },
      {
        title: 'Wijnmakerij-tour & proeverij Barolo en Barbaresco met lokaal eten',
        url: 'https://www.getyourguide.com/nl-nl/langhe/piemonte-wijnmakerij-tour-proef-barolo-barbaresco-lokaal-eten',
        duration: '2 uur',
        blurb:
          'Twee uur, gericht, midden in de Langhe (UNESCO-gebied). Geen stadsbezoek — de heuvels zijn het decor en de wijn geeft er uitleg bij.',
      },
      {
        title: 'Privétour: Piemonte-wijnproeverij in de Barolo-streek',
        url: 'https://www.getyourguide.com/turin/private-tour-piedmont-wine-tasting-of-the-barolo-region',
        duration: 'Flexibel (privé)',
        blurb:
          'Flexibel vertrek vanuit Turijn. Een kleine groep in de Barolo-heuvels, zonder vaste route — de namen op de flessen worden herkenbaar terrein.',
      },
    ],
  },
  toscane: {
    regioLabel: 'toscane',
    tours: [
      {
        title: 'Truffeljacht, lunch & wijnproeverij in San Miniato',
        url: 'https://www.getyourguide.com/florence/chianti-and-truffle-hunting-tour-in-san-miniato-tuscany',
        duration: '5–6 uur',
        blurb:
          'San Miniato staat bekend om zijn witte truffels (Tuber magnatum). In de bossen zoeken met een jager en zijn hond, de vondst in de handen, daarna bij de wijn — de volgorde maakt het verschil.',
      },
      {
        title: 'Toscaanse wijngaard-tour in een oude Jeep, met proeverij en lunch',
        url: 'https://www.getyourguide.com/tuscany/classic-tuscan-vineyard-old-jeep-tour-wine-tasting-lunch',
        duration: 'Halve dag',
        blurb:
          'Een open Jeep door de Toscaanse heuvels: het landschap op armslengte, niet achter glas. Proeverij en lunch tussen de wijnstokken, met terroir als tafelgesprek.',
      },
    ],
  },
  bourgogne: {
    regioLabel: 'bourgogne',
    tours: [
      {
        title: 'Bourgogne wijnhuis-tour van Dijon naar Beaune, met lunch',
        url: 'https://www.getyourguide.com/beaune/small-group-winery-tour-from-dijon-to-beaune-with-lunch',
        duration: 'Volledige dag (8 uur)',
        blurb:
          'De Côte d’Or in één dag: Côte de Nuits én Côte de Beaune, met Beaune als middengebied. De climats liggen naast elkaar — het verschil in bodem en helling wordt in het glas zichtbaar.',
      },
      {
        title: 'Bourgogne Grand Cru-proeverij vanuit Dijon',
        url: 'https://www.getyourguide.com/dijon/burgundy-wines-full-day-tasting-tour-from-dijon',
        duration: 'Volledige dag (10+ proeven)',
        blurb:
          'Gericht op de Grand Crus: mineraliteit en structuur die hun betekenis pas tonen wanneer ze naast elkaar zijn geproefd.',
      },
    ],
  },
  loire: {
    regioLabel: 'loire',
    tours: [
      {
        title: '3-daagse: kastelen, champagne & Chablis (privé)',
        url: 'https://www.getyourguide.com/chenonceaux/3-day-castles-champagne-chablis-wine-tasting-private-tour',
        duration: 'Meerdaags (privé)',
        blurb:
          'Drie dagen, privé: kastelen langs de Loire, een stop in de Champagne-kelders, en tot slot Chablis — de meest noordelijke Bourgogne-appellatie, Chardonnay op Kimmeridgien-krijtbodem.',
      },
      {
        title: 'Loire-wijngaarden dagtrip vanuit Tours',
        url: 'https://www.getyourguide.com/tours-france/small-group-full-day-wine-trip-to-loire-valley-from-tours',
        duration: 'Volledige dag (8 uur)',
        blurb:
          'Vanuit Tours de lokale routes rond Chinon in, weg van de massa. Kleine wijnhuizen, echte gesprekken.',
      },
    ],
  },
};

export function toursForStreek(slug: string): GyGRegionTours | null {
  return GYG_TOURS_BY_STREEK[slug] ?? null;
}
