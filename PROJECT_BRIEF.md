# VinoMartino — Project Brief

## Identity

vinomartino.com is a wine-niche content site — NOT a generic travel platform.
The site focuses on wine regions, wine producers, tasting notes, and wine-travel routes.

## Brand Strategy (2026-05)

### Single-brand, single-domain

- **vinomartino.com** is the only live brand. All routes live at the site root.
- No brand prefix (`/vinomartino/`) or locale prefix (`/nl/`) in URLs.
- The original multi-brand routing (`/[brand]/[locale]/`) and the generic
  Reisplatform architecture (countries, destinations, itineraries) have been
  fully removed (LAT-799 + LAT-806).

### Multi-brand future

If a second brand launches:
1. It gets its own domain, its own Astro build, and its own deploy pipeline.
2. Do **not** re-introduce `[brand]/[locale]/` dynamic routing.
3. A shared Reisplatform umbrella (if still desired) would be a separate repo
   on a different domain.

### Nginx backwards-compat

301 redirects in `nginx-prod.conf` for legacy paths:
- `/vinomartino/*` → `/`
- `/nl/*` → `/`
- `/landen/*` → `/`
- `/bestemmingen/*` → `/`

These catch Google-indexed URLs and external links. They cost nothing and should stay.

## Tech Stack

- **Framework:** Astro (SSG)
- **CMS:** Directus (articles via API, local file fallback)
- **Hosting:** VPS via Docker + nginx reverse proxy
- **CI/CD:** GitHub Actions auto-deploy on push to main

## Content Structure

```
/                         Homepage (wine-niche hero + recent articles)
/artikelen/               Article listing
/artikelen/[slug]/        Individual articles (wine regions, tasting notes, routes)
/over-ons/                About Martin & Sophie
/privacy/                 Privacy policy
/cookies/                 Cookie policy
/affiliate-verklaring/    Affiliate disclosure
```

## Brand Theming

Brand data in `src/lib/brands.ts` (interface + static array).
Layouts inject CSS custom properties: `--color-primary`, `--color-secondary`,
`--color-accent`, `--color-text`, `--font-heading`, `--font-body`.
