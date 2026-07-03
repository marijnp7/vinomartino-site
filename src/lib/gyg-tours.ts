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
          'Vanuit Alba dicht bij de kleine producenten van Monforte en Verduno. Twee wijnhuizen op één dag geven je de terroir-context die Barolo en Barbaresco van elkaar onderscheidt.',
      },
      {
        title: 'Wijnmakerij-tour & proeverij Barolo en Barbaresco met lokaal eten',
        url: 'https://www.getyourguide.com/nl-nl/langhe/piemonte-wijnmakerij-tour-proef-barolo-barbaresco-lokaal-eten',
        duration: '2 uur',
        blurb:
          'Kort en gericht, midden in de Langhe (UNESCO). De heuvels zelf zijn hier het verhaal, niet de stad — je proeft waar de druiven groeien.',
      },
      {
        title: 'Privétour: Piemonte-wijnproeverij in de Barolo-streek',
        url: 'https://www.getyourguide.com/turin/private-tour-piedmont-wine-tasting-of-the-barolo-region',
        duration: 'Flexibel (privé)',
        blurb:
          'Vertrek vanuit Turijn, je eigen tempo. Geschikt voor een klein gezelschap dat de Barolo-heuvels zonder haast wil leren kennen.',
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
          'San Miniato levert een groot deel van de wereldwitte truffels. Je loopt mee de bossen in, ruikt de vondst en proeft hem daarna bij de wijn — leerzaam en zintuiglijk tegelijk.',
      },
      {
        title: 'Toscaanse wijngaard-tour in een oude Jeep, met proeverij en lunch',
        url: 'https://www.getyourguide.com/tuscany/classic-tuscan-vineyard-old-jeep-tour-wine-tasting-lunch',
        duration: 'Halve dag',
        blurb:
          'De open Jeep maakt het verschil: je voelt het landschap in plaats van het door een busraam te zien. Wijn en lunch tussen de wijnstokken.',
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
          'De Côte d’Or in één dag: Côte de Nuits én Côte de Beaune, met Beaune als kloppend hart. De climats liggen naast elkaar; hier zie je waarom ze anders smaken.',
      },
      {
        title: 'Bourgogne Grand Cru-proeverij vanuit Dijon',
        url: 'https://www.getyourguide.com/dijon/burgundy-wines-full-day-tasting-tour-from-dijon',
        duration: 'Volledige dag (10+ proeven)',
        blurb:
          'Gericht op de Grand Crus: mineraliteit en structuur die je alleen begrijpt door ze naast elkaar te proeven.',
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
          'Chablis is de terroir-scharnier tussen Loire en Bourgogne. Drie dagen langs kastelen en kelders, in je eigen tempo.',
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
