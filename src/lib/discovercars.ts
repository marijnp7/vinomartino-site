// LAT-12032 — DiscoverCars (autohuur) via Post Affiliate Pro. Affiliate-ID is publiek en
// bewust zonder achternaam. Fail-closed: een link bestaat alleen voor een slug in
// VERIFIED_DISCOVERCARS_DEST; slugs raden geeft 404 (bv. /italy/florence).
export const DISCOVERCARS_AFFILIATE_ID = 'vinomartino';

// Elk pad is op 2026-09-29 met curl op HTTP 200 geverifieerd (landing-page-generator-structuur).
export const VERIFIED_DISCOVERCARS_DEST: readonly string[] = [
  'south-africa/cape-town',
  'south-africa/cape-town/cpt',
  'italy-mainland/florence',
  'italy-mainland/florence/flr',
  'italy-mainland/pisa',
  'italy-mainland/pisa/psa',
];

export function discoverCarsDestVerified(dest: string | undefined): dest is string {
  return !!dest && VERIFIED_DISCOVERCARS_DEST.includes(dest.trim().replace(/^\/+|\/+$/g, ''));
}

/** Kanaal (`chan`) = zelfde SubID-conventie als CJ sid / TradeTracker r / GYG cmp. */
export function buildDiscoverCarsHref(dest: string, sid: string): string | null {
  if (!discoverCarsDestVerified(dest)) return null;
  const u = new URL(`https://www.discovercars.com/${dest.trim().replace(/^\/+|\/+$/g, '')}`);
  u.searchParams.set('a_aid', DISCOVERCARS_AFFILIATE_ID);
  u.searchParams.set('chan', sid.slice(0, 100));
  return u.toString();
}
