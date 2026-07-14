// LAT-2270 [VIS] — verrijkte route-body renderer. Vertaalt redactionele markdown-
// directives (`:::foto`, `:::boek`, `:::infographic`) uit `routes.body` naar veilige
// inline-HTML die door dezelfde sanitize/toc-pas loopt als de gewone body
// (mdastToHtmlWithToc, LAT-2270-split in markdown.ts). Zo blijven de dag-blokken
// (route-days.ts) en de kaart ongemoeid; de directives verrijken alleen de proza.
//
// Contract met de redactie (Lead Editor, LAT-2268):
//
//   :::foto{ref="<assetId>" bijschrift="<onderschrift>" formaat="breed|inzet"}
//     Beeld tussen de proza. `ref` = Directus-asset-id → gecommit onder
//     public/images/routes/body-<id>.jpg (downloadFoto-closure uit routes.ts).
//     `formaat` optioneel: breed (full-bleed) of inzet (klein/ingesprongen).
//     Faalt de download, dan valt het hele figuur weg (deploy-safe, geen broken img).
//
//   :::boek{acc="<accommodationId>" label="<knoptekst>"}
//   :::boek{zoek="<zoekterm>" label="<knoptekst>"}
//     Boek-CTA. `acc` = numeriek accommodations-id → directe booking.com-deeplink
//     (aid=818285 via CJ, resolveBoekHref-closure). `zoek` = fallback-zoekdeeplink.
//     Rendert een `rel="sponsored noopener"`-knop + vaste disclosure-microcopy.
//     Zonder resolvebare href valt de CTA weg (deploy-safe).
//
//   :::infographic{...}
//     Wikkelt de ingesloten markdown (bv. een statlijst) in een <aside class="route-
//     infographic">. De inhoud rendert als normale markdown; puur presentatie.
//
// Onbekende directives worden genegeerd (niets gerenderd) — deploy-safe, geen regressie.

import { mdastToHtmlWithToc, normalizeEmDashes, type TocItem } from './markdown';
import { STAY_DISCLOSURE_MICROCOPY } from './stay-tier';

// Minimale mdast-vorm die we nodig hebben; de directive-extensie hangt `name` en
// `attributes` aan container/leaf/text-directive-nodes.
interface MdastNode {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  value?: string;
  children?: MdastNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  depth?: number;
}

export interface RouteBodyContext {
  /** Downloadt/commit een foto-asset en geeft het publieke pad terug (of null). */
  downloadFoto: (ref: string) => Promise<string | null>;
  /** Lost de boek-attributen op naar een booking.com-deeplink (of null). */
  resolveBoekHref: (attrs: Record<string, string>) => Promise<string | null>;
}

const DIRECTIVE_TYPES = new Set(['containerDirective', 'leafDirective', 'textDirective']);
const ENRICHED_NAMES = new Set(['foto', 'boek', 'infographic']);

// Snelle gate: alleen als de body minstens één herkende directive bevat lopen we het
// verrijkte pad in. Anders rendert routes.ts de body byte-identiek via markdownToHtml.
export function hasRouteDirectives(markdown: string): boolean {
  if (!markdown) return false;
  return /(?:^|\n):{2,3}(?:foto|boek|infographic)\b/.test(markdown);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanAttrs(attributes: MdastNode['attributes']): Record<string, string> {
  const out: Record<string, string> = {};
  if (!attributes) return out;
  for (const [k, v] of Object.entries(attributes)) {
    if (v == null) continue;
    const val = String(v).trim();
    if (val) out[k] = val;
  }
  return out;
}

// Verzamelt (recursief) alle foto-refs en boek-specs zodat we de async resolutie
// in één keer kunnen afwikkelen vóór de synchrone directive→HTML-transform.
function collect(nodes: MdastNode[], fotoRefs: Set<string>, boekSpecs: Map<string, Record<string, string>>): void {
  for (const node of nodes) {
    if (DIRECTIVE_TYPES.has(node.type) && node.name && ENRICHED_NAMES.has(node.name)) {
      const attrs = cleanAttrs(node.attributes);
      if (node.name === 'foto' && attrs.ref) fotoRefs.add(attrs.ref);
      if (node.name === 'boek') boekSpecs.set(JSON.stringify(attrs), attrs);
    }
    if (Array.isArray(node.children)) collect(node.children, fotoRefs, boekSpecs);
  }
}

interface FotoResolved {
  src: string;
  width?: number;
  height?: number;
}

// LAT-2432: intrinsieke afmetingen van de gecommitte body-foto zodat de <img>
// width/height meekrijgt en de browser de ruimte reserveert vóór het (lazy) laden
// → geen layout shift (CLS) bij scrollen op mobiel. Faalt de probe (ontbrekend
// bestand, corrupte bytes), dan valt het figuur terug op de CSS aspect-ratio-fallback
// (deploy-safe: nooit build-breaking, nooit een broken img).
async function probeImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  try {
    const { join } = await import('node:path');
    const sharp = (await import('sharp')).default;
    const abs = join(process.cwd(), 'public', src.replace(/^\/+/, ''));
    const meta = await sharp(abs).metadata();
    const w = meta.width;
    const h = meta.height;
    if (!w || !h) return null;
    // EXIF-orientation 5-8 = 90°/270° gedraaid → getoonde dims zijn verwisseld
    // t.o.v. de opgeslagen pixel-dims (zie DAM EXIF-rotatie, ref 899).
    const rotated = typeof meta.orientation === 'number' && meta.orientation >= 5;
    return rotated ? { width: h, height: w } : { width: w, height: h };
  } catch {
    return null;
  }
}

