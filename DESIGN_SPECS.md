# VinoMartino — Design specs (LAT-856)

Bron: audit door Design Lead op 2026-05-05, plan in [LAT-856 plan-document](/LAT/issues/LAT-856#document-plan), goedgekeurd door CEO in [LAT-856 comment dd125c06](/LAT/issues/LAT-856#comment-dd125c06-a15b-466e-a8ee-023c9196c317).

Dit document beschrijft de design-specs voor de Tier 1 + Tier 2 acties uit dat plan. Bedoeld als referentie voor de child-tickets onder [LAT-854](/LAT/issues/LAT-854) — niet als blueprint die elke beslissing dichtschrijft.

## 1. Tokens — bron van waarheid

`src/styles/tokens.css` is de canonieke set. Elk nieuw of geherschreven onderdeel **moet** tokens gebruiken; geen hex-kleuren, font-stacks of pixel-spacing inline. Subset om in dit document op terug te vallen:

| Categorie | Token | Waarde |
| --- | --- | --- |
| Primary | `--burgundy` | `#5A1A1F` |
| Primary hover | `--burgundyDeep` | `#3D1115` |
| Accent | `--rust` | `#A14F2A` |
| Background | `--paper` | `#FAF5E9` |
| Background deep | `--paperDeep` | `#F0E6D0` |
| Text primary | `--ink` | `#1F1A16` |
| Text secondary | `--inkSoft` | `#5A4F45` |
| Text muted (let op contrast, zie §5) | `--inkFaint` | `#8A7E70` |
| Border | `--rule` | `#C9B98F` |
| Heading font | `--font-heading` | `Cormorant Garamond, EB Garamond, Georgia, serif` |
| Body font | `--font-body` | `Source Serif 4, Georgia, serif` |
| UI font | `--font-ui` | `Inter, system-ui, sans-serif` |
| Container | `--max-width` | `80rem` (1280 px) |
| Article body | `--article-body-max` | `40rem` (640 px) |
| Gutter | `--gutter` | `2rem` |

## 2. Homepage migratie naar SiteLayout (Tier 1, ticket #1)

**Probleem.** `src/pages/index.astro` heeft een eigen inline `<head>`, eigen inline `<style>`-blok met scope `j7pv25f6`, eigen header-markup (`header.site` + `head-inner`) en eigen footer (`footer.site` + `foot-nav`). Deze versie:

- gebruikt geen `tokens.css` — duplicate burgundy/paper-definities
- gebruikt geen `<SiteHeader>` / `<SiteFooter>` componenten
- heeft geen `@media`-queries → mobile breekt op < 600 px
- mist `og:*`, `twitter:*`, `<link rel=canonical>` en JSON-LD
- gebruikt `Cormorant Garamond, Inter` (smal subset) i.p.v. de volledige stack uit `SiteLayout`

**Oplossing.** Refactor `index.astro`:

1. `import SiteLayout from '../layouts/SiteLayout.astro'` toevoegen.
2. Hele `<html>…</html>` boilerplate vervangen door één `<SiteLayout title="VinoMartino — Wijnreizen met karakter" description="…" schema={[…]}>` wrapper.
3. Inline `<style>` schrappen. Sectie-styling verplaatsen naar `tokens.css`-gebaseerde scoped styles (`<style is:scoped>`) of, als de stijlen al elders bestaan voor `/wijnhuizen/` listings, hergebruiken.
4. Scoped styles moeten `--burgundy`, `--paper`, `--rust`, `--font-display` etc. consumeren — geen hex.
5. Schema toevoegen: `organizationSchema()` + `breadcrumbSchema([{name:'Home',url:'/'}])` (helpers zitten in `src/lib/seo.ts`, zie listing-pages voor het patroon).
6. **Hero:** behoudt huidige copy en CTA. Lettergrootte mag clamp() blijven, maar door de SiteLayout-stack krijgt de `<h1>` automatisch `--font-heading`.

**Acceptatie.**

- `curl -sI https://vinomartino.com/` toont na deploy `og:type`, `og:image`, `twitter:card`, `<link rel=canonical>`, `<script type=application/ld+json>`.
- Pagina rendert correct op 360 / 768 / 1280 / 1920 px (handmatige check via Chrome DevTools device-toolbar).
- Header van homepage gelijk aan header van `/artikelen/` (zelfde DOM-structuur, zelfde scoped CSS-id).
- `.head-inner` en `.foot-nav` referenties verdwijnen; `header.site-header` is overal hetzelfde.

**Niet doen.** Niet het hero-design opnieuw uitvinden — alleen de wrapper vervangen. Editorial copy blijft 1-op-1.

## 3. nginx 404-route (Tier 1, ticket #2)

**Probleem.** `https://vinomartino.com/this-page-does-not-exist` retourneert de nginx-default 404 (153 bytes, plain HTML). Repo heeft `src/pages/404.astro` die in de Astro-build als `dist/404.html` (of `dist/404/index.html`) terechtkomt, maar nginx serveert hem niet.

**Oplossing.** In `nginx-prod.conf` (en `nginx-preview.conf`) toevoegen of corrigeren:

```nginx
error_page 404 /404.html;

location = /404.html {
    internal;
    root /usr/share/nginx/html;   # of het pad waar Astro `dist/` staat
}
```

Pas `root` aan naar het pad dat in `Dockerfile` / compose wordt gemount.

**Acceptatie.**

- `curl -sI https://vinomartino.com/this-page-does-not-exist` retourneert `HTTP/2 404` met `content-length` ≥ ~3 kB (gerenderde Astro-page, niet 153 bytes).
- Visuele check: pagina toont SiteHeader + SiteFooter + merkidentiteit + zoek-/home-CTA.

## 4. Cover-images op listings + homepage cards (Tier 2, ticket #5)

**Bevinding na codecheck.** Loaders ondersteunen `heroImage` al (zie `src/lib/wijnhuizen.ts`, `routes.ts`, `streken.ts`). Listing-cards (`src/pages/wijnhuizen/index.astro` etc.) renderen `entry.heroImage` al conditioneel. Twee resterende gaps:

1. **Homepage-cards** voor wijnhuizen / wijnroutes / streken renderen `heroImage` **niet** — alleen de "Laatste verhalen"-sectie doet dat. `src/pages/index.astro` mist de `{w.heroImage && <img …>}` blokken in de drie bovenste secties.
2. **Data**: in productie levert Directus geen `hero_image` voor de live wijnhuizen / wijnroutes / streken (listing rendert 0 imgs). Lokale fallback-md-bestanden hebben evenmin `heroImage:` in de frontmatter.

**Oplossing.**

- **Code (CTO):** in `src/pages/index.astro` voor elke van de drie kaartblokken (wijnhuizen, routes, streken) hetzelfde patroon kopiëren als de articles-sectie:

  ```astro
  {entry.heroImage && (
    <img src={entry.heroImage} alt={entry.name ?? entry.title} loading="lazy" width="400" height="220" class="card-img" />
  )}
  ```

  Aspect-ratio: 400 × 220 (≈ 16:9). Object-fit cover. CSS `.card-img { display:block; width:100%; height:auto; aspect-ratio: 400 / 220; object-fit: cover; }`.

- **Data (Lead Editor + CTO):** Directus-records voor de huidige 3 wijnhuizen / 3 routes / 3 streken een `hero_image`-asset koppelen. Onderstaande mapping is aanbevolen op basis van de bestaande `public/images/`-set; CTO bepaalt of de assets als Directus-files worden geupload of als `heroImage:` in de fallback-md-bestanden komen.

### Asset-mapping-tabel (#5 bijlage)

**Bijgewerkt na audit [LAT-1069](/LAT/issues/LAT-1069) — 2026-05-30. Bijgewerkt na refinement [LAT-1070](/LAT/issues/LAT-1070) — 2026-05-30. Bijgewerkt met Unsplash-pass posts [LAT-1074](/LAT/issues/LAT-1074) — 2026-06-01.**

**Naamconventie:** `wijnhuis-{slug}-{id}.jpg` voor wijnhuizen (sfeerfoto's, niet-persoonsportretten), `portret-{slug}-{id}.jpg` gereserveerd voor toekomstige daadwerkelijke persoonsportretten (fotograaf-outreach v2.2), `landschap-{streek}-{id}.jpg` voor streken/routes.

| Type | Slug | Asset | Locatie | Bron |
| --- | --- | --- | --- | --- |
| wijnhuis | bartolo-mascarello-barolo | `wijnhuis-bartolo-mascarello-001.jpg` | `public/images/` | Unsplash / Alfonso Betancourt |
| wijnhuis | cornelissen-etna-sicilie | `wijnhuis-cornelissen-etna-001.jpg` | `public/images/` | Unsplash / Caitlyn Vermeij |
| wijnhuis | niepoort-douro-portugal | `wijnhuis-niepoort-douro-001.jpg` | `public/images/` | Unsplash / Eduardo Lages |
| wijnroute | etna-noord-randazzo-solicchiata | `landschap-etna-noord-001.jpg` | `public/images/` | Unsplash / Caitlyn Vermeij |
| wijnroute | mosel-bernkastel-traben-trarbach | `landschap-mosel-route-001.jpg` | `public/images/` | Unsplash / Chris Weiher |
| wijnroute | priorat-porrera-gratallops | `landschap-priorat-route-001.jpg` | `public/images/` | Unsplash / Ryleigh Henschen |
| streek | douro-portugal | `landschap-douro-001.jpg` | `public/images/` | Unsplash / Eduardo Lages |
| streek | langhe-piemonte | `landschap-langhe-001.jpg` | `public/images/` | Unsplash / Sebastian |
| streek | mosel-duitsland | `landschap-mosel-001.jpg` | `public/images/` | Unsplash / Marc-Philipp Esser |
| streek | ribeira-sacra-galicie | `landschap-ribeira-sacra-001.jpg` | `public/images/` | Unsplash / Alejandro Piñero Amerio |
| post | bourgogne-villages-zonder-grand-cru | `landschap-bourgogne-villages-001.jpg` | `public/images/` | Unsplash / Elodie Debard |
| post | jerez-sherry-wijnregio-reisverslag | `landschap-jerez-albariza-001.jpg` | `public/images/` | Unsplash / Chris Caines (Málaga) |
| post | occhipinti-wijnhuis-portret-vittoria | `wijnhuis-occhipinti-vittoria-001.jpg` | `public/images/` | Unsplash / Susana Bartolome |

Volledige creditering + fotograafslinks: zie `public/images/IMAGE_CREDITS.md`.

**Acceptatie.**

- `/`, `/wijnhuizen/`, `/wijnroutes/`, `/streken/` tonen op de getoonde 3 cards elk een hero-image (≥ 400 px breed).
- Alt-text strategie: zie §6.

## 5. Dubbele H1 weghalen (Tier 2, ticket #6)

**Probleem.** Detailpagina's renderen twee `<h1>`:

1. Pagina-H1 vanuit de layout/template (bijv. `<h1>Bartolo Mascarello</h1>` via `entry.name`).
2. Markdown-body-H1 (`# Bartolo Mascarello — de wijnmaker die nooit inbond`) bovenaan elk content-bestand.

Geldt voor `/artikelen/[slug]`, `/wijnhuizen/[slug]`, `/wijnroutes/[slug]`, `/streken/[slug]`.

**Beslissing.** **Pagina-H1 blijft bron van waarheid.** Reden: layout-H1 leest uit `name` / `title`-frontmatter (canoniek, ook gebruikt in OG-tags en breadcrumbs). Markdown-H1 is auteur-vrijheid en kan per bestand verschillen — risico op divergentie.

**Implementatie (CTO).** Twee opties, kies één:

- **A — markdown-pipeline:** in `src/lib/markdown.ts` (of waar markdown → html gebeurt) een rule toevoegen die de eerste `<h1>` van de gerenderde body strip't. Eenvoudig, geen schrijfwijzigingen nodig, behoudt bestaande content-bestanden.
- **B — content-update:** alle md-bestanden krijgen hun H1-regel verwijderd; de huidige H1-tekst migreert naar `subtitle:` of `lead:` frontmatter, wordt onder de pagina-H1 als kicker/lede getoond.

A is sneller en laag-risico. B levert meer redactionele controle maar raakt 9+ md-bestanden.

**Acceptatie.**

- `curl -s https://vinomartino.com/wijnhuizen/bartolo-mascarello-barolo/ | grep -c '<h1'` retourneert exact `1`.
- Idem voor 1 random artikel, 1 route, 1 streek.

## 6. Alt-text strategie

| Beeldtype | Alt-text formule | Voorbeeld |
| --- | --- | --- |
| Wijnhuis-portret | `{name} — {region}` | `"Bartolo Mascarello — Barolo, Langhe"` |
| Wijnroute hero | `{title}` (titels zijn al beschrijvend) | `"De noordflank van de Etna — van Randazzo naar Solicchiata"` |
| Streek hero | `{name}, {country}` | `"Langhe, Italië"` (let op: NL-spelling) |
| Artikel hero | `{title}` | `"Priorat: leisteen, oudhout en wijnen die niet om goedkeuring vragen"` |
| Inline content (toekomstig) | Beschrijvend, max ~12 woorden, zonder "afbeelding van …" prefix | `"Llicorella-leisteen op een hellingsterras in Gratallops"` |
| Logo | `"VinoMartino"` (text logo, alt op `<a class=logo>` niet nodig) | — |
| Decoratief | `alt=""` (en `role=presentation` als ze achtergrond zijn) | — |

Regels:
- Alt-text in **Nederlands** (site is NL).
- "Italië" en "Italia" beide acceptabel als landsnaam in copy, maar in alt-text **altijd Nederlands** voor consistentie met body.
- Geen punt aan het einde van alt-text.

## 7. OG-meta hardenen (Tier 2, ticket #10)

**Note:** als #1 (homepage migratie) klaar is, krijgt de homepage automatisch het OG-blok van `SiteLayout`. Dit ticket gaat over de **resterende** verfijning op `SiteLayout` zelf:

1. `og:type` moet variëren per page-type:
   - `website` voor `/`, `/artikelen/`, `/wijnhuizen/`, `/wijnroutes/`, `/streken/`, `/over-ons/`
   - `article` voor `/artikelen/[slug]`, `/wijnhuizen/[slug]`, `/wijnroutes/[slug]`, `/streken/[slug]`
   - voeg een prop `ogType?: 'website' | 'article'` toe aan `SiteLayout`, default `'website'`.
2. `og:image` moet **absolute URL** zijn:
   - Huidige `<meta property="og:image" content="/images/articles/abc.jpg">` faalt in Facebook/LinkedIn-cards.
   - Wrap met `new URL(ogImage, Astro.site).href` voor relative paths.
3. Voor article-type pagina's:
   - Voeg `<meta property="article:published_time" content={isoDate} />` toe.
   - Voeg `<meta property="article:author" content={author} />` toe.

**Acceptatie.** Run [Open Graph debugger](https://www.opengraph.xyz/) (of Facebook Sharing Debugger) tegen 1 detailpagina en 1 listing — krijgt een rich card met afbeelding.

## 8. BaseLayout uitfaseren (Tier 3, ticket #3 — geparkeerd tot na 2026-05-18)

Voor referentie zodra Tier 3 wordt opgepakt: `BaseLayout.astro` heeft eigen system-fonts, eigen burgundy `#5E1A1D` (afwijkt van token `--burgundy #5A1A1F`), eigen achtergrond `#fafafa`. `/privacy/`, `/cookies/`, `/affiliate-verklaring/` migreren naar `SiteLayout` met `activeNav={null}`. Mogelijk simpeler: een `LegalLayout` die `SiteLayout` wraps en een smallere typografische container forceert (`--max-width-narrow`).

## 9. Open vragen die deze specs niet beantwoorden

- **#7 Over-ons:** wachten op CEO-board-antwoord of Martin/Sophie reële personen zijn (zie [LAT-856 comment dd125c06](/LAT/issues/LAT-856#comment-dd125c06-a15b-466e-a8ee-023c9196c317)). Tot dan: tijdelijke gestileerde portretillustratie als interim. Aparte ticket bij Tier 3.
- **Contrast-audit:** `--inkFaint #8A7E70` op `--paper #FAF5E9` ligt vermoedelijk onder WCAG AA voor body-text. Audit met tooling (axe of WebAIM) als follow-up; dit doc geeft geen vervang-token.
- **Sticky header:** homepage heeft `position:sticky`; detailpagina's mogelijk niet. Pariteit verifiëren tijdens #1.
