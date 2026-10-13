// LAT-12562 — testevents in affiliate_clicks (testklik 11-10, Playwright-kliktijdmeting
// `lat12562-clicktime`) dragen een placement met dit prefix. Elke consumer die echte
// bezoekersklikken telt, sluit ze uit; zelfde regel als directus/scripts/lat12562-clicks-fill.mjs.
export const TEST_PLACEMENT_PREFIX = 'lat12562-';

export function isTestClick(row: { placement?: string | null }): boolean {
  return typeof row.placement === 'string' && row.placement.startsWith(TEST_PLACEMENT_PREFIX);
}
