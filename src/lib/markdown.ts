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
  const { gfm } = await import('micromark-extension-gfm');
  const { gfmFromMarkdown } = await import('mdast-util-gfm');
  // LAT-1675: GFM-extensies aanzetten (tabellen, autolink-literal, strikethrough,
  // task-list, footnotes). Zonder dit rendert een pipe-tabel als rauwe tekst.
  const mdast = fromMarkdown(normalizeEmDashes(markdown), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as { children: MdastHeading[] };
  return mdastToHtmlWithToc(mdast, options);
}

// LAT-2270: gedeelde tweede helft van de pipeline — H1-strip, kop-ids/toc, raw-HTML
// (`allowDangerousHtml`) + default-deny sanitize. Losgetrokken zodat de route-body
// directive-renderer (route-body.ts) exact dezelfde sanitize/toc-pas hergebruikt op
// een reeds geparste (en directive-getransformeerde) mdast-boom.
export async function mdastToHtmlWithToc(
  mdast: { children: MdastHeading[] },
  options: MarkdownOptions = {},
): Promise<{ html: string; toc: TocItem[] }> {
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const { raw } = await import('hast-util-raw');
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
  // LAT-2030/2034/VIS-BL-02: sta redactionele `<figure>`-beeldblokken uit de CMS-body toe.
  // `allowDangerousHtml` bewaart de ruwe HTML als raw-nodes, `hast-util-raw` parseert
  // ze naar echte hast-elementen (o.a. <figure>/<figcaption>). `sanitizeHast` past
  // daarna een strikte allowlist (default-deny) toe zodat het aanzetten van ruwe HTML
  // op de site-brede CMS-bodies geen script-injectie of onbekende/toekomstige tags
  // toelaat: alleen bekende, veilige markdown-/figure-tags + allowlist-attributen
  // overleven.
  const rawHast = raw(
    toHast(mdast as Parameters<typeof toHast>[0], { allowDangerousHtml: true }) as Parameters<typeof raw>[0],
  );
  sanitizeHast(rawHast as HastParent);
  return { html: toHtml(rawHast as Parameters<typeof toHtml>[0]), toc };
}

type HastNode = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
};
type HastParent = { children?: HastNode[] };

// LAT-2034 (Optie 3): tags die uit onze markdown-pipeline of uit redactionele
// `<figure>`-beeldblokken mogen komen. Alles buiten deze allowlist wordt
// weggehaald (default-deny). GEEN nieuwe dependency: de mdast/hast-stack is
// transitive-only in package.json, dus `hast-util-sanitize` erbij zou een clean
// install vergen die de gedeelde build riskeert — deze in-house allowlist levert
// dezelfde default-deny-posture zonder dat risico.
const ALLOWED_TAGS = new Set([
  // structuur & tekst
  'p', 'br', 'hr', 'blockquote', 'pre', 'code', 'span', 'div', 'section',
  'aside', 'header', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // lijsten
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // inline nadruk / semantiek
  'strong', 'em', 'b', 'i', 's', 'del', 'ins', 'sub', 'sup', 'mark', 'small',
  'abbr', 'u', 'q', 'cite', 'kbd', 'samp', 'var', 'time', 'wbr',
  // links
  'a',
  // beeld & figuren
  'img', 'figure', 'figcaption', 'picture', 'source',
  // tabellen
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
]);

// Tags die volledig (inclusief hun subtree) verwijderd worden, nooit uitgepakt.
const DANGEROUS_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button',
  'textarea', 'select', 'option', 'optgroup', 'label', 'fieldset', 'legend',
  'link', 'meta', 'base', 'title', 'head', 'html', 'body', 'noscript',
  'svg', 'math', 'template', 'slot', 'frame', 'frameset', 'applet', 'portal',
  'audio', 'video', 'track', 'canvas', 'map', 'area', 'dialog',
]);

