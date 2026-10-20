/** Published, locale-specific content network. All edges have CMS evidence. */
export type ContentKind = 'artikelen' | 'streken' | 'wijnroutes' | 'wijnhuizen';
export interface ContentNode {
  kind: ContentKind;
  slug: string;
  name: string;
  regions: string[];
  country?: string;
  category?: string;
  refs: string[];
}
export const contentKey = (kind: ContentKind, slug: string) => `${kind}/${slug}`;

/** Turn same-site detail hrefs into keys. External links and overview URLs are not relations. */
export function contentKeyFromHref(href: string): string | null {
  try {
    const url = new URL(href, 'https://vinomartino.com');
    if (!['vinomartino.com', 'www.vinomartino.com'].includes(url.hostname)) return null;
    const m = url.pathname.match(/^\/(?:en\/)?(artikelen|streken|wijnroutes|wijnhuizen)\/([^/]+)\/?$/);
    return m ? `${m[1]}/${decodeURIComponent(m[2])}` : null;
  } catch { return null; }
}

export function bodyContentRefs(html: string): string[] {
  return [...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)]
    .map(m => contentKeyFromHref(m[1])).filter((x): x is string => Boolean(x));
}

/** Symmetric edges; the supplied nodes are the exact pages generated for this locale. */
type Ref = {slug: string};
export interface ArticleLinkSource {slug: string; title: string; category?: string | null; bodyHtml: string;
  relatedStreken: Ref[]; relatedWijnhuizen: Ref[]; relatedWijnroutes: Ref[]; relatedArtikelen: Ref[]; meerOver: Ref[]}
/** Every CMS relation of an article becomes a ref — no display cap here (LAT-11584). */
export function articleContentNode(a: ArticleLinkSource): ContentNode {
  return {kind: 'artikelen', slug: a.slug, name: a.title, regions: a.relatedStreken.map(r => r.slug), category: a.category ?? undefined,
    refs: [...bodyContentRefs(a.bodyHtml),
      ...a.relatedStreken.map(r => contentKey('streken', r.slug)),
      ...a.relatedWijnhuizen.map(r => contentKey('wijnhuizen', r.slug)),
      ...a.relatedWijnroutes.map(r => contentKey('wijnroutes', r.slug)),
      ...a.relatedArtikelen.map(r => contentKey('artikelen', r.slug)),
      ...a.meerOver.map(r => contentKey('artikelen', r.slug))]};
}
export function buildContentLinks(nodes: ContentNode[]): Map<string, ContentNode[]> {
  const byKey = new Map(nodes.map(n => [contentKey(n.kind, n.slug), n]));
  const edges = new Map(nodes.map(n => [contentKey(n.kind, n.slug), new Map<string, number>()]));
  const connect = (a: string, b: string, score: number) => {
    if (a === b || !byKey.has(a) || !byKey.has(b)) return;
    for (const [from, to] of [[a, b], [b, a]]) {
      const links = edges.get(from)!;
      links.set(to, Math.max(score, links.get(to) ?? 0));
    }
  };
  const regions = new Map<string, string[]>();
  const countries = new Map<string, string[]>();
  const categories = new Map<string, string[]>();
  const append = (map: Map<string, string[]>, key: string, value: string) => {
    if (!key) return;
    map.set(key, [...(map.get(key) ?? []), value]);
  };
  for (const n of nodes) {
    const key = contentKey(n.kind, n.slug);
    for (const ref of n.refs) connect(key, ref, 100);
    for (const region of n.regions) {
      append(regions, region, key);
      connect(key, contentKey('streken', region), 90);
    }
    if (n.kind === 'streken' && n.country) append(countries, n.country, key);
    if (n.kind === 'artikelen' && n.category) append(categories, n.category, key);
  }
  // Editorial discovery, not a claim that a winery is a stop on every regional route.
  for (const keys of regions.values()) {
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) connect(keys[i], keys[j], 60);
  }
  // Regions with no own articles/routes remain reachable through their country peers.
  for (const keys of countries.values()) {
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) connect(keys[i], keys[j], 30);
  }
  // A small reciprocal reading chain for non-geographical essays, based on CMS category.
  for (const keys of categories.values()) {
    const sorted = [...keys].sort();
    for (let i = 0; i < sorted.length; i++) connect(sorted[i], sorted[(i + 1) % sorted.length], 20);
  }
  return new Map([...edges].map(([key, links]) => [key, [...links]
    .sort(([a, sa], [b, sb]) => sb - sa || byKey.get(a)!.name.localeCompare(byKey.get(b)!.name) || a.localeCompare(b))
    .map(([target]) => byKey.get(target)!)]));
}

/** Existing production redirects (nginx-prod.conf), not new content destinations. */
export function canonicalContentKey(key: string, locale: string): string {
  const aliases: Record<string, string> = {
    'artikelen/een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin': 'artikelen/een-week-in-piemonte',
    'artikelen/langhe-vier-dagen-route': 'artikelen/langhe-piemonte-4-dagen-route',
    'streken/douro': 'streken/douro-portugal',
    'streken/mosel': 'streken/mosel-duitsland',
  };
  if (locale === 'en' && key === 'artikelen/overnachten-langhe-barolo-agriturismi') return 'artikelen/waar-slapen-langhe-piemonte';
  return aliases[key] ?? key;
}

/**
 * LAT-13350: een gepubliceerd artikel waarvan de slug een productie-301 is naar
 * een ander, óók gepubliceerd artikel. Kaarten op zo'n slug linken via een
 * redirect; de bestemming staat al in dezelfde lijst, dus de kaart vervalt.
 */
export function isRedirectedArticleSlug(slug: string, locale: string, publishedSlugs: Set<string>): boolean {
  const key = `artikelen/${slug}`;
  const target = canonicalContentKey(key, locale);
  return target !== key && publishedSlugs.has(target.slice('artikelen/'.length));
}

/**
 * LAT-14369: krijgt het NL-artikel `slug` een hreflang-en? Alleen als de EN-slug
 * gepubliceerd is én geen productie-301 is naar een ander EN-artikel — anders
 * wijst hreflang naar een redirect en is de koppeling niet wederkerig.
 */
export function hasEnArticleAlternate(slug: string, enPublishedSlugs: Set<string>): boolean {
  return enPublishedSlugs.has(slug) && !isRedirectedArticleSlug(slug, 'en', enPublishedSlugs);
}
