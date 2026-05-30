interface MarkdownOptions {
  stripFirstH1?: boolean;
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

export async function markdownToHtml(markdown: string, options: MarkdownOptions = {}): Promise<string> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const mdast = fromMarkdown(normalizeEmDashes(markdown)) as { children: Array<{ type: string; depth?: number }> };
  if (options.stripFirstH1) {
    const firstIdx = mdast.children.findIndex((node) => node.type !== 'thematicBreak');
    if (firstIdx >= 0) {
      const first = mdast.children[firstIdx];
      if (first.type === 'heading' && first.depth === 1) {
        mdast.children.splice(firstIdx, 1);
      }
    }
  }
  const hast = toHast(mdast as Parameters<typeof toHast>[0]);
  return toHtml(hast as Parameters<typeof toHtml>[0]);
}
