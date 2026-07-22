/**
 * Centrale bron voor de publieke kanaal-URLs van VinoMartino.
 *
 * Reden (LAT-2266): de Instagram-URL stond hardcoded in SiteFooter.astro en
 * daarnaast als env-var op /de-brief/, wat drift opleverde. Substack zat achter
 * een lege env-var (LAT-1631: "bewust verborgen" zolang het kanaal nog niet
 * bestond).
 *
 * Substack is live sinds 2026-07-16 (vinomartino.substack.com, geverifieerd
 * 200 OK), dus de default is nu gevuld. Env-override blijft mogelijk voor
 * preview-/testbuilds; een expliciet lege env-var betekent nog steeds
 * "verberg dit kanaal", zodat het zonder code-wijziging uit kan.
 *
 * Rolverdeling (besluit Marijn 2026-07-17): MailerLite = funnel (primaire CTA
 * "De brief"), Substack = discovery/tweede lijn. Substack krijgt dus een
 * footer-link en een vermelding, geen eigen aanmeldformulier.
 */

function resolve(envValue: string | undefined, fallback: string): string {
  // Onderscheid tussen "niet gezet" (gebruik fallback) en "expliciet leeg"
  // (kanaal bewust verbergen).
  if (envValue === undefined) return fallback;
  return envValue.trim();
}

export const INSTAGRAM_URL = resolve(
  import.meta.env.PUBLIC_INSTAGRAM_URL,
  'https://www.instagram.com/vinomartino.travel/',
);

export const INSTAGRAM_HANDLE = '@vinomartino.travel';

export const SUBSTACK_URL = resolve(
  import.meta.env.PUBLIC_SUBSTACK_URL,
  'https://vinomartino.substack.com/',
);
