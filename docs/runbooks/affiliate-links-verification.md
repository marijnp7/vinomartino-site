# Runbook — Affiliate-links verifiëren (LAT-2531)

## Harde regel

**Een affiliate-link verifieer je in een browser, nooit met curl. "Rendert" is
niet "werkt".**

De link in de gerenderde HTML zeggen dat hij "live geverifieerd" is, is géén
bewijs. Twee keer in vijf dagen ging een affiliate-integratie live met links die
niets deden:

- [LAT-2251](/LAT/issues/LAT-2251) (10-07): Booking-deeplinks misten de
  CJ-wrapper → 0 attributie / 0 commissie.
- [LAT-2529](/LAT/issues/LAT-2529) (15-07): alle 12 GetYourGuide-tourlinks stuk —
  7x harde 404 (verzonnen pad zonder tour-id), 5x soft-redirect naar de generieke
  zoekpagina `/s?...` ondanks HTTP 200.

Beide keren betekende "live geverifieerd op prod" in de praktijk *"de link staat
in de HTML"* in plaats van *"de link komt ergens zinvols aan"*.

## Waarom curl niet volstaat

- **GetYourGuide geeft `403` op elke curl-request**, ongeacht User-Agent. Een
  curl-check levert dus een vals-negatief — precies waarom LAT-2252 doorglipte.
- Een **soft-redirect** naar een zoek-/fallbackpagina geeft HTTP `200`. Alleen op
  de status kijken mist die volledig. Je moet de *eindbestemming* beoordelen
  (tourpagina vs. `/s?...`-zoeklijst).

Gebruik dus een echte (headless) browser en beoordeel waar je landt.

## Geautomatiseerde vangnetten

### 1. Build-blokkerende vormguard (deterministisch, offline)

`scripts/check-affiliate-links.mjs` draait in de bouwketen (`deploy.yml`, ná
`astro build`) over `dist/**/*.html` en laat de build **rood** vallen op:

- GYG-tour-deeplink zonder canonieke tour-id `-t<cijfers>` → verzonnen pad → 404.
- GYG-link zonder `partner_id=CRMZDZ6` / `cmp=` (of verkeerd partner_id).
- Directe `booking.com`-deeplink met `aid`/`label` die niet door het CJ-klikdomein
  (`kqzyfj.com` e.d.) loopt → LAT-2251-regressie.
- Awin-link met placeholder-affiliate-id.

Nieuwe partner (Sunny Cars, Stay22, …) = één regel in `AFFILIATE_RULES`.

Regressietests: `npm run test:affiliate-links` (`node --test`, zonder netwerk).
Handmatig scannen: `npm run check:affiliate-links` (of `DIST_DIR=… node
scripts/check-affiliate-links.mjs`).

### 2. Live eindbestemmings-check (soft-redirect + catalogus-drift)

De vormguard kan **niet** vaststellen dat een geldig-gevormde tour ná merge uit
de catalogus verdween en nu 200-maar-soft-redirect naar `/s?...` geeft. Dat
vereist een echte headless browser en hoort in een **niet-blokkerende nightly**
(los van het bouwpad, zodat een flaky externe host de deploy niet vals-rood
maakt).

Geïmplementeerd in [LAT-2532](/LAT/issues/LAT-2532):

- Workflow `.github/workflows/affiliate-links-nightly.yml` — **GitHub-hosted**
  (niet de VPS: die kan Directus wél bereiken maar heeft geen browser; GHA kan
  Directus niet bereiken, dus checken we de **live prod-site**). Draait elke
  nacht 03:15 UTC + `workflow_dispatch`.
- Script `scripts/check-affiliate-links-live.mjs` — crawlt `sitemap.xml`,
  verzamelt alle affiliate-links (gedeelde `collectAffiliateUrls`, zelfde
  host-detectie als de offline guard), opent elke unieke eind-URL in headless
  chromium en beoordeelt de **eindbestemming**: rood bij 4xx/5xx of soft-redirect
  naar zoek-/home-/fallbackpagina (GYG `/s?...`, Booking-home). Retry 3x met
  exponentiële backoff; **netwerktimeout = waarschuwing, geen rood**.
- Bij rood opent/updatet de workflow één GitHub-issue (dedup op label
  `affiliate-nightly`) met een per-link rapport (partner, volledige URL,
  eindbestemming, reden, bronpagina('s)). DevOps/Marijn triageert dat naar een
  LAT-ticket.
- Playwright staat **bewust niet in `package.json`** (zou de blokkerende
  VPS-build `npm ci` belasten met een chromium-download) — de nightly installeert
  het CI-only, ephemeer.
- Lokaal handmatig: `AFFILIATE_LIVE_SITE=https://vinomartino.com npm run
  check:affiliate-links:live` (vereist lokaal `npm i -D playwright && npx
  playwright install chromium`). Zonder `AFFILIATE_LIVE_SITE` valt het terug op
  een `dist/`-scan.

Blijft daarnaast gelden: bij elke nieuwe of gewijzigde affiliate-tour de
eindbestemming ook **direct in een browser** openen — wacht niet op de nachtrun.
