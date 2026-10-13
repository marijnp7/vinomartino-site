import leafletCssUrl from 'leaflet/dist/leaflet.css?url';
import maplibreCssUrl from 'maplibre-gl/dist/maplibre-gl.css?url';

// Enige plek waar de kaartprovider staat (LAT-12030). Providerwissel = BASE_STYLE_URL aanpassen.
export const BASE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

export const BASE_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

let intentPromise: Promise<void> | null = null;

/** Resolvet bij de eerste echte gebruikersactie (of een #anker in de URL). Houdt de zware kaart-init buiten de laadfase: Lighthouse-TBT op streek/route (LAT-12592). */
export function whenUserIntent(): Promise<void> {
  if (!intentPromise) {
    intentPromise = new Promise<void>((resolve) => {
      if (location.hash) { resolve(); return; }
      const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
      const go = () => { evs.forEach((e) => window.removeEventListener(e, go)); resolve(); };
      evs.forEach((e) => window.addEventListener(e, go, { passive: true }));
    });
  }
  return intentPromise;
}

const cssPromises = new Map<string, Promise<void>>();

/** Laadt een stylesheet pas bij aanroep. Een statische of dynamische CSS-import hijst Astro naar
 *  een render-blocking <link> in <head>; dat kostte /wijnroutes/ lab-LCP (LAT-12594). */
export function loadCss(href: string): Promise<void> {
  let p = cssPromises.get(href);
  if (!p) {
    p = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    cssPromises.set(href, p);
  }
  return p;
}

let leafletPromise: Promise<any> | null = null;

/** Leaflet plus zijn CSS, beide pas bij de eerste kaart-init. */
export function loadLeaflet(): Promise<any> {
  if (!leafletPromise) {
    leafletPromise = Promise.all([
      loadCss(leafletCssUrl),
      // @ts-ignore leaflet heeft hier geen type-declaraties
      import('leaflet').then((m: any) => m.default ?? m),
    ]).then(([, L]) => L);
  }
  return leafletPromise;
}

let glPromise: Promise<(opts: Record<string, unknown>) => any> | null = null;

function loadGl() {
  if (!glPromise) {
    glPromise = Promise.all([
      loadCss(maplibreCssUrl),
      import('maplibre-gl'),
      import('@maplibre/maplibre-gl-leaflet'),
    ]).then(([, , plugin]: any[]) => plugin.maplibreGL ?? plugin.default);
  }
  return glPromise;
}

/** Voegt de OpenFreeMap-basislaag (vector, via maplibre-gl) toe aan een Leaflet-kaart. Laadt maplibre pas bij aanroep. */
export async function addBaseLayer(map: any): Promise<any> {
  const maplibreGL = await loadGl();
  const layer = maplibreGL({
    style: BASE_STYLE_URL,
    attributionControl: { customAttribution: BASE_ATTRIBUTION },
  });
  map.setMaxZoom(18);
  layer.addTo(map);
  return layer;
}
