import { fetchDirectusCollection, readDirectusEnv } from './directus-config';
import type { Locale } from './i18n';
// Separate from legacy UI defaults: map copy is CMS-owned for NL as well as EN.
const cache = new Map<Locale, Promise<Record<string, string>>>();
export function loadAtlasCopy(locale: Locale): Promise<Record<string, string>> {
  let pending = cache.get(locale);
  if (!pending) {
    pending = (async () => {
      const env = readDirectusEnv();
      const response = await fetchDirectusCollection('atlas-copy', `${env.url}/items/ui_strings?filter[key][_starts_with]=atlas.&limit=-1&fields=key,translations.languages_code,translations.value`, { headers: { Authorization: `Bearer ${env.token}` } });
      if (!response.ok) throw new Error(`Atlas copy: HTTP ${response.status}`);
      const data = await response.json();
      const copy: Record<string, string> = {};
      for (const row of data.data ?? []) {
        const tr = row.translations?.find((v: { languages_code: string }) => v.languages_code === locale);
        if (tr?.value) copy[row.key] = tr.value;
      }
      for (const key of ['kicker','title','intro','method.municipality','method.wineOrigin','sources','mapLabel','source.eu','source.za','source.base','region.title','region.intro','region.areaLabel','region.locatorLabel','region.showArea','region.showAddresses','region.method.za','region.method.ge','source.ge']) {
        if (!copy[`atlas.${key}`]) throw new Error(`Missing CMS map copy: atlas.${key} (${locale})`);
      }
      return copy;
    })();
    cache.set(locale, pending);
    pending.catch(() => cache.delete(locale));
  }
  return pending;
}
