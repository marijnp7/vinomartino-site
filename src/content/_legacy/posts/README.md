# `_legacy/posts/` — archief, NIET in productie

> Status sinds 2026-06-01 (LAT-1078): deze map zat tot LAT-1078 onder
> `src/content/posts/`. De Astro-loader `loadArticles()` leest deze bestanden
> niet meer. Productie-content komt uitsluitend uit Directus.

Zie `src/content/_legacy/README.md` voor de volledige uitleg en de DAM → CMS → Site
hard rule. Bewerk hier niets met de bedoeling productie te wijzigen — wijzig
artikelen via Directus.

## Migratie-script (eenmalig, bij fresh Directus-bootstrap)

```
DIRECTUS_URL=http://localhost:8055 \
  DIRECTUS_TOKEN=<admin-token> \
  node directus/scripts/migrate-blog-posts.mjs
```

Het script is idempotent (RECORD_NOT_UNIQUE = skip) en wijst sinds LAT-1078
naar deze archief-map.
