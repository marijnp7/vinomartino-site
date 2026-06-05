/**
 * Atlas-adapter (LAT-1122) — mapt de Directus-opslagvorm van de landen-atlas
 * (LAT-1120 schema, LAT-1121 geometrie) naar de props van
 * <InfographicAtlasInteractive>.
 *
 * Eén adapter voor twee bronnen:
 *   • de LAT-1121 seed-JSON (Nederlandse sleutels: label / grape_label /
 *     classificatie / parent_streek) — gebruikt door de noindex-mockup;
 *   • de live Directus-rijen na LAT-1123-import (kolommen: name /
 *     dominant_grape / classification / streek_id).
 * Daarom leest elke veld-getter beide sleutels.
 *
 * 404-veiligheid (harde eis LAT-1122): een zone wordt alléén klikbaar als de
 * streek-slug in `publishedSlugs` zit. Onbevestigde zones renderen als
 * niet-klikbare vorm i.p.v. een <a> die op een 404 belandt.
 */
import type {
  AtlasMapConfig,
  AtlasBaseLayer,
  AtlasZone,
  AtlasAppellatie,
  AccentColor,
} from '../components/InfographicAtlasInteractive.astro';

type Rec = Record<string, unknown>;

const ACCENTS: AccentColor[] = ['burgundy', 'rust', 'vine'];
function accent(v: unknown): AccentColor | undefined {
  return typeof v === 'string' && (ACCENTS as string[]).includes(v) ? (v as AccentColor) : undefined;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function pick(r: Rec, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] != null && r[k] !== '') return r[k];
  return undefined;
}

interface DataPair { label: string; value: string }
function facts(v: unknown): DataPair[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const rec = f as Rec;
      const label = str(rec.label);
      const value = str(rec.value);
      return label && value ? { label, value } : null;
    })
    .filter((f): f is DataPair => f !== null);
}

function offset(v: unknown): { x: number; y: number } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const rec = v as Rec;
  const x = Number(rec.x);
  const y = Number(rec.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

function baseLayers(v: unknown): AtlasBaseLayer[] {
  if (!Array.isArray(v)) return [];
  const out: AtlasBaseLayer[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Rec;
    if (rec.kind === 'point') {
      const x = Number(rec.x);
      const y = Number(rec.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ kind: 'point', type: str(rec.type), x, y, label: str(rec.label) });
      }
    } else {
      const d = str(rec.d);
      if (d) out.push({ kind: 'zone', role: str(rec.role), d, color: accent(rec.color) });
    }
  }
  return out;
}

/** map_config-rij → AtlasMapConfig. */
export function mapConfigToProps(mc: Rec | null | undefined): AtlasMapConfig {
  const viewBox = str(mc?.viewBox) || '0 0 800 1000';
  const bbox = Array.isArray(mc?.bbox) && mc!.bbox.length === 4
    ? (mc!.bbox.map(String) as [string, string, string, string])
    : undefined;
  const scaleRaw = mc?.scaleBar as Rec | undefined;
  const scaleBar = scaleRaw && Number.isFinite(Number(scaleRaw.kmTo)) && Number.isFinite(Number(scaleRaw.pxLength))
    ? { kmTo: Number(scaleRaw.kmTo), pxLength: Number(scaleRaw.pxLength) }
    : undefined;
  const bg = str(mc?.backgroundPattern);
  return {
    viewBox,
    bbox,
    compass: mc?.compass !== false,
    scaleBar,
    backgroundPattern: (bg as AtlasMapConfig['backgroundPattern']) ?? 'contour',
    baseLayers: baseLayers(mc?.base_layers ?? mc?.baseLayers),
  };
}

function appellatieToProps(r: Rec, published: Set<string>): AtlasAppellatie {
  const slug = str(r.slug);
  const parent = streekKey(r);
  return {
    name: str(pick(r, 'name', 'label')) || String(r.slug ?? ''),
    slug,
    classification: str(pick(r, 'classification', 'classificatie')),
    // 404-veilig: klikbaar als de eigen appellatie-pagina bestaat, of (zonder
    // eigen pagina) de parent-streek gepubliceerd is.
    linkable: (slug ? published.has(slug) : false) || (!slug && !!parent && published.has(parent)),
    zonePath: str(pick(r, 'zone_path', 'zonePath')),
    zoneColor: accent(pick(r, 'zone_color', 'zoneColor')),
  };
}

function streekKey(r: Rec): string | undefined {
  return str(pick(r, 'streek_id', 'parent_streek', 'parentStreek'));
}

/**
 * Bouwt de zones[]-prop. `publishedSlugs` bepaalt klikbaarheid (404-veilig):
 * leeg = geen drill-down (mockup-modus); gevuld = alleen bestaande streken.
 */
export function buildZones(
  streken: Rec[],
  appellaties: Rec[],
  publishedSlugs: Iterable<string> = [],
): AtlasZone[] {
  const published = new Set(publishedSlugs);
  const byStreek = new Map<string, AtlasAppellatie[]>();
  for (const ap of appellaties) {
    const key = streekKey(ap);
    if (!key) continue;
    const list = byStreek.get(key) ?? [];
    list.push(appellatieToProps(ap, published));
    byStreek.set(key, list);
  }
  return streken.map((r) => {
    const slug = String(r.slug ?? '');
    return {
      slug,
      name: str(pick(r, 'name', 'label')) || slug,
      linkable: published.has(slug),
      zonePath: str(pick(r, 'zone_path', 'zonePath')),
      zoneColor: accent(pick(r, 'zone_color', 'zoneColor')),
      labelOffset: offset(pick(r, 'zone_label_offset', 'zoneLabelOffset')),
      grapeColor: accent(pick(r, 'grape_color', 'grapeColor')),
      dominantGrape: str(pick(r, 'dominant_grape', 'grape_label', 'dominantGrape')),
      wineStyle: str(pick(r, 'wine_style', 'wineStyle')),
      facts: facts(r.facts),
      appellaties: byStreek.get(slug) ?? [],
    };
  });
}
