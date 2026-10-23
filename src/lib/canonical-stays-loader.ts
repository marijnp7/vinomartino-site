import { readDirectusEnv, assertDirectusConfigured, fetchDirectusCollection, statusFilterQuery } from './directus-config';
import { localizeRecordsSoft } from './directus-i18n';
import { clearUntranslatedText } from './canonical-stays';
import type { Locale } from './i18n';
const cache = new Map<Locale, Promise<Record<string, any>[]>>();
export function loadCanonicalStays(locale: Locale): Promise<Record<string, any>[]> {
    const old = cache.get(locale);
    if (old) return old;
    const pending = (async () => {
        const env = readDirectusEnv();
        assertDirectusConfigured('canonical-stays', env);
        const fields = 'id,status,name,slug,tier,tags,location,description,why_this_one,price_low,price_high,prijs_valuta,recensiescore,booking_url,hero_image,lat,lng,streek_id.slug';
        const res = await fetchDirectusCollection('canonical-stays', `${env.url}/items/accommodations?limit=-1&fields=${fields}${statusFilterQuery(env)}`, { headers: { Authorization: `Bearer ${env.token}` } });
        if (!res.ok) throw new Error(`Canonical stays: HTTP ${res.status}`);
        const raw = (await res.json()).data;
        const textFields = ['description', 'why_this_one', 'why_regel', 'prijs_disclaimer'];
        // LAT-14700: soft overlay, the approved set must stay complete on /en/.
        const localized = await localizeRecordsSoft(raw, { env, locale, junction: 'accommodations_translations', parentIdField: 'accommodations_id', fields: textFields });
        return locale === 'en' ? clearUntranslatedText(localized, raw, textFields) : localized;
    })().catch(error => { cache.delete(locale); throw error; });
    cache.set(locale, pending);
    return pending;
}
