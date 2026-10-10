import { fetchDirectusCollection, readDirectusEnv } from './directus-config';
import type { Locale } from './i18n';
const keys = ["streek.feit.heading", "streek.feit.ariaLabel", "streek.feit.druiven", "streek.feit.besteSeizoen", "streek.feit.rijdagen", "streek.feit.vliegveld", "streek.feit.aantalAdressen", "streek.feit.appellatieniveau", "streek.feit.besteJaargangen", "streek.feit.oogstperiode", "streek.feit.minBezoektijd", "streek.feit.budgetProeverij", "wijnhuis.glas.sinds", "wijnhuis.glas.generatie", "wijnhuis.glas.hectares", "overview.duration", "overview.transport", "overview.stops", "overview.wineries", "overview.style"];
const cache = new Map<Locale, Promise<{ t: (key: string) => string }>>();
// Both locales read CMS translations. No fallback to legacy hardcoded NL copy.
export function loadOverviewCopy(locale: Locale) {
 let pending = cache.get(locale);
 if (!pending) {
  pending = (async () => {
   const env = readDirectusEnv();
   const query = new URLSearchParams({ filter: JSON.stringify({ key: { _in: keys } }), fields: 'key,translations.languages_code,translations.value', limit: '-1' });
   const response = await fetchDirectusCollection('overview-copy', `${env.url}/items/ui_strings?${query}`, { headers: { Authorization: `Bearer ${env.token}` } });
   if (!response.ok) throw new Error(`Overview copy: HTTP ${response.status}`);
   const copy: Record<string, string> = {};
   for (const row of (await response.json()).data ?? []) {
    const tr = row.translations?.find((v: { languages_code: string }) => v.languages_code === locale);
    if (tr?.value?.trim()) copy[row.key] = tr.value;
   }
   for (const key of keys) if (!copy[key]) throw new Error(`Missing CMS overview copy: ${key} (${locale})`);
   return { t: (key: string) => { if (!copy[key]) throw new Error(`Unknown overview key: ${key}`); return copy[key]; } };
  })();
  cache.set(locale, pending);
  pending.catch(() => cache.delete(locale));
 }
 return pending;
}
