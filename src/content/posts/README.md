# Seed-data — GEEN runtime fallback

> Bewust ontwerp sinds 2026-05-02 (LAT-799): deze markdown-files zijn **seed-data**, niet de runtime bron-of-truth.

## TL;DR

- **Runtime bron** = Directus (`src/lib/articles.ts` → `loadArticles()`)
- **Seed-data** = deze .md files, gebruikt door `directus/scripts/migrate-blog-posts.mjs`
- **Build faalt luid** als Directus down/leeg is. Geen silent fallback meer.

## Waarom geen runtime fallback?

Vóór 2026-05-02 viel `loadArticles()` stilletjes terug op deze .md files als Directus uitviel. Dat maskeerde elk Directus-probleem: build slaagde, deploy slaagde, smoke-test slaagde, maar de site liep desync met de canonical bron. Productie kon ongemerkt 0 artikelen tonen of een verouderde versie.

Vanaf LAT-799: `loadArticles()` gooit een Error bij elke storing (env-vars ontbreken, Directus unreachable, non-200 response, of `data.length === 0`). Build crasht → GHA-pipeline faalt → niets gaat live met onbekende staat.

## Hoe deze files gebruikt worden

1. **Migratie naar Directus** — run vanaf de Directus-host:
   ```
      DIRECTUS_URL=http://localhost:8055 \
         DIRECTUS_TOKEN=<admin-token> \
            node directus/scripts/migrate-blog-posts.mjs
               ```
                  Het script is idempotent (RECORD_NOT_UNIQUE = skip), dus veilig om opnieuw te draaien.

                  2. **Schema-bootstrap** — als Directus collecties nog niet bestaan, run eerst:
                     ```
                        DIRECTUS_URL=... DIRECTUS_TOKEN=... \
                           node directus/scripts/bootstrap-schema.mjs
                              ```

                              ## Toekomst

                              Na Content Writer-agent onboarding wordt deze map archief: agents publiceren direct naar Directus via API. Tot die tijd: bewerk hier, run migrate-script, zo komt de update in Directus terecht en de eerstvolgende Astro-rebuild op de site.

                              ## Niet doen

                              - Voeg geen runtime-import van deze map toe aan `articles.ts` of een andere `*.astro`. Single source of truth = Directus.
                              - Verwijder deze README niet zonder ook `articles.ts` te herzien — ze horen samen.
                              
