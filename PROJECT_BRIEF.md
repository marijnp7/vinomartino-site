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

## 3.0 — Bron-van-waarheid (DAM → CMS → Site, hard rule)

Sinds 2026-06-01 (LAT-1078) geldt deze keten zonder uitzondering:

1. **DAM** (`dam.vinomartino.com`, Directus Files) is de canonical bron voor
   alle assets: hero-images, OG-images, foto's bij wijnhuizen, alles wat
   binary is. Geen nieuwe assets onder `public/images/` zonder dat een
   matching record in de DAM bestaat.
2. **CMS** (Directus collections: articles, streken, wijnhuizen, wijnroutes,
   landen, nav_items) is de canonical bron voor alle tekst-content. Voeg of
   wijzig content **alleen** via de Directus UI of API.
3. **Site** (`vinomartino.com`, dit Astro-project) bouwt door DAM en CMS uit
   te lezen tijdens de GitHub Actions build. De build faalt luid wanneer
   `DIRECTUS_URL`/`DIRECTUS_TOKEN` ontbreken — er is geen markdown-fallback
   meer.

`src/content/` is sinds LAT-1078 leeg op `_legacy/` na. Die `_legacy/`-map
bevat de oorspronkelijke seed-markdown en wordt door geen enkele loader
runtime gelezen. Bewerk daar niets met de bedoeling productie te wijzigen —
edit Directus.

## Tech Stack

- **Framework:** Astro (SSG)
- **CMS:** Directus (articles via API; geen lokale fallback meer sinds LAT-1078)
- **DAM:** Directus Files via `dam.vinomartino.com` (Cloudflare-tunnel)
- **Hosting:** VPS via Docker + nginx reverse proxy
- **CI/CD:** GitHub Actions auto-deploy on push to main

## Content Structure

```
/                         Homepage (wine-niche hero + recent articles)
/artikelen/               Article listing
/artikelen/[slug]/        Individual articles (wine regions, tasting notes, routes)
/streken/[slug]/          Wijnstreken (Directus collection: streken)
/wijnhuizen/[slug]/       Wijnhuizen-portretten (Directus collection: wijnhuizen)
/wijnroutes/[slug]/       Wijnroutes (Directus collection: wijnroutes)
/landen/[slug]/           Landen-overzichten (Directus collection: landen)
/over-ons/                About Martin & Sophie
/privacy/                 Privacy policy
/cookies/                 Cookie policy
/affiliate-verklaring/    Affiliate disclosure
```

Alle `/{collection}/[slug]/` routes worden tijdens de build gegenereerd uit
Directus. Lege Directus-collectie → 0 pagina's. Geen lokale fallback.

## Brand Theming

Brand data in `src/lib/brands.ts` (interface + static array).
Layouts inject CSS custom properties: `--color-primary`, `--color-secondary`,
`--color-accent`, `--color-text`, `--font-heading`, `--font-body`.
