import type { APIRoute } from 'astro';
import { getWineGeography, wineGeographySlugs } from '../../../lib/wine-geography';
import { wineAreaLocatorSvg } from '../../../lib/wine-area-svg';

// LAT-12594: country locator per streek as a static, cacheable file (see wine-area-svg.ts).
export const getStaticPaths = () => wineGeographySlugs().map((slug) => ({ params: { slug } }));

export const GET: APIRoute = ({ params }) =>
  new Response(wineAreaLocatorSvg(getWineGeography(params.slug!)!), { headers: { 'Content-Type': 'image/svg+xml' } });
