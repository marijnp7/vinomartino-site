# VinoMartino — Project Brief

## Brand Strategy

VinoMartino (`vinomartino.com`) is a single-brand wine-travel content site.

### Multi-brand decision (2026-05)

The codebase originally supported multi-brand routing (`/{brand}/{locale}/`).
This was removed in LAT-799 + LAT-806:

- **Chosen path: separate domains per brand.** If a second brand launches, it gets
  its own domain, its own Astro build, and its own deploy pipeline.
- Routes live at the site root (`/`, `/artikelen/`, `/bestemmingen/`, etc.) — no
  brand or locale prefix in URLs.
- The `Brand` interface and static brand data remain in `src/lib/brands.ts` for
  theming (colors, fonts, content pillars). Layouts and components import the type.
- Nginx 301 redirects for legacy `/vinomartino/*` and `/nl/*` URLs remain in
  `nginx-prod.conf` for backwards-compat with external links and Google index.

### What to do when brand #2 launches

1. Fork the site repo (or create a second Astro project in a monorepo).
2. Configure the new brand's data in `src/lib/brands.ts`.
3. Deploy to its own domain with its own `BRAND` env var if needed.
4. Do **not** re-introduce `[brand]/[locale]/` dynamic routing — each brand is a
   standalone site with its own build.

## Tech Stack

- **Framework:** Astro (SSG)
- **CMS:** Directus (articles, regions, routes)
- **Hosting:** VPS via Docker + nginx reverse proxy
- **CI/CD:** GitHub Actions auto-deploy on push to main

## Content Structure

```
/                     Homepage
/artikelen/           Article listing
/artikelen/[slug]/    Individual articles
/bestemmingen/        Destination listing
/landen/              Country pages
/reisroutes/          Route/itinerary pages
/blog/                Blog posts
/over-ons/            About page
/privacy/             Privacy policy
/cookies/             Cookie policy
/affiliate-verklaring/ Affiliate disclosure
```
