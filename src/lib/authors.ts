export interface Author {
  slug: string;
  name: string;
  /** One-line positioning label shown under the name. */
  tagline?: string;
  /** Editorial role sub-heading, e.g. "Bijdragende redacteur: wijn en tafel". */
  role?: string;
  /** Bio paragraphs separated by a blank line (\n\n). */
  bio: string;
  /** Marijn only: list of travelled regions rendered as a list on the page. */
  regions?: readonly string[];
  /** Instagram handle including the leading @, e.g. "@vinomartino.travel". */
  instagramHandle?: string;
  portrait: string | null;
  portraitAlt: string;
  matches: readonly string[];
}

export const AUTHORS: readonly Author[] = [
  {
    slug: 'marijn',
    name: 'Marijn',
    tagline: 'Wijnreiziger. Amsterdam.',
    bio:
      "Marijn is de schrijver achter VinoMartino. Hij reist zes tot acht keer per jaar naar wijnregio's door Europa, altijd rechtstreeks naar de bron: bij de wijnmaker zelf, met een afspraak die hij twee weken van tevoren heeft gemaakt en een notitieboekje dat zelden ver weg is.\n\n" +
      "Jaren van gestructureerd proeven en aantekeningen geven hem de achtergrond om te proeven. Zijn oogmerk is schrijven, niet scoren. Een fles van €18 op een winterterras in Verona kan hem even enthousiast maken als een premier cru, zolang de context klopt.\n\n" +
      "Internationale wijnmakers noemen hem Martino, een bijnaam die bleef hangen en de merknaam werd. Thuis heet hij gewoon Marijn, en woont hij in Amsterdam met zijn vriendin Sophie en een wijnkoelkast voor tachtig flessen die zelden vol staat.",
    regions: [
      'Piemonte: Barolo, Barbaresco, Roero',
      'Toscane: Bolgheri, Montalcino, Carmignano, Val di Cornia',
      'Bourgogne',
      'Mosel en Pfalz',
      'Priorat en Montsant',
      'Etna',
      'Champagne (grower-producenten)',
      'Wachau en Burgenland',
      'Douro en Lisboa',
    ],
    instagramHandle: '@vinomartino.travel',
    portrait: '/images/auteurs/marijn.svg',
    portraitAlt: 'Marijn, schrijver van VinoMartino',
    matches: ['martin', 'marijn', 'martino'],
  },
  {
    slug: 'lea',
    name: 'Léa Marchand-Verhoeven',
    tagline: 'Loire, Champagne, Jura. Sommelier. Brussel.',
    role: 'Bijdragende redacteur: wijn en tafel',
    bio:
      "Léa Marchand-Verhoeven werkte zeven jaar als sommelier in Michelin-sterrenrestaurants in Parijs en Brussel. Nu schrijft ze als freelance culinair adviseur. Haar vertrekpunt is altijd het eten: de wijn volgt het gerecht, nooit andersom.\n\n" +
      "Ze schrijft voor VinoMartino over Loire, Champagne, Jura en Alsace, met bijzondere aandacht voor grower-producenten en de ongeschreven regels op goede wijnlijsten.",
    portrait: null,
    portraitAlt: '',
    matches: ['léa marchand-verhoeven', 'lea marchand-verhoeven', 'léa', 'lea'],
  },
  {
    slug: 'hugo',
    name: 'Hugo Verlinden',
    tagline: 'Bourgogne, Bordeaux, Riesling. Importeur (gepensioneerd). Maastricht.',
    role: 'Bijdragende redacteur: verticale proeverijen en jaargangstudie',
    bio:
      "Hugo Verlinden was achttien jaar wijnimporteur vanuit Maastricht, gespecialiseerd in Bourgogne en Duitsland. Hij stopte vervroegd en schrijft nu, zoals hij het zelf omschrijft, als obsessie. Zijn meest waardevolle gereedschap is het aantekeningenarchief dat hij al jarenlang bijhoudt.\n\n" +
      "Voor VinoMartino schrijft hij over verticale proeverijen, jaargangvariatie en wat er verandert als een wijnhuis van de ene naar de andere generatie overgaat.",
    portrait: '/images/auteurs/hugo.svg',
    portraitAlt: 'Hugo, silhouet in een schemerige kelder met een fles wijn',
    matches: ['hugo verlinden', 'hugo'],
  },
  {
    slug: 'robin',
    name: 'Robin de Wilde',
    tagline: "Natuur-wijn, Georgië, Etna. Zelfgeleerd. Zonder vaste woonplaats.",
    role: "Bijdragende redacteur: natuur-wijn en opkomende regio's",
    bio:
      "Robin de Wilde heeft geen diploma en geen vaste woonplaats. Hij werkte in een wijngaard in Georgië, een bottleshop in Brooklyn en een wijnbar in Berlijn. Momenteel woont hij in Amsterdam. Volgende maand: onbekend.\n\n" +
      "Hij schrijft voor VinoMartino over qvevri-fermentatie, natuur-wijn, Georgië, Slovenië en de micro-producenten op de Etna die niet in de standaard reisgidsen staan.",
    portrait: null,
    portraitAlt: '',
    matches: ['robin de wilde', 'robin'],
  },
  {
    slug: 'mira',
    name: 'Mira Adler',
    tagline: 'Wachau, Toscane, Centraal-Europa. Kunsthistorica. Wenen en Panzano.',
    role: 'Bijdragende redacteur: wijn en cultuurgeschiedkundige context',
    bio:
      "Mira Adler is kunsthistorica, gepromoveerd in Wenen. Ze woont een half jaar in de stad en een half jaar in Panzano in Chianti, waar haar man Giacomo wijn maakt. Dat laatste is geen toeval en ook niet de enige reden waarom ze schrijft.\n\n" +
      "Voor VinoMartino verbindt ze wijn met architectuur, cultuurgeschiedkundige context en de traagheid van plaatsen die hun karakter over eeuwen hebben opgebouwd. Haar specialisatie: Wachau, Burgenland, Friuli, Tokaj en Toscane.",
    portrait: null,
    portraitAlt: '',
    matches: ['mira adler', 'mira'],
  },
  {
    slug: 'charly',
    name: 'Charlotte van Doorn',
    tagline: 'Loire, Provence, slow travel. Uitgeefster (gepensioneerd). Utrecht.',
    role: 'Bijdragende redacteur: slow travel en boutique-verblijven',
    bio:
      "Charly van Doorn was 25 jaar uitgeefster van Nederlandse lifestylebladen. Ze is gestopt, maar dat woord vindt ze niet op zichzelf van toepassing. Ze reist vier tot vijf keer per jaar, altijd langer dan de meeste mensen, altijd met een goede boektip en een betere hotelkamer.\n\n" +
      "Voor VinoMartino schrijft ze over reizen waarbij het verblijf en de wijn even zwaar wegen als de bestemming zelf. Loire, Provence, Languedoc. Ze plant alles van tevoren en raadt haar lezers aan hetzelfde te doen.",
    portrait: '/images/auteurs/charly.svg',
    portraitAlt: 'Charly, silhouet op een terras bij avondlicht met een glas wijn in de hand',
    matches: ['charlotte van doorn', 'charlotte', 'charly'],
  },
  {
    slug: 'tomas',
    name: 'Tomás Ferreira-de Souza',
    tagline: "Portugal, Etna, Atlantische regio's. Geofysicus (omgeschoold). Porto.",
    role: 'Bijdragende redacteur: geologie en vulkanisch terroir',
    bio:
      "Tomás Ferreira-de Souza was geofysicus, opgeleid in Porto en aan de TU Delft. Vijf jaar geleden bracht een Vinho Verde hem op andere gedachten. Hij schrijft sindsdien over wijn vanuit aardwetenschappelijk perspectief: bodemlaag, erosie, hoogte boven zeeniveau en wat gesteente doet met smaak.\n\n" +
      "Voor VinoMartino schrijft hij over Portugal, Etna, de Canarische Eilanden, de Açores en Engeland. Hij begint altijd bij de grond onder de stokken.",
    portrait: null,
    portraitAlt: '',
    matches: ['tomás ferreira-de souza', 'tomas ferreira-de souza', 'tomás', 'tomas'],
  },
  {
    slug: 'sophie',
    name: 'Sophie',
    bio:
      "Sophie reist mee: niet om notes te maken, maar om te proeven en te kijken. Haar smaak gaat naar oranje wijnen en Grüner Veltliner, haar ongeduld gaat naar proeverijen met te veel glazen en te weinig licht. Ze schrijft over wat ze onthoudt van een reis: een maaltijd, een gebaar, de wijn die ze voor zichzelf koos.",
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

/** Paragraphs of a bio, split on blank lines. */
export function bioParagraphs(bio: string): string[] {
  return bio.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}
