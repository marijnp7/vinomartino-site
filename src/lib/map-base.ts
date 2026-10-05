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

let glPromise: Promise<(opts: Record<string, unknown>) => any> | null = null;

function loadGl() {
  if (!glPromise) {
    glPromise = Promise.all([
      import('maplibre-gl/dist/maplibre-gl.css'),
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
