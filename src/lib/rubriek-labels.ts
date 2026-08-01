/**
 * LAT-3306 (B4) — vertaalbare artikel-rubrieklabels.
 *
 * De rubriek van een artikel staat in Directus als één rauwe NL-string in
 * `articles.category` ("Regio-gidsen", "Wijn & tafel", ...). Die string is
 * tegelijk het zichtbare label én — via `rubriekSlug()` — de sleutel achter de
 * filter-URL's (`?rubriek=regio-gidsen`). Op /en/ werd hij daarom onvertaald
 * doorgegeven aan de lezer.
 *
 * Route A uit LAT-3305: geen schemawijziging op `articles`, maar een mapping in
 * de bestaande `ui_strings`-dictionary op key `artikelen.rubriek.<slug>`. Dat
 * betekent expliciet:
 *
 *   - de **slug** blijft afgeleid van de rauwe NL-waarde, in beide talen. De
 *     filter-URL's zijn dus taal-onafhankelijk en er zijn geen redirects nodig.
 *   - alleen het **label** gaat door de dictionary heen.
 *
 * Onbekende `category`-waarden (nieuwe rubriek in Directus, nog geen key) vallen
 * terug op de rauwe string. `UiStrings.t()` doet dat níet — die geeft als laatste
 * redmiddel de key zélf terug, wat "artikelen.rubriek.foo" op de pagina zou
 * zetten. Vandaar de expliciete has-check hieronder.
 */

import { UI_STRING_DEFAULTS, type UiStrings } from './ui-strings';

/**
 * Slug achter een rubriek. Identiek aan de regex die tot LAT-3306 lokaal in
 * `ArtikelenIndex.astro` stond — de gepubliceerde filter-URL's hangen eraan, dus
 * dit gedrag mag niet wijzigen.
 */
export function rubriekSlug(raw: string): string {
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Dictionary-key voor een rubriek-slug. */
export function rubriekKey(slug: string): string {
    return `artikelen.rubriek.${slug}`;
}

/**
 * Zichtbaar label voor een rauwe `category`-waarde in de actieve taal. Valt terug
 * op de rauwe string zodra de rubriek niet in de dictionary staat, zodat een
 * nieuwe rubriek nooit leeg of als key rendert.
 */
export function rubriekLabel(ui: UiStrings, raw: string | null | undefined): string {
    const value = (raw || '').trim();
    if (!value) return '';
    const key = rubriekKey(rubriekSlug(value));
    return key in UI_STRING_DEFAULTS ? ui.t(key) : value;
}
