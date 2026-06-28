export interface Author {
  slug: string;
  name: string;
  bio: string;
  portrait: string | null;
  portraitAlt: string;
  matches: readonly string[];
}

export const AUTHORS: readonly Author[] = [
  {
    slug: 'martin',
    name: 'Marijn',
    bio: "Marijn, internationaal ook wel Martino genoemd, reist zes tot acht lange weekenden per jaar op zoek naar wijnen die hij nog niet kent. Hij bewaart zijn flessen in een koelkast die te klein is voor zijn ambities. Op VinoMartino schrijft hij over de plekken, wijnmakers en alinea's in zijn notitieboekje die hij eigenlijk voor zichzelf bewaart.",
    portrait: '/images/auteurs/martin.svg',
    portraitAlt: 'Marijn, van achteren gefotografeerd, met een glas wijn in de hand',
    matches: ['martin', 'marijn', 'martino'],
  },
  {
    slug: 'sophie',
    name: 'Sophie',
    bio: "Sophie reist mee — niet om notes te maken, maar om te proeven en te kijken. Haar smaak gaat naar oranje wijnen en Grüner Veltliner, haar ongeduld gaat naar proeverijen met te veel glazen en te weinig licht. Ze schrijft over wat ze onthoudt van een reis: een maaltijd, een gebaar, de wijn die ze voor zichzelf koos.",
    portrait: '/images/auteurs/sophie.svg',
    portraitAlt: 'Sophie, in zijaanzicht bij avondlicht, kijkend naar een glas oranje wijn',
    matches: ['sophie'],
  },
  {
    slug: 'charly',
    name: 'Charlotte van Doorn',
    bio: "Charlotte — Charly voor wie haar kent — reisde 25 jaar lang voor Nederlandse lifestylebladen en stopte met het woord 'gepensioneerd' nog voordat ze het op zichzelf kon plakken. Ze reist nu vier, vijf keer per jaar, altijd langzamer en langer dan de rest, en kiest haar verblijven met de zekerheid van iemand die weet dat een brede badkuip meer zegt dan een sterrenrating. Op VinoMartino schrijft ze over slow stays, vrouwelijke wijnmakers en de logistiek die een reis moeiteloos maakt voor wie hetzelfde wil doen.",
    portrait: '/images/auteurs/charly.svg',
    portraitAlt: 'Charly, silhouet op een terras bij avondlicht met een glas wijn in de hand',
    matches: ['charlotte van doorn', 'charlotte', 'charly'],
  },
  {
    slug: 'hugo',
    name: 'Hugo Verlinden',
    bio: "Hugo importeerde achttien jaar lang wijn voor de Benelux voordat hij vervroegd stopte en het schrijven tot obsessie maakte. Met een WSET Diploma en een kelder vol aantekeningen — datum, temperatuur, luchtdruk — proeft hij het liefst verticaal: dezelfde wijn over de jaargangen heen, vroeger naast nu. Op VinoMartino schrijft hij over Bourgogne, Bordeaux en Riesling met het geduld van iemand die weet dat de beste flessen nog tien jaar nodig hebben voor ze zeggen wat ze te zeggen hebben.",
    portrait: '/images/auteurs/hugo.svg',
    portraitAlt: 'Hugo, silhouet in een schemerige kelder met een fles wijn',
    matches: ['hugo verlinden', 'hugo'],
  },
];

export function getAuthorBySlug(slug: string): Author | null {
  return AUTHORS.find((a) => a.slug === slug) ?? null;
}

export function getAuthorByByline(byline: string | null | undefined): Author | null {
  if (!byline) return null;
  const lower = byline.toLowerCase();
  for (const author of AUTHORS) {
    for (const candidate of author.matches) {
      if (lower === candidate || lower.includes(candidate)) return author;
    }
  }
  return null;
}
