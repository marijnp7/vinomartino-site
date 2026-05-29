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
    name: 'Martin',
    bio: "Martin reist zes tot acht lange weekenden per jaar op zoek naar wijnen die hij nog niet kent. Hij heeft een WSET Level 4 Diploma, woont in Amsterdam-centrum en bewaart zijn flessen in een koelkast die te klein is voor zijn ambities. Op VinoMartino schrijft hij over de plekken, wijnmakers en alinea's in zijn notitieboekje die hij eigenlijk voor zichzelf bewaart.",
    portrait: '/images/auteurs/martin.svg',
    portraitAlt: 'Martin, van achteren gefotografeerd, met een glas wijn in de hand',
    matches: ['martin'],
  },
  {
    slug: 'sophie',
    name: 'Sophie',
    bio: "Sophie reist mee — niet om notes te maken, maar om te proeven en te kijken. Haar smaak gaat naar oranje wijnen en Grüner Veltliner, haar ongeduld gaat naar proeverijen met te veel glazen en te weinig licht. Ze schrijft over wat ze onthoudt van een reis: een maaltijd, een gebaar, de wijn die ze voor zichzelf koos.",
    portrait: '/images/auteurs/sophie.svg',
    portraitAlt: 'Sophie, in zijaanzicht bij avondlicht, kijkend naar een glas oranje wijn',
    matches: ['sophie'],
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
