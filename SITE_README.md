# Reisplatform — Astro Dev Preview

Multi-brand reisplatform met per-brand theming, i18n-ready routing en CSS custom properties.

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

1. Maak een nieuw `.md` bestand in `src/content/posts/`:
   ```bash
   touch src/content/posts/mijn-reis.md
   ```

2. Voeg frontmatter toe bovenaan:
   ```markdown
   ---
   title: "Titel van je post"
   date: 2026-04-20
   author: "Persona-naam"
   summary: "Korte samenvatting voor de homepage"
   ---

   Je content hier in markdown.
   ```

3. De dev-server herlaadt automatisch (hot-reload).

## Structuur

```
site/
  src/
    lib/
      brands.ts                 # Brand type + statische brand-data
      i18n.ts                   # Locale-configuratie
    layouts/
      BaseLayout.astro          # Basis-layout (umbrella homepage)
      BrandLayout.astro         # Brand-aware layout met CSS custom properties
    components/
      BrandHeader.astro         # Per-brand header (logo, nav, kleuren)
      BrandFooter.astro         # Per-brand footer (social, cross-brand strip)
      BrandHero.astro           # Per-brand hero section
      LanguageSwitcher.astro    # Taalkeuze (verborgen bij één taal)
    pages/
      index.astro               # Umbrella homepage
      [brand]/
        index.astro             # Redirect → /{brand}/{defaultLocale}/
        [locale]/
          index.astro           # Brand homepage
          sample-article.astro  # Voorbeeld-artikel voor theming-test
    content/posts/*.md          # Blog posts (markdown, umbrella)
  public/                       # Statische bestanden
  Dockerfile                    # Container definitie
  docker-compose.site.yml       # Compose config
```

## Multi-brand werking

Elke brand is een record in `src/lib/brands.ts` (later Directus). Een brand definieert:
- Slug (URL-pad), naam, tagline
- Kleurenpalet (primary, secondary, accent, text)
- Fonts (heading + body)
- Content pillars
- Actieve locales

### Nieuwe brand toevoegen

1. Voeg een record toe aan de `brands` array in `src/lib/brands.ts`
2. Zet `status: 'live'` en configureer minimaal slug, naam, kleuren en fonts
3. De route `/{slug}/{locale}/` is automatisch beschikbaar
4. Pas eventueel de sample-article aan voor brand-specifieke content

### URL-structuur

```
/                          → umbrella homepage
/{brand-slug}/             → 302 redirect naar /{brand-slug}/{defaultLocale}/
/{brand-slug}/{locale}/    → brand homepage
/{brand-slug}/{locale}/sample-article/ → voorbeeld-artikel
```

### CSS custom properties

BrandLayout injecteert automatisch:
- `--color-primary`, `--color-secondary`, `--color-accent`, `--color-text`
- `--font-heading`, `--font-body`

Alle brand-componenten gebruiken deze variabelen.

## Constraints

- Image < 500 MB, runtime < 256 MB RAM
- Container draait als `node` user (geen root)
- Geen secrets in repo — gebruik `.env` (niet committed)
- Raakt geen andere containers aan (paperclip-cos-*, paperclip-db-1, traefik-*)
