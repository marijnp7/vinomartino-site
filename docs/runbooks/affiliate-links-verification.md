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
maakt). Zie de follow-up bij [LAT-2531](/LAT/issues/LAT-2531).

Tot die nightly er is: bij elke nieuwe of gewijzigde affiliate-tour de
eindbestemming **handmatig in een browser** openen en bevestigen dat je op de
product-/tourpagina landt, niet op een zoeklijst.
