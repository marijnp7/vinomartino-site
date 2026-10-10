import { loadArticles } from './articles';
import { loadStreken } from './streken';
import { loadRoutes } from './routes';
import { loadWijnhuizen } from './wijnhuizen';
import { bodyContentRefs, buildContentLinks, canonicalContentKey, contentKey, type ContentNode } from './content-links';
import type { Locale } from './i18n';

const cache = new Map<Locale, Promise<Map<string, ContentNode[]>>>();
export function loadContentLinks(locale: Locale): Promise<Map<string, ContentNode[]>> {
  const pending = cache.get(locale);
  if (pending) return pending;
  const result = Promise.all([loadArticles(locale), loadStreken(locale), loadRoutes(locale), loadWijnhuizen(locale)])
    .then(([articles, streken, routes, wijnhuizen]) => {
      const nodes: ContentNode[] = [
        ...articles.map(a => ({kind: 'artikelen' as const, slug: a.slug, name: a.title,
          regions: a.relatedStreken.map(r => r.slug), category: a.category,
          refs: [...bodyContentRefs(a.bodyHtml),
            ...a.relatedStreken.map(r => contentKey('streken', r.slug)),
            ...a.relatedWijnhuizen.map(r => contentKey('wijnhuizen', r.slug)),
            ...a.relatedWijnroutes.map(r => contentKey('wijnroutes', r.slug)),
            ...a.relatedArtikelen.map(r => contentKey('artikelen', r.slug)),
            ...a.meerOver.map(r => contentKey('artikelen', r.slug))]})),
        ...streken.map(s => ({kind: 'streken' as const, slug: s.slug, name: s.name,
          regions: [s.slug], country: s.landSlug,
          refs: [...bodyContentRefs(s.bodyHtml), ...s.relatedArticles.map(a => contentKey('artikelen', a.slug))]})),
        ...routes.map(r => ({kind: 'wijnroutes' as const, slug: r.slug, name: r.title,
          regions: r.streekSlug ? [r.streekSlug] : [],
          refs: [...bodyContentRefs(r.bodyHtml), ...r.relatedArticles.map(a => contentKey('artikelen', a.slug)),
            ...r.stopsGeo.filter(s => s.kind === 'wijnhuis' && s.slug).map(s => contentKey('wijnhuizen', s.slug!))]})),
        ...wijnhuizen.map(w => ({kind: 'wijnhuizen' as const, slug: w.slug, name: w.name,
          regions: w.streekSlug ? [w.streekSlug] : [],
          refs: [...bodyContentRefs(w.bodyHtml), ...w.relatedArticles.map(a => contentKey('artikelen', a.slug))]})),
      ];
      // Redirect aliases must share the keeper's links, not create duplicate cards.
      const canonical = (key: string) => canonicalContentKey(key, locale);
      return buildContentLinks(nodes
        .filter(n => canonical(contentKey(n.kind, n.slug)) === contentKey(n.kind, n.slug))
        .map(n => ({...n, refs: n.refs.map(canonical)})));
    });
  cache.set(locale, result);
  result.catch(() => cache.delete(locale));
  return result;
}
