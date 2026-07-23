export interface Author {
  slug: string;
  name: string;
  /** One-line positioning label shown under the name. */
  tagline?: string;
  /** EN tagline, used on /en/ pages via `taglineEn ?? tagline`. */
  taglineEn?: string;
  /** Editorial role sub-heading, e.g. "Bijdragende redacteur: wijn en tafel". */
  role?: string;
  /** EN role, used on /en/ pages via `roleEn ?? role`. */
  roleEn?: string;
  /** Bio paragraphs separated by a blank line (\n\n). */
  bio: string;
  /** EN bio, used on /en/ pages via `bioEn ?? bio`. Same paragraph split as `bio`. */
  bioEn?: string;
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
    taglineEn: 'Wine traveller. Amsterdam.',
    bio:
      "Marijn is de schrijver achter VinoMartino. Hij reist zes tot acht keer per jaar naar wijnregio's door Europa, altijd rechtstreeks naar de bron: bij de wijnmaker zelf, met een afspraak die hij twee weken van tevoren heeft gemaakt en een notitieboekje dat zelden ver weg is.\n\n" +
      "Jaren van gestructureerd proeven en aantekeningen geven hem de achtergrond om te proeven. Zijn oogmerk is schrijven, niet scoren. Een fles van €18 op een winterterras in Verona kan hem even enthousiast maken als een premier cru, zolang de context klopt.\n\n" +
      "Internationale wijnmakers noemen hem Martino, een bijnaam die bleef hangen en de merknaam werd. Thuis heet hij gewoon Marijn, en woont hij in Amsterdam met zijn vriendin Sophie en een wijnkoelkast voor tachtig flessen die zelden vol staat.",
    bioEn:
      "Marijn is the writer behind VinoMartino. He travels six to eight times a year to wine regions across Europe, always straight to the source: visiting the winemaker directly, with an appointment made two weeks in advance and a notebook that is rarely out of reach.\n\n" +
      "Years of structured tasting and note-taking give him the background to taste with precision. His aim is to write, not to score. An eighteen-euro bottle on a winter terrace in Verona can excite him as much as a premier cru, as long as the context is right.\n\n" +
      "International winemakers call him Martino, a nickname that stuck and became the brand name. At home he goes by Marijn, and lives in Amsterdam with his girlfriend Sophie and a wine fridge for eighty bottles that is rarely full.",
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
    taglineEn: 'Loire, Champagne, Jura. Sommelier. Brussels.',
    role: 'Bijdragende redacteur: wijn en tafel',
    roleEn: 'Contributing editor: wine and food',
    bio:
      "Léa Marchand-Verhoeven werkte zeven jaar als sommelier in Michelin-sterrenrestaurants in Parijs en Brussel. Nu schrijft ze als freelance culinair adviseur. Haar vertrekpunt is altijd het eten: de wijn volgt het gerecht, nooit andersom.\n\n" +
      "Ze schrijft voor VinoMartino over Loire, Champagne, Jura en Alsace, met bijzondere aandacht voor grower-producenten en de ongeschreven regels op goede wijnlijsten.",
    bioEn:
      "Léa Marchand-Verhoeven spent seven years as a sommelier in Michelin-starred restaurants in Paris and Brussels. She now works as a freelance culinary consultant and writer. Her starting point is always the food: wine follows the dish, never the other way around.\n\n" +
      "She writes for VinoMartino on Loire, Champagne, Jura and Alsace, with particular attention to grower-producers and the unwritten rules of good wine lists.",
    portrait: '/images/auteurs/lea.svg',
    portraitAlt: 'Léa, silhouet bij kaarslicht met een tastevin in de hand',
    matches: ['léa marchand-verhoeven', 'lea marchand-verhoeven', 'léa', 'lea'],
  },
  {
    slug: 'hugo',
    name: 'Hugo Verlinden',
    tagline: 'Bourgogne, Bordeaux, Riesling. Importeur (gepensioneerd). Maastricht.',
    taglineEn: 'Burgundy, Bordeaux, Riesling. Importer (retired). Maastricht.',
    role: 'Bijdragende redacteur: verticale proeverijen en jaargangstudie',
    roleEn: 'Contributing editor: vertical tastings and vintage study',
    bio:
      "Hugo Verlinden was achttien jaar wijnimporteur vanuit Maastricht, gespecialiseerd in Bourgogne en Duitsland. Hij stopte vervroegd en schrijft nu, zoals hij het zelf omschrijft, als obsessie. Zijn meest waardevolle gereedschap is het aantekeningenarchief dat hij al jarenlang bijhoudt.\n\n" +
      "Voor VinoMartino schrijft hij over verticale proeverijen, jaargangvariatie en wat er verandert als een wijnhuis van de ene naar de andere generatie overgaat.",
    bioEn:
      "Hugo Verlinden spent eighteen years as a wine importer from Maastricht, specialising in Burgundy and Germany. He retired early and writes now, as he puts it himself, out of obsession. His most valuable tool is the archive of tasting notes he has been building for decades.\n\n" +
      "For VinoMartino he writes about vertical tastings, vintage variation and what changes when a wine estate passes from one generation to the next.",
    portrait: '/images/auteurs/hugo.svg',
    portraitAlt: 'Hugo, silhouet in een schemerige kelder met een fles wijn',
    matches: ['hugo verlinden', 'hugo'],
  },
  {
    slug: 'robin',
    name: 'Robin de Wilde',
    tagline: "Natuur-wijn, Georgië, Etna. Zelfgeleerd. Zonder vaste woonplaats.",
    taglineEn: "Natural wine, Georgia, Etna. Self-taught. No fixed address.",
    role: "Bijdragende redacteur: natuur-wijn en opkomende regio's",
    roleEn: "Contributing editor: natural wine and emerging regions",
    bio:
      "Robin de Wilde heeft geen diploma en geen vaste woonplaats. Hij werkte in een wijngaard in Georgië, een bottleshop in Brooklyn en een wijnbar in Berlijn. Momenteel woont hij in Amsterdam. Volgende maand: onbekend.\n\n" +
      "Hij schrijft voor VinoMartino over qvevri-fermentatie, natuur-wijn, Georgië, Slovenië en de micro-producenten op de Etna die niet in de standaard reisgidsen staan.",
    bioEn:
      "Robin de Wilde has no diploma and no fixed address. He has worked in a vineyard in Georgia, a bottle shop in Brooklyn and a wine bar in Berlin. He is currently in Amsterdam. Next month: unknown.\n\n" +
      "He writes for VinoMartino on qvevri fermentation, natural wine, Georgia, Slovenia and the micro-producers on Etna that do not appear in the standard travel guides.",
    portrait: '/images/auteurs/robin.svg',
    portraitAlt: 'Robin, silhouet buiten bij een qvevri met een fles natuur-wijn',
    matches: ['robin de wilde', 'robin'],
  },
  {
    slug: 'mira',
    name: 'Mira Adler',
    tagline: 'Wachau, Toscane, Centraal-Europa. Kunsthistorica. Wenen en Panzano.',
    taglineEn: 'Wachau, Tuscany, Central Europe. Art historian. Vienna and Panzano.',
    role: 'Bijdragende redacteur: wijn en cultuurgeschiedkundige context',
    roleEn: 'Contributing editor: wine and cultural-historical context',
    bio:
      "Mira Adler is kunsthistorica, gepromoveerd in Wenen. Ze woont een half jaar in de stad en een half jaar in Panzano in Chianti, waar haar man Giacomo wijn maakt. Dat laatste is geen toeval en ook niet de enige reden waarom ze schrijft.\n\n" +
      "Voor VinoMartino verbindt ze wijn met architectuur, cultuurgeschiedkundige context en de traagheid van plaatsen die hun karakter over eeuwen hebben opgebouwd. Haar specialisatie: Wachau, Burgenland, Friuli, Tokaj en Toscane.",
    bioEn:
      "Mira Adler is an art historian with a doctorate from Vienna. She divides her time between the city and Panzano in Chianti, where her husband Giacomo makes wine. The latter is not a coincidence and not the only reason she writes.\n\n" +
      "For VinoMartino she connects wine with architecture, cultural-historical context and the slowness of places that have built their character over centuries. Her specialities: Wachau, Burgenland, Friuli, Tokaj and Tuscany.",
    portrait: '/images/auteurs/mira.svg',
    portraitAlt: 'Mira, silhouet voor een gewelfde doorgang met een glas wijn',
    matches: ['mira adler', 'mira'],
  },
  {
    slug: 'charly',
    name: 'Charlotte van Doorn',
    tagline: 'Loire, Provence, slow travel. Uitgeefster (gepensioneerd). Utrecht.',
    taglineEn: 'Loire, Provence, slow travel. Editor (retired). Utrecht.',
    role: 'Bijdragende redacteur: slow travel en boutique-verblijven',
    roleEn: 'Contributing editor: slow travel and boutique stays',
    bio:
      "Charly van Doorn was 25 jaar uitgeefster van Nederlandse lifestylebladen. Ze is gestopt, maar dat woord vindt ze niet op zichzelf van toepassing. Ze reist vier tot vijf keer per jaar, altijd langer dan de meeste mensen, altijd met een goede boektip en een betere hotelkamer.\n\n" +
      "Voor VinoMartino schrijft ze over reizen waarbij het verblijf en de wijn even zwaar wegen als de bestemming zelf. Loire, Provence, Languedoc. Ze plant alles van tevoren en raadt haar lezers aan hetzelfde te doen.",
    bioEn:
      "Charly van Doorn spent 25 years as the editor of Dutch lifestyle magazines. She has stopped, though she finds that word does not quite apply to herself. She travels four to five times a year, always longer than most people, always with a good book recommendation and a better hotel room.\n\n" +
      "For VinoMartino she writes about trips where the place to stay and the wine weigh as heavily as the destination itself. Loire, Provence, Languedoc. She plans everything in advance and advises her readers to do the same.",
    portrait: '/images/auteurs/charly.svg',
    portraitAlt: 'Charly, silhouet op een terras bij avondlicht met een glas wijn in de hand',
    matches: ['charlotte van doorn', 'charlotte', 'charly'],
  },
  {
    slug: 'tomas',
    name: 'Tomás Ferreira-de Souza',
    tagline: "Portugal, Etna, Atlantische regio's. Geofysicus (omgeschoold). Porto.",
    taglineEn: "Portugal, Etna, Atlantic regions. Geophysicist (retrained). Porto.",
    role: 'Bijdragende redacteur: geologie en vulkanisch terroir',
    roleEn: 'Contributing editor: geology and volcanic terroir',
    bio:
      "Tomás Ferreira-de Souza was geofysicus, opgeleid in Porto en aan de TU Delft. Vijf jaar geleden bracht een Vinho Verde hem op andere gedachten. Hij schrijft sindsdien over wijn vanuit aardwetenschappelijk perspectief: bodemlaag, erosie, hoogte boven zeeniveau en wat gesteente doet met smaak.\n\n" +
      "Voor VinoMartino schrijft hij over Portugal, Etna, de Canarische Eilanden, de Açores en Engeland. Hij begint altijd bij de grond onder de stokken.",
    bioEn:
      "Tomás Ferreira-de Souza was a geophysicist, trained in Porto and at Delft University of Technology. Five years ago a Vinho Verde gave him second thoughts. He has been writing about wine from an earth science perspective ever since: soil layer, erosion, altitude above sea level and what bedrock does to flavour.\n\n" +
      "For VinoMartino he writes on Portugal, Etna, the Canary Islands, the Azores and England. He always starts with the ground beneath the vines.",
    portrait: '/images/auteurs/tomas.svg',
    portraitAlt: 'Tomás, silhouet op een vulkanische helling, kijkend naar de bodem',
    matches: ['tomás ferreira-de souza', 'tomas ferreira-de souza', 'tomás', 'tomas'],
  },
  {
    slug: 'sophie',
    name: 'Sophie',
    bio:
      "Sophie reist mee: niet om notes te maken, maar om te proeven en te kijken. Haar smaak gaat naar oranje wijnen en Grüner Veltliner, haar ongeduld gaat naar proeverijen met te veel glazen en te weinig licht. Ze schrijft over wat ze onthoudt van een reis: een maaltijd, een gebaar, de wijn die ze voor zichzelf koos.",
    bioEn:
      "Sophie travels along: not to take notes, but to taste and observe. Her taste runs to orange wines and Grüner Veltliner, her impatience runs to tastings with too many glasses and too little light. She writes about what she remembers from a trip: a meal, a gesture, the wine she chose for herself.",
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
