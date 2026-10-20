# LAT-14300: technische reviewset, 20 oktober 2026

Nog niet gepubliceerd. Zeven conceptrecords 371–377, ieder met EN-vertaling, zijn aangemaakt en teruggelezen. Gepubliceerde bronnen zijn nog ongewijzigd.

## Resultaat

- Eén gedeelde collection-loader voor de drie proefregio's en vier betrokken bestaande routes. Regionale selectie stopt de build als het niet 9 adressen met 3/3/3 tiers zijn.
- Route-id-verwijzingen halen naam, hotellink, foto en coördinaten op uit accommodations; routegebonden tekst blijft behouden. Route-only records krijgen de tag `route_only` en komen niet bij de regionale negen.
- Manifest bewaart before/after voor 58 bronpatches, plus publicatie van zeven concepten. De API-preflight leest alle doelrecords voor enige wijziging en slaagt: 61 effectieve wijzigingen, 4 al identieke patches.
- Bronbackup bevat NL, EN, routes en regionale gegevens. Geen prijzen of ontbrekende hotelgegevens aangevuld. Bestaande teksten worden overgezet, niet herschreven.
- Offline projectie: 9/9/9 adressen, 25 id-verwijzingen over de vier routes, nul zoeklinks. Dit is geen gerenderd productie- of EN-bewijs.
- Zeven tests geslaagd (vier nieuwe regressietests plus drie bestaande routetests). Syntaxis van vijf gewijzigde TS-modules gecontroleerd; geen volledige Astro-build uitgevoerd.

## Externe linkbronnen

Er is uitsluitend gezocht naar kale hotelbestemmingen; geen affiliate-links geopend.

- https://www.booking.com/hotel/fr/la-villa-eugene.html
- https://www.booking.com/hotel/it/agriturismo-tra-gli-ulivi.it.html
- https://www.booking.com/hotel/it/albergo-il-giglio-montalcino.it.html
- Remparts: de JSON gebruikt `des-remparts-beaune`, de route `hotelsdesremparts`. De officiële site https://www.hotel-remparts-beaune.com/fr/ beschrijft de overgang van Hôtel des Remparts naar Les Remparts Hôtels et Demeures Historiques; https://www.booking.com/hotel/fr/hotelsdesremparts.html bevestigt 48 rue Thiers, Beaune. Manifest corrigeert de conceptlink bij uitvoering; geen wijziging aan goedgekeurde tier.

## Review en uitvoering

DevOps Engineer: voer R2-code-/migratiereview uit, controleer in het bijzonder EN-overlays, read-permissions van de build-identiteit voor de gebruikte velden, het ontbreken van `route_only` in regionale roundups en het behoud van bestaande routes. Niet mergen zolang CMS nog de oude selectie draagt: de nieuwe guards zijn bewust rood op de oude data. Geef ditzelfde issue na de review terug aan CTO met uitkomst; geen stap-4-issue aanmaken.

CTO: vraag na geslaagde review één concreet Telegram-publicatieakkoord. Daarna bronbackup verversen, drift-preflight uitvoeren, goedgekeurde migratie uitvoeren, R2-merge en deploy coördineren, NL/EN-productie-HTML plus build-info meten en Marketing & Growth om onafhankelijke acceptatie vragen. Geen automatische/publicatie-goedkeuring afgeleid uit het hervatmandaat.

Commands (in de PR-worktree):

```
node --experimental-strip-types --test scripts/canonical-stays.test.mjs scripts/route-narrative.test.mjs
# Comprimeer het manifest naar de run-scratchdirectory; de runner heeft argv-groottegrenzen.
gzip -c directus/data/lat14300-migration-manifest.json > "$PAPERCLIP_RUN_SCRATCH_DIR/manifest.json.gz"
/paperclip/scripts/directus-run-internal.sh --script directus/scripts/lat14300-apply-approved.mjs --data "$PAPERCLIP_RUN_SCRATCH_DIR/manifest.json.gz"
# Alleen NA vastgelegd publicatieakkoord: dezelfde opdracht met -- --apply-approved.
```

De apply-run is geen transactie over zes collecties. Hij controleert alle before-waarden vooraf, leest elke write terug en is hervatbaar; voorkom een gelijktijdige build tijdens uitvoering. Bij drift eerst reconciliëren, niet de controle verwijderen.
