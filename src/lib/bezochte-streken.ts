/**
 * De lijst van elf: de streken die Marijn zelf bezocht heeft.
 *
 * LAT-11950. Dit is de enige bron voor "zelf gereisd" in de sitechrome, op
 * /over-ons/ en op /auteurs/marijn/. Alle andere streken op de site zijn
 * Redactiegids: zorgvuldig samengesteld uit primaire bronnen, zonder
 * ooggetuigeclaim. Wie hier een streek bij zet, zegt daarmee dat Marijn er
 * zelf geweest is; dat is een merkclaim, dus uitbreiden gaat via het board
 * (GROEISTRATEGIE_VINOMARTINO.md, randvoorwaarden).
 *
 * Volgorde is die van de strategie en het groeiplan, niet alfabetisch.
 */
export const BEZOCHTE_STREKEN: readonly string[] = [
  'Loire',
  'Bourgogne',
  'Champagne',
  'Provence',
  'Mosel',
  'Piemonte',
  'Toscane',
  'Kaapregio',
  'Veneto',
  'Alto Adige',
  'Slowakije',
];

/** Dezelfde elf streken, met de Engelse exoniemen voor /en/-pagina's. */
export const VISITED_REGIONS_EN: readonly string[] = [
  'Loire',
  'Burgundy',
  'Champagne',
  'Provence',
  'Mosel',
  'Piedmont',
  'Tuscany',
  'Cape Winelands',
  'Veneto',
  'Alto Adige',
  'Slovakia',
];
