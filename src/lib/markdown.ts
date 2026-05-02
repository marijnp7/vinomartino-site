export async function markdownToHtml(markdown: string): Promise<string> {
  const { fromMarkdown } = await import('mdast-util-from-markdown');
  const { toHast } = await import('mdast-util-to-hast');
  const { toHtml } = await import('hast-util-to-html');
  const mdast = fromMarkdown(markdown);
  const hast = toHast(mdast);
  return toHtml(hast as Parameters<typeof toHtml>[0]);
}
