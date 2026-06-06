# VinoMartino — Astro Site

Single-brand wijnreizen-site met per-brand theming via CSS custom properties.

## Lokaal starten (zonder Docker)

```bash
cd site/
npm install
npm run dev
# Open http://localhost:4321
```

## Deployen naar VPS

1. **SSH naar de VPS** en navigeer naar de Paperclip-repo:
   ```bash
   cd /root/paperclip
   ```

2. **Bouw en start de container:**
   ```bash
   cd site/
   docker compose -f docker-compose.site.yml up -d --build
   ```

3. **Controleer:**
   ```bash
   docker ps | grep paperclip-site
   curl -s http://localhost:3101 | head -20
   ```

4. **Open via Mission Control** (optie 3) op `http://localhost:3101`.

## Een post toevoegen

Productie-content (artikelen, streken, wijnhuizen, wijnroutes, landen) leeft
in Directus, niet in de repo. Bewerk via de Directus UI; de eerstvolgende
Astro-build pakt de wijziging op.

Zie `PROJECT_BRIEF.md` § 3.0 — DAM → CMS → Site is de hard rule. Markdown onder
`src/content/_legacy/` is archief en wordt sinds LAT-1078 nergens runtime
gelezen.

## Structuur

```
site/
  src/
    lib/
      brands.ts                 # Brand type + statische brand-data
      articles.ts               # Article loading (Directus-only sinds LAT-1078)
    layouts/
      SiteLayout.astro          # Hoofd-layout met header/footer
      BaseLayout.astro          # Minimal layout (juridische pagina's)
      BrandLayout.astro         # Brand-aware layout met CSS custom properties
    components/
      SiteHeader.astro          # Header (VinoMartino logo, nav)
      SiteFooter.astro          # Footer (nav, juridisch, affiliate)
      BrandHeader.astro         # Per-brand header
      BrandFooter.astro         # Per-brand footer
      BrandHero.astro           # Hero section
    pages/
      index.astro               # Homepage (wijn-niche)
      artikelen/                # Artikelen (listing + detail)
      over-ons.astro            # Over VinoMartino
      privacy.astro             # Privacybeleid
      cookies.astro             # Cookieverklaring
      affiliate-verklaring.astro # Affiliate-verklaring
    content/_legacy/            # Gearchiveerde seed-markdown (LAT-1078, NIET runtime)
  public/                       # Statische bestanden
  Dockerfile                    # Container definitie
  docker-compose.site.yml       # Compose config
```

## Brand theming

Brand-data staat in `src/lib/brands.ts`. BrandLayout injecteert CSS custom properties:
- `--color-primary`, `--color-secondary`, `--color-accent`, `--color-text`
- `--font-heading`, `--font-body`

Zie `PROJECT_BRIEF.md` voor de multi-brand strategie.

## Constraints

- Image < 500 MB, runtime < 256 MB RAM
- Container draait als `node` user (geen root)
- Geen secrets in repo — gebruik `.env` (niet committed)
- Raakt geen andere containers aan (paperclip-cos-*, paperclip-db-1, traefik-*)
