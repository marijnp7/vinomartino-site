interface MarkdownOptions {
  stripFirstH1?: boolean;
}

export async function markdownToHtml(markdown: string, options: MarkdownOptions = {}): Promise<string> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const mdast = fromMarkdown(markdown) as { children: Array<{ type: string; depth?: number }> };
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
