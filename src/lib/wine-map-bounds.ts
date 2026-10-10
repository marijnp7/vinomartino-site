/** Generated atlas paths contain only absolute M/L pairs and Z. */
export function pathViewBox(d: string): string {
  const values = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 6 || values.length % 2) throw new Error('Invalid atlas path');
  let west = Infinity, east = -Infinity, north = Infinity, south = -Infinity;
  for (let i = 0; i < values.length; i += 2) {
    west = Math.min(west, values[i]); east = Math.max(east, values[i]);
    north = Math.min(north, values[i + 1]); south = Math.max(south, values[i + 1]);
  }
  const padding = Math.max(east - west, south - north) * .1 || 1;
  return [west-padding, north-padding, east-west+2*padding, south-north+2*padding].join(' ');
}

/** Detail preview uses the source geometry, not paths simplified for a country map. */
export function detailAreaPath(geometry: { type: string; coordinates: unknown }) {
  const coordinates = geometry.coordinates as number[][][][] | number[][][];
  const polygons = geometry.type === 'Polygon' ? [coordinates as number[][][]] : coordinates as number[][][][];
  const rings = polygons.flatMap(poly => poly.map(ring => ring.map(([lng,lat]) => [lng, -Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360))*180/Math.PI])));
  const points = rings.flat();
  const west = Math.min(...points.map(p=>p[0])), north = Math.min(...points.map(p=>p[1]));
  const span = Math.max(Math.max(...points.map(p=>p[0]))-west, Math.max(...points.map(p=>p[1]))-north);
  const scale = 1000 / span;
  const d = rings.map(ring=>'M'+ring.map(([x,y])=>`${((x-west)*scale).toFixed(2)} ${((y-north)*scale).toFixed(2)}`).join(' L')+' Z').join(' ');
  return { d, viewBox: pathViewBox(d) };
}
