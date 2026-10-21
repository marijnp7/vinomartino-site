import type { APIRoute } from 'astro';
import { getWineGeography, wineGeographySlugs } from '../../../lib/wine-geography';

// LAT-12594: the sourced GeoJSON boundary is only needed when the Leaflet map initialises,
// so it is fetched then instead of travelling inline in every streek document.
export const getStaticPaths = () => wineGeographySlugs().map((slug) => ({ params: { slug } }));

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(getWineGeography(params.slug!)!.feature), { headers: { 'Content-Type': 'application/json' } });