function fotoHtml(attrs: Record<string, string>, foto: FotoResolved, eager: boolean): string {
  const caption = attrs.bijschrift ?? '';
  const fmt = attrs.formaat === 'breed' || attrs.formaat === 'inzet' ? ` route-foto--${attrs.formaat}` : '';
  // LAT-2432: intrinsieke width/height reserveert de ruimte (CLS-fix). Ontbreken
  // de dims (probe faalde), dan pakt de CSS aspect-ratio-fallback het over.
  const dims = typeof foto.width === 'number' && typeof foto.height === 'number'
    ? ` width="${foto.width}" height="${foto.height}"`
    : '';
  // LAT-2432: de eerste body-foto staat doorgaans boven de vouw → eager + hoge
  // fetchpriority (LCP-winst); de rest blijft lazy.
  const loadAttrs = eager
    ? ` loading="eager" fetchpriority="high" decoding="async"`
    : ` loading="lazy" decoding="async"`;
  const fig = [
    `<figure class="route-foto${fmt}">`,
    `<img src="${escapeHtml(foto.src)}" alt="${escapeHtml(caption)}"${dims}${loadAttrs} />`,
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '',
    `</figure>`,
  ].join('');
  return fig;
}

function boekHtml(href: string, label: string): string {
  return [
    `<div class="route-boek">`,
    `<a class="route-boek__cta" href="${escapeHtml(href)}" target="_blank" rel="sponsored noopener">${escapeHtml(label)}</a>`,
    `<p class="route-boek__disclosure">${escapeHtml(STAY_DISCLOSURE_MICROCOPY)}</p>`,
    `</div>`,
  ].join('');
}

// Vervangt directive-nodes in-place: foto/boek → raw-HTML-node (loopt door sanitize),
// infographic → <aside>-wrapper met behoud van kinderen. Onbekende/onresolvbare
// directives worden verwijderd (deploy-safe).
function transform(
  nodes: MdastNode[],
  fotoMap: Map<string, FotoResolved | null>,
  boekMap: Map<string, string | null>,
  state: { fotoSeen: number },
): MdastNode[] {
  const out: MdastNode[] = [];
  for (const node of nodes) {
    if (Array.isArray(node.children)) node.children = transform(node.children, fotoMap, boekMap, state);

    if (!DIRECTIVE_TYPES.has(node.type) || !node.name || !ENRICHED_NAMES.has(node.name)) {
      // Niet-verrijkte directive (onbekende naam) → droppen; anders node behouden.
      if (DIRECTIVE_TYPES.has(node.type)) continue;
      out.push(node);
      continue;
    }

    const attrs = cleanAttrs(node.attributes);
    if (node.name === 'foto') {
      const foto = attrs.ref ? fotoMap.get(attrs.ref) : null;
      if (foto) {
        const eager = state.fotoSeen === 0;
        state.fotoSeen += 1;
        out.push({ type: 'html', value: fotoHtml(attrs, foto, eager) });
      }
      continue; // geen src → figuur valt weg
    }
    if (node.name === 'boek') {
      const href = boekMap.get(JSON.stringify(attrs)) ?? null;
      if (href) out.push({ type: 'html', value: boekHtml(href, attrs.label || 'Bekijk & boek') });
      continue; // geen href → CTA valt weg
    }
    // infographic: behoud kinderen, render als <aside class="route-infographic">.
    node.data = { ...(node.data ?? {}), hName: 'aside', hProperties: { className: ['route-infographic'] } };
    out.push(node);
  }
  return out;
}

export async function renderEnrichedRouteBody(
  markdown: string,
  ctx: RouteBodyContext,
): Promise<{ html: string; toc: TocItem[] }> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { gfm } = await import('micromark-extension-gfm');
  const { gfmFromMarkdown } = await import('mdast-util-gfm');
  const { directive } = await import('micromark-extension-directive');
  const { directiveFromMarkdown } = await import('mdast-util-directive');

  const mdast = fromMarkdown(normalizeEmDashes(markdown), {
    extensions: [gfm(), directive()],
    mdastExtensions: [gfmFromMarkdown(), directiveFromMarkdown()],
  }) as unknown as { children: MdastNode[] };

  // 1. Async resolutie van alle refs/specs in één golf.
  const fotoRefs = new Set<string>();
  const boekSpecs = new Map<string, Record<string, string>>();
  collect(mdast.children, fotoRefs, boekSpecs);

  const fotoMap = new Map<string, FotoResolved | null>();
  const boekMap = new Map<string, string | null>();
  await Promise.all([
    ...[...fotoRefs].map(async (ref) => {
      const src = await ctx.downloadFoto(ref);
      if (!src) { fotoMap.set(ref, null); return; }
      // LAT-2432: dims meelezen in dezelfde async-golf; het bestand staat na de
      // download op schijf (public/images/routes/body-<id>.jpg).
      const dims = await probeImageDimensions(src);
      fotoMap.set(ref, dims ? { src, width: dims.width, height: dims.height } : { src });
    }),
    ...[...boekSpecs].map(async ([key, attrs]) => { boekMap.set(key, await ctx.resolveBoekHref(attrs)); }),
  ]);

  // 2. Synchrone directive→HTML-transform, daarna de gedeelde sanitize/toc-pas.
  mdast.children = transform(mdast.children, fotoMap, boekMap, { fotoSeen: 0 });
  return mdastToHtmlWithToc(mdast as unknown as Parameters<typeof mdastToHtmlWithToc>[0], { stripFirstH1: true });
}
