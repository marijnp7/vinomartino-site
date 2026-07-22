import type { APIRoute } from 'astro';
import { buildSearchRecords, searchIndexResponse } from '../lib/search-index';

// LAT-1202: build-time NL search index. De record-opbouw is sinds LAT-2781
// gedeeld met de EN-variant (src/pages/en/search-index.json.ts) via
// src/lib/search-index.ts. NL blijft byte-identiek: localizePath laat kale
// NL-paden ongewijzigd.

export const GET: APIRoute = async () => {
    const records = await buildSearchRecords('nl');
    return searchIndexResponse(records);
};
