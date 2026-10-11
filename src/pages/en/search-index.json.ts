import type { APIRoute } from 'astro';
import { buildSearchIndex, searchIndexResponse } from '../../lib/search-index';

// LAT-12594: EN-index. Zonder dit bestand fetchte de dialoog op /en/ de NL-index
// (NL-titels, NL-URL's) en gaf /en/search-index.json 404 (REGEL 20).
export const GET: APIRoute = async () => searchIndexResponse(await buildSearchIndex('en'));