// Attributen die op elk toegestaan element mogen staan. `className` is de
// hast/JSX-propertynaam voor `class` (hast-util-raw camelCaset bekende attrs).
// `ariaLabel`/`arialabel` = hast-camelCase-vorm van `aria-label` (regio-labels op <aside>).
const GLOBAL_ATTRS = new Set(['id', 'class', 'classname', 'title', 'lang', 'dir', 'role', 'aria-label', 'arialabel']);
// Per-tag toegestane attributen, naast de globale.
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel', 'name']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding', 'fetchpriority', 'srcset', 'sizes']),
  source: new Set(['src', 'srcset', 'sizes', 'media', 'type', 'width', 'height']),
  ol: new Set(['start', 'type', 'reversed']),
  li: new Set(['value']),
  th: new Set(['colspan', 'rowspan', 'scope', 'headers', 'abbr']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
  time: new Set(['datetime']),
  q: new Set(['cite']),
  blockquote: new Set(['cite']),
};
// Attributen die een URL dragen en op schema gecontroleerd worden.
const URL_ATTRS = new Set(['href', 'src', 'poster', 'cite']);

// LAT-2034: laat alleen veilige URL-schema's door. Relatieve paden, fragmenten,
// mailto/tel en http(s) zijn oké; `data:` alleen voor afbeeldingen; javascript:/
// vbscript:/file: en overige schema's worden geweigerd.
function isSafeUrl(value: string): boolean {
  const v = value.trim();
  if (v === '') return true;
  if (/^(?:javascript|vbscript|file):/i.test(v)) return false;
  if (/^data:/i.test(v)) return /^data:image\//i.test(v);
  // Expliciet schema? Alleen bekend-veilige toestaan. Anders (relatief pad,
  // #fragment, ./ ../, protocol-relatief) is het geen scriptvector → toestaan.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return /^(?:https?|mailto|tel):/i.test(v);
  return true;
}

// `srcset` bevat meerdere kandidaat-URL's (`url 1x, url 2x`); valideer ze allemaal.
function isSafeSrcset(value: string): boolean {
  return value.split(',').every((part) => isSafeUrl(part.trim().split(/\s+/)[0] ?? ''));
}

// Filter de attributen van een toegestaan element tegen de allowlist.
function sanitizeAttrs(tagName: string, props: Record<string, unknown>): Record<string, unknown> {
  const allowed = TAG_ATTRS[tagName];
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(props)) {
    const lower = key.toLowerCase();
    if (lower.startsWith('on')) continue; // event-handlers nooit
    if (lower === 'style') continue; // inline styles blokkeren; styling via class
    // data-*/aria-* zijn inert; hast levert ze camelCase aan (`dataFoo`/`ariaLabel`),
    // dus matchen we zowel de kebab- (`data-foo`) als de camelCase-vorm.
    if (/^(?:data-?|aria-?)/.test(lower)) { out[key] = val; continue; }
    if (!GLOBAL_ATTRS.has(lower) && !allowed?.has(lower)) continue;
    if (lower === 'srcset') { if (isSafeSrcset(String(val ?? ''))) out[key] = val; continue; }
    if (URL_ATTRS.has(lower)) { if (isSafeUrl(String(val ?? ''))) out[key] = val; continue; }
    out[key] = val;
  }
  // Externe `target=_blank`-links krijgen een veilige `rel` (reverse-tabnabbing).
  if (tagName === 'a' && out.target === '_blank') {
    const rel = String(out.rel ?? '');
    if (!/noopener/i.test(rel)) out.rel = (rel ? `${rel} ` : '') + 'noopener noreferrer';
  }
  return out;
}

// LAT-2034: strikte allowlist-sanitizer (Optie 3, default-deny). Gevaarlijke tags
// worden met subtree verwijderd; onbekende maar niet-gevaarlijke tags worden
// uitgepakt zodat tekstinhoud nooit stil verdwijnt; toegestane tags houden alleen
// hun allowlist-attributen over.
function sanitizeHast(parent: HastParent): void {
  if (!Array.isArray(parent.children)) return;
  const result: HastNode[] = [];
  for (const node of parent.children) {
    if (node.type !== 'element' || !node.tagName) {
      result.push(node);
      continue;
    }
    const tag = node.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag)) continue; // element + subtree verwijderen
    sanitizeHast(node as HastParent); // kinderen eerst opschonen
    if (!ALLOWED_TAGS.has(tag)) {
      // Onbekend maar niet gevaarlijk: uitpakken, kinderen behouden.
      if (Array.isArray(node.children)) result.push(...node.children);
      continue;
    }
    node.properties = sanitizeAttrs(tag, node.properties ?? {});
    result.push(node);
  }
  parent.children = result;
}

export async function markdownToHtml(markdown: string, options: MarkdownOptions = {}): Promise<string> {
  return (await markdownToHtmlWithToc(markdown, options)).html;
}
