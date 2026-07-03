interface MarkdownOptions {
  stripFirstH1?: boolean;
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

// LAT-1118: slug = lowercase, diacritics gestript, niet-alfanumeriek → `-`,
// samengevouwen en getrimd. Lege resultaten vallen terug op `sectie`.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Stateful slugger zodat duplicate koppen stabiele, unieke ids krijgen (`-2`, `-3`).
function makeSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugify(text) || 'sectie';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

function headingText(node: { children?: Array<{ type: string; value?: string; children?: unknown[] }> }): string {
  if (!node.children) return '';
  let out = '';
  for (const child of node.children) {
    if (typeof child.value === 'string') out += child.value;
    else if (Array.isArray(child.children)) out += headingText(child as { children: Array<{ type: string; value?: string }> });
  }
  return out.trim();
}

// LAT-1118: tel woorden van schone markdown (code/links/afbeeldingen/punctuatie
// gestript). Gebruikt voor de leestijd-indicator (200 wpm, NL).
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~`|>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').filter(Boolean).length;
}

// LAT-1061: Marijn's VinoMartino style-rule — geen em-dashes (—) in copy.
// Vervang alleen het volledige `word — word` patroon door `word, word`
// (spaties aan beide kanten, niet-whitespace eromheen). Standalone of
// edge-case em-dashes worden niet aangeraakt om ongewenste leading-komma's
// te voorkomen.
export function normalizeEmDashes(input: string): string {
  // Lookahead op de tweede groep zodat opeenvolgende `a — b — c` patterns
  // beide vervangen worden zonder dat het tussenwoord wordt geconsumeerd.
  return input.replace(/(\S)[ \t]+—[ \t]+(?=\S)/g, '$1, ');
}

type MdastHeading = {
  type: string;
  depth?: number;
  children?: Array<{ type: string; value?: string; children?: unknown[] }>;
  data?: { hProperties?: Record<string, unknown> };
};

// LAT-1118: rendert markdown én levert de inhoudsopgave (h2/h3) in één pass,
// zodat de toc-ids gegarandeerd matchen met de ids in de gerenderde HTML.
export async function markdownToHtmlWithToc(
  markdown: string,
  options: MarkdownOptions = {},
): Promise<{ html: string; toc: TocItem[] }> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const { raw } = await import('hast-util-raw');
  const { gfm } = await import('micromark-extension-gfm');
  const { gfmFromMarkdown } = await import('mdast-util-gfm');
  // LAT-1675: GFM-extensies aanzetten (tabellen, autolink-literal, strikethrough,
  // task-list, footnotes). Zonder dit rendert een pipe-tabel als rauwe tekst.
  const mdast = fromMarkdown(normalizeEmDashes(markdown), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as { children: MdastHeading[] };
  if (options.stripFirstH1) {
    // De layout levert de pagina-H1 al; een H1 in de body is altijd een
    // titel-duplicaat. Strip de eerste H1 ongeacht positie, zodat een
    // voorafgaand intro-/disclosure-blok (bv. een **Affiliate:**-melding) de
    // strip niet omzeilt en er geen dubbele H1 op de pagina komt.
    const h1Idx = mdast.children.findIndex(
      (node) => node.type === 'heading' && node.depth === 1,
    );
    if (h1Idx >= 0) {
      mdast.children.splice(h1Idx, 1);
    }
  }
  const slug = makeSlugger();
  const toc: TocItem[] = [];
  for (const node of mdast.children) {
    if (node.type !== 'heading' || (node.depth !== 2 && node.depth !== 3)) continue;
    const text = headingText(node);
    if (!text) continue;
    const id = slug(text);
    node.data = node.data ?? {};
    node.data.hProperties = { ...(node.data.hProperties ?? {}), id };
    toc.push({ id, text, depth: node.depth });
  }
  // LAT-2030/VIS-BL-02: sta redactionele `<figure>`-beeldblokken uit de CMS-body toe.
  // `allowDangerousHtml` bewaart de ruwe HTML als raw-nodes, `hast-util-raw` parseert
  // ze naar echte hast-elementen (o.a. <figure>/<figcaption>). `scrubHast` verwijdert
  // daarna gevaarlijke tags/attributen zodat het aanzetten van ruwe HTML geen
  // script-injectie op de site-brede CMS-bodies mogelijk maakt (interne auteurs,
  // geen publieke input, dus denylist volstaat; strikte allowlist = follow-up).
  const rawHast = raw(
    toHast(mdast as Parameters<typeof toHast>[0], { allowDangerousHtml: true }) as Parameters<typeof raw>[0],
  );
  scrubHast(rawHast as HastParent);
  return { html: toHtml(rawHast as Parameters<typeof toHtml>[0]), toc };
}

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};
type HastParent = { children?: HastNode[] };

// LAT-2030: tags die nooit uit een CMS-body mogen renderen.
const SCRUB_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'link', 'meta', 'base', 'title', 'noscript',
  'svg', 'math', 'template', 'frame', 'frameset', 'applet', 'portal',
]);
// Attributen die een URL dragen; niet-http(s)/mailto/relatieve schema's worden gestript.
const SCRUB_URL_ATTRS = new Set([
  'href', 'src', 'srcset', 'xlink:href', 'action', 'formaction', 'poster', 'background',
]);

// Verwijder gevaarlijke elementen/attributen in-place uit de geparste hast-boom.
function scrubHast(parent: HastParent): void {
  if (!Array.isArray(parent.children)) return;
  parent.children = parent.children.filter((node) => {
    if (node.type !== 'element' || !node.tagName) return true;
    if (SCRUB_TAGS.has(node.tagName.toLowerCase())) return false;
    const props = node.properties;
    if (props) {
      for (const key of Object.keys(props)) {
        const lower = key.toLowerCase();
        if (lower.startsWith('on')) {
          delete props[key];
          continue;
        }
        if (SCRUB_URL_ATTRS.has(lower)) {
          const val = String(props[key] ?? '');
          if (/^\s*(?:javascript|vbscript):/i.test(val)) delete props[key];
          else if (/^\s*data:/i.test(val) && !/^\s*data:image\//i.test(val)) delete props[key];
        }
      }
    }
    scrubHast(node as HastParent);
    return true;
  });
}

export async function markdownToHtml(markdown: string, options: MarkdownOptions = {}): Promise<string> {
  return (await markdownToHtmlWithToc(markdown, options)).html;
}
