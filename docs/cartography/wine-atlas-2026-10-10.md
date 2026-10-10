# Wine atlas geography audit, 2026-10-10

All eight published country atlases (39 areas, both NL and EN) now use wine geography. Administrative boundaries remain a faint background only. Region-detail maps use POIs/routes rather than the erroneous administrative overlays. The obsolete standalone Italy infographic redirects to the maintained country atlas.

## Sources and accuracy

Europe: Candiago et al. (2022), A geospatial inventory of regulatory information for wine protected designations of origin in Europe, https://www.nature.com/articles/s41597-022-01513-0 . CC0 geometry: https://doi.org/10.6084/m9.figshare.19312094 . These are municipality-level PDO areas, not vineyard parcels or a guarantee of current legal boundaries. Broad regional guides combine relevant PDOs; Italian administrative regions only clip their wine-area unions. Bourgogne excludes Beaujolais. Small national-scale islands are simplified.

South Africa: public Wine of Origin web map embedded by SAWIS, https://www.sawis.co.za/cert/productionareas.php . ArcGIS item 77d24f54b9424c69b9a650242d3ceb21, checked 2026-10-10; item metadata last modified in 2018. Uses districts, Constantia ward, and the three Hemel-en-Aarde wards. This is a dated geographic source, not a claim of current cadastral precision.

Background: Natural Earth v5.1.2, public domain. Source IDs and geographic anchors are retained in every wine-area GeoJSON feature. The site displays the source and resolution in CMS-managed NL/EN text.

## Inventory

| Country | Wine areas |
| --- | --- |
| duitsland | Mosel, Pfalz, Rheingau |
| frankrijk | Loire, Champagne, Bourgogne, Rhône, Provence |
| italie | Langhe, Etna, Trentino-Alto Adige, Veneto, Toscane, Campania, Puglia, Sardegna, Emilia-Romagna, Friuli-Venezia Giulia |
| oostenrijk | Burgenland, Wachau, Kamptal |
| portugal | Douro, Alentejo, Vinho Verde, Lisboa |
| slowakije | Slowakije |
| spanje | Rioja, Jerez, Priorat, Ribera del Duero, Rueda, Bierzo, Rías Baixas |
| zuid-afrika | Swartland, Paarl, Stellenbosch, Franschhoek, Constantia, Hemel-en-Aarde |

## Regeneration

Use a Python virtual environment with geopandas, pyogrio, shapely and pyproj. Download the two Figshare files and Natural Earth file named in `build-wine-areas.py`; download the SAWIS ArcGIS item data JSON. Run:

```sh
python scripts/cartography/build-wine-areas.py /path/to/source-cache
python scripts/cartography/build-south-africa.py /path/to/za-webmap.json
npm install --no-save --package-lock=false d3-geo topojson-server topojson-client
NE_LOCAL=/path/to/ne-admin1.geojson node scripts/gen-country-regions.mjs
npm run test:wine-geography
```

Normal builds use the checked-in generated geometry and need no GIS dependencies. Before deploying, seed `atlas.*` ui_strings with `directus/scripts/seed-atlas-geography-copy.mjs` using the existing Directus environment. This was completed for NL and EN on 2026-10-10.

## Validation

Six geography regression tests cover all 39 source areas, Loire west-to-east coverage, southern Rhône, Champagne in Aisne, small appellations versus their former province proxies, label collision handling and generated/source parity. Local Astro build: 667 pages. Browser inspection: all eight maps desktop, France at 390px mobile, no horizontal overflow. Local full test run passed 45 of 46 scripts; the existing container-reaper shell test assumes GNU sed/date and fails on macOS. Linux CI is the release gate.

## Region detail follow-up

All 40 published region pages, in both languages, reuse the same source polygons. `StreekKaart` draws the geographic area independently of address availability, initially fits the whole area, and offers a separate address view. Static SVG previews render before JavaScript; detail previews retain all source rings rather than country-scale simplification. The locator uses the country atlas and sits below the map to avoid covering shapes or pins. It no longer instantiates a second Leaflet/MapLibre map.

Kakheti adds the 40th area. The National Wine Agency's PDO 789 specification, section 4, explicitly defines the geographic area through Akhmeta, Telavi, Gurjaani, Sighnaghi, Dedoplistskaro, Kvareli, Lagodekhi and Sagarejo. Source: https://wine.gov.ge/En/Wine/9 and https://wine.gov.ge/En/Files/Download/15321 (checked 2026-10-10). The simplified Natural Earth Kakheti outline represents this geographic municipal union. It does NOT represent planted vineyards or the separate 200-750m cultivation restriction in section 6. Both locales explicitly explain this distinction. Regenerate with `python scripts/cartography/build-kakheti.py /path/ne-admin1.geojson`, then `NE_LOCAL=/path/ne-admin1.geojson node scripts/gen-country-regions.mjs georgie`. Georgia provides locator context; no new country content page is published.

Validation: local build 667 pages, all 80 region HTML pages checked against their exact source feature and localized controls; seven geographic tests, three detail-bounds/ring tests, and three lazy-load tests pass. Browser checks include Loire, English Etna at 390px, Hemel-en-Aarde and Kakheti, with functional area/address switching and no mobile overflow.
