# Preview-drafts how-to (LAT-1112 stap 1)

Marijn previewt Directus-drafts op `preview.vinomartino.com` voordat ze
live gaan op `vinomartino.com`. Productie blijft uitsluitend `published`.

## Wanneer gebruik je dit?

- Lead Editor (of een agent) zet een artikel/streek/wijnhuis/route op
  `status = draft` in Directus.
- Marijn wil de gerenderde pagina zien voordat hij `published` aanvinkt.

## Workflow (eenmaal per draft-batch)

1. **Maak/edit in Directus.** Zet `status` op `draft`, vul slug + content.
2. **Trigger preview-deploy** in GitHub Actions:
   - Repo → Actions → "Deploy VinoMartino" → Run workflow
   - Branch: `main` (of `preview`)
   - Target: `preview`
3. **Wacht ~3-5 min** tot de run groen is. Smoke-test verifieert
   automatisch dat `X-Robots-Tag: noindex` aanwezig is op de homepage.
4. **Open de draft-URL** in je browser:
   - Artikel: `https://preview.vinomartino.com/artikelen/{slug}/`
   - Streek: `https://preview.vinomartino.com/streken/{slug}/`
   - Wijnhuis: `https://preview.vinomartino.com/wijnhuizen/{slug}/`
   - Route: `https://preview.vinomartino.com/routes/{slug}/`
5. **Approve of revisie.** Zie LAT-1112 stap 2/3 voor de Telegram-flow
   (in ontwikkeling). Tot die er is: zet `status = published` handmatig in
   Directus en trigger een `production`-deploy.

## Acceptance-check (eenmalig, voor stap 1 sign-off)

```bash
# Headers: noindex moet erbij
curl -I https://preview.vinomartino.com/streken/test-preview/

# Visible content: confirm dat Astro daadwerkelijk de draft heeft gerenderd
# (niet een lege/cached/fallback-pagina). Vervang fragment door iets uit
# je draft (titel, body-zin).
curl -s https://preview.vinomartino.com/streken/test-preview/ \
  | grep -i "test-preview"

# Prod moet 404 geven zolang de draft niet gepromoveerd is
curl -I https://vinomartino.com/streken/test-preview/
```

## Hoe het werkt onder de motorkap

- Astro-loaders gebruiken `DIRECTUS_INCLUDE_DRAFTS` (zie
  `src/lib/directus-config.ts` — sinds LAT-1078). Bij `=1` wordt
  `filter[status][_in]=draft,published`; standaard alleen `published`.
- `deploy.yml` injecteert deze env-var alleen in de docker-build call
  wanneer `target=preview`. Productie krijgt hem niet.
- `nginx-preview.conf` voegt `X-Robots-Tag: noindex, nofollow` met
  `always` toe — dekt 2xx, 404, redirects.

## Beveiligingsmodel

Preview vertrouwt op `X-Robots-Tag: noindex, nofollow` + URL-obscurity
(preview.vinomartino.com is niet vanuit prod gelinkt). Akkoord van Marijn
en CEO voor MVP. **Trigger voor escalatie naar basic-auth (htpasswd-mount
zit al in `docker-compose.vinomartino-preview.yml`):**

- Preview-URL duikt op in een externe index (Google Search Console, Bing).
- Preview-URL wordt gedeeld buiten Marijn / het VinoMartino-team.
- Een draft lekt herleidbaar naar pers/partners voordat publish goedgekeurd is.

In één van die gevallen: zet `htpasswd auth_basic` aan in
`nginx-preview.conf` (1 regel) en deel creds via BWS. Backlog-ticket
bestaat hiervoor — niet wachten op een incident.

## Volgende stappen (out-of-scope voor stap 1)

- Stap 2/3: Telegram approve-flow via CoS approval-bridge.
- Stap 4: Automatische preview-rebuild bij Directus item-save
  (webhook + cron-fallback).
