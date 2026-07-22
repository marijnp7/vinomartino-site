# `src/content/_legacy/` — gearchiveerde seed-data, NIET gebruikt op productie

> Status sinds 2026-06-01 (LAT-1078): deze map bevat de oorspronkelijke markdown
> seed-files die in de begintijd van VinoMartino de canonical content vormden.
> Sinds Directus de bron-van-waarheid is geworden, leest geen enkele Astro-loader
> deze bestanden meer.

## Hard rule: DAM → CMS → Site

1. **DAM** (`dam.vinomartino.com`) is de bron voor assets (foto's, OG-images).
2. **CMS** (Directus) is de bron voor alle tekst-content (artikelen, streken,
   wijnhuizen, wijnroutes, landen). Voeg of wijzig content alleen via Directus.
3. **Site** (`vinomartino.com`) bouwt door Directus uit te lezen tijdens de
   GitHub Actions build. Geen lokale markdown-fallback meer.

## Waarom een archief in plaats van rm -rf?

- Sommige seed-files bevatten body-tekst die nog niet 1-op-1 in Directus staat
  (vb. de originele etna-Nerello-paragrafen). Archief blijft als referentie en
  als input voor het migratie-script (`directus/scripts/migrate-blog-posts.mjs`).
- Git-history vertelt al het verhaal, maar een levend archief in de repo is
  goedkoper te raadplegen dan `git log -p`.

## Wat NIET doen

- **Niet editen** alsof het productie-content is. Wijzigingen hier hebben nul
  effect op `vinomartino.com`. Editen via Directus.
- **Niet importen** vanuit `src/lib/*.ts`. De loaders mogen alleen Directus
  uitlezen.
- **Niet verwijderen zonder Marijn te raadplegen** — het migratie-script en de
  seed-content-bodies-tool werken nog tegen deze paden.

## Wat WEL kan

- Lezen voor referentie ("hoe was de eerste versie van het Etna-stuk?").
- Hergebruiken in het migratie-script bij een fresh Directus-bootstrap:
  ```
  DIRECTUS_URL=http://localhost:8055 DIRECTUS_TOKEN=<admin-token> \
    node directus/scripts/migrate-blog-posts.mjs
  ```
  Het script wijst nu naar `src/content/_legacy/posts/`.

## Audit per collection (2026-06-01)

Zie LAT-1078 voor de volledige audit-tabel. Korte samenvatting:

- **posts** — 12 markdown-files, 14 artikelen live op Directus. 2 overlap
  (`etna-wijnreis-drie-dagen-vulkaan`, `fun-vs-fine-serieuze-wijnkennis-pet-nat`); de overige
  10 markdown-slugs zijn vervangen door nieuwere Directus-artikelen met andere
  slugs.
- **streken** — 4 markdown, 4 op Directus. 3 overlap. `ribeira-sacra-galicie.md`
  is markdown-only; `champagne` is Directus-only.
- **wijnhuizen** — 3 markdown, 3 op Directus. 3/3 overlap.
- **wijnroutes** — 3 markdown, 3 op Directus. 3/3 overlap.
- **landen** — 2 markdown (italie, spanje), 6 op Directus. 2/2 overlap; de
  overige 4 (duitsland, frankrijk, oostenrijk, portugal) zijn Directus-only.
