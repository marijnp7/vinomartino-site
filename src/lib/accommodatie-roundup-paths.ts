/**
 * LAT-2693 — gedeelde getStaticPaths-bouw voor de accommodatie-roundup per
 * streek (/accommodaties/<slug>/ en /en/accommodaties/<slug>/). De NL- en
 * EN-route delen deze logica zodat de padenset niet kan divergeren; alleen de
 * `locale` verschilt (EN-loaders passen de no-translation-guard toe). De
 * clustering/curatie-regels zijn identiek aan de NL-implementatie (LAT-1644).
 */
import { loadAccommodatieRoundupsByStreek } from './accommodaties-loader';
import { filterRoundupOpFotos, roundupKaartAantal, type AccommodatieRoundup } from './accommodaties';
import { loadStreken, type Streek } from './streken';
import { roundupFromCuratedStays } from './curated-stays';
import { DEFAULT_LOCALE, type Locale } from './i18n';

export interface AccommodatieRoundupPathProps {
  roundup: AccommodatieRoundup;
  streek: Streek | null;
  streekSlug: string;
}

export interface AccommodatieRoundupPath {
  params: { streek: string };
  props: AccommodatieRoundupPathProps;
}

export async function loadAccommodatieRoundupPaths(locale: Locale = DEFAULT_LOCALE): Promise<AccommodatieRoundupPath[]> {
  const [collectionRoundups, streken] = await Promise.all([
    loadAccommodatieRoundupsByStreek(locale),
    loadStreken(locale),
  ]);
  const streekBySlug = new Map(streken.map((s) => [s.slug, s]));
  const paths: AccommodatieRoundupPath[] = [];
  const seen = new Set<string>();

  // LAT-1644: de gecureerde streek-set (LAT-1133) is de enige bron die compleet
  // is (3+3+3) én lat/lng draagt, dus die voedt /accommodaties via dezelfde
  // 40-min-clustering als /streken. Zo is de cluster-layout identiek op beide
  // surfaces i.p.v. de oude, incomplete per-plaats-rijen uit de losse collectie.
  for (const streek of streken) {
    const roundup = roundupFromCuratedStays(streek);
    const aantal = roundup.clusters.reduce((n, c) => n + c.kaarten.length, 0);
    if (aantal === 0) continue;
    paths.push({ params: { streek: streek.slug }, props: { roundup, streek, streekSlug: streek.slug } });
    seen.add(streek.slug);
  }

  // Fallback: streken zónder gecureerde set vallen terug op de reisjunk-collectie.
  for (const [streekSlug, raw] of collectionRoundups) {
    if (seen.has(streekSlug)) continue;
    const roundup = filterRoundupOpFotos(raw);
    if (roundupKaartAantal(roundup) === 0) continue;
    paths.push({ params: { streek: streekSlug }, props: { roundup, streek: streekBySlug.get(streekSlug) ?? null, streekSlug } });
  }
  return paths;
}
