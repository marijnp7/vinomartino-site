import type { APIRoute } from 'astro';
import { buildSearchRecords, searchIndexResponse } from '../../lib/search-index';

// LAT-2781: build-time EN search index onder /en/search-index.json.
// Gevoed door de EN-loaders: de no-translation-guard (directus-i18n.ts) filtert
// onvertaalde records eruit, zodat de EN-index alléén vertaalde content bevat en
// geen 404's naar onvertaalde detailpagina's oplevert. `rec.url` is server-side
// al gelokaliseerd (/en/...), dus de SearchDialog hoeft client-side geen paden
// samen te stellen.

export const GET: APIRoute = async () => {
    const records = await buildSearchRecords('en');
    return searchIndexResponse(records);
};
