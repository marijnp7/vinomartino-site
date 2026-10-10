// Server-only: each page receives only its own geographic feature.
import { detailAreaPath } from './wine-map-bounds';
const sourceFiles = import.meta.glob('../data/atlas/wine-areas/*.geojson', { eager: true, query: '?raw', import: 'default' });
const projectedFiles = import.meta.glob('../data/atlas/regions/*.json', { eager: true, import: 'default' });
export interface WineGeography {
  feature: { type: string; geometry: { type: string; coordinates: unknown }; properties: { slug: string; source: string; resolution: string; sourceIds: string[] } };
  overview: { viewBox: string; paths: string[]; d: string; anchor: { x: number; y: number } };
  detail: { d: string; viewBox: string };
  sourceKey: 'eu' | 'za' | 'ge';
}
const areas = new Map<string, WineGeography>();
for (const [path, raw] of Object.entries(sourceFiles)) {
  const country = path.split('/').pop()!.replace('.geojson', '');
  const projected = projectedFiles[`../data/atlas/regions/${country}.json`] as any;
  for (const feature of JSON.parse(raw as string).features) {
    const entry = projected?.regions[feature.properties.slug];
    if (!entry?.wine) throw new Error(`Missing projected wine geography: ${feature.properties.slug}`);
    areas.set(feature.properties.slug, {
      feature,
      overview: { viewBox: projected._meta.viewBox, paths: Object.values(projected.regions).filter((r: any) => !r.wine).map((r: any) => r.d), d: entry.d, anchor: entry.labelAt },
      detail: detailAreaPath(feature.geometry),
      sourceKey: country === 'zuid-afrika' ? 'za' : country === 'georgie' ? 'ge' : 'eu',
    });
  }
}
export const getWineGeography = (slug: string) => areas.get(slug);
