import type { APIRoute } from 'astro';
import { buildSearchIndex, searchIndexResponse } from '../lib/search-index';

// LAT-1202 / LAT-12594: NL-index. Bouwer staat in src/lib/search-index.ts.
export type { SearchRecord } from '../lib/search-index';

export const GET: APIRoute = async () => searchIndexResponse(await buildSearchIndex());
