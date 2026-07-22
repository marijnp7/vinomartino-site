// LAT-1406 — gedeelde tier-presentatie voor accommodaties. De curatieregel
// (HARD RULE, LAT-1404) kent elk verblijf één van drie tiers toe: budget
// (slim geboekt), prijs-kwaliteit en luxe (pure luxe). Het vocabulaire en de
// kleuren sluiten aan op de bestaande curated-kaart (CuratedStayMap.astro,
// LAT-1127) zodat de visuele taal site-breed gelijk is.

import type { StayTier } from './streken';

export type { StayTier };

export const STAY_TIER_ORDER: StayTier[] = ['slim_geboekt', 'prijs_kwaliteit', 'pure_luxe'];

// LAT-2003 (VIS-BL-04) — vaste disclosure-microcopy als voetregel onder elke
// boekbare accommodatie-kaart. Eén bron zodat de tekst site-breed letterlijk
// identiek is (streken, accommodaties, wijnroutes). Geen em-dash (huisregel).
export const STAY_DISCLOSURE_MICROCOPY =
  'Affiliate-link · als je hier boekt, kunnen wij een commissie ontvangen; jij betaalt niets extra.';

export const STAY_TIER_META: Record<StayTier, { label: string; color: string }> = {
  slim_geboekt: { label: 'Slim geboekt', color: '#A14F2A' },
  prijs_kwaliteit: { label: 'Prijs-kwaliteit', color: '#5C6B3F' },
  pure_luxe: { label: 'Pure luxe', color: '#5A1A1F' },
};

/**
 * Tolerante tier-parser voor de Directus-waarde. Anders dan de streken-variant
 * (LAT-1133, die naar slim_geboekt defaultet) geeft deze `null` terug bij een
 * lege/onbekende waarde, zodat de reisjunk-kaart dan simpelweg géén badge toont
 * i.p.v. een verkeerd tier te suggereren.
 */
export function normalizeStayTier(value: unknown): StayTier | null {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  if (!v) return null;
  if (v.includes('luxe') || v.includes('luxury') || v.includes('premium')) return 'pure_luxe';
  if (v.includes('kwaliteit') || v.includes('value') || v.includes('mid')) return 'prijs_kwaliteit';
  if (v.includes('budget') || v.includes('slim') || v.includes('geboekt') || v.includes('basic')) return 'slim_geboekt';
  if (v === 'slim_geboekt' || v === 'prijs_kwaliteit' || v === 'pure_luxe') return v;
  return null;
}
