/** Presentation-only enhancement of CMS infographic directives. */
export interface InfographicNode {
  type: string;
  value?: string;
  children?: InfographicNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}
const plain = (node: InfographicNode): string => node.value ?? (node.children ?? []).map(plain).join('');
const text = (value: string): InfographicNode => ({ type: 'text', value });
const element = (tag: string, className: string, children: InfographicNode[]): InfographicNode => ({
  type: 'paragraph', children, data: { hName: tag, hProperties: { className: [className] } },
});
function icon(label: string): string {
  if (/druif|druiven|grape/i.test(label)) return 'grapes';
  if (/bodem|soil|hoogte|altitude|helling|slope/i.test(label)) return 'land';
  if (/proeven|tasting|stijl|style|appellat|rijping|ageing|aging/i.test(label)) return 'wine';
  if (/basis|base/i.test(label)) return 'home';
  if (/route|afstand|distance/i.test(label)) return 'pin';
  return 'info';
}
/** Only recognise two explicit connected legs; never guess towns or distances. */
function journey(label: string, value: InfographicNode): InfographicNode | null {
  if (!/^(afstanden|distances)$/i.test(label.trim())) return null;
  // Rich content stays intact as a normal fact, including links and annotations.
  if (value.children?.some(child => child.type !== 'text')) return null;
  const match = plain(value).match(/^(.+?) (?:tot|to) (.+?) ((?:±|~|ca\. ?|about )?\d+(?:[.,]\d+)? km), (.+?) (?:tot|to) (.+?) ((?:±|~|ca\. ?|about )?\d+(?:[.,]\d+)? km)$/i);
  if (!match || match[2] !== match[4]) return null;
  const stops = [match[1], match[2], match[5]];
  const distances = [match[3], match[6]];
  const stopNodes = stops.map((stop, index) => {
    const content = [text(stop)];
    if (distances[index]) content.push(element('span', 'route-infographic__distance', [text(distances[index])]));
    return element('li', 'route-infographic__stop', content);
  });
  return element('div', 'route-infographic__route', [
    element('p', 'route-infographic__label', [text(label)]),
    element('ol', 'route-infographic__journey', stopNodes),
  ]);
}

export function enhanceInfographic(children: InfographicNode[]): InfographicNode[] {
  return children.flatMap((node, index) => {
    if (node.type === 'paragraph' && index === children.length - 1 && node.children?.[0]?.type === 'strong') {
      return [element('div', `route-infographic__note route-infographic__note--${icon(plain(node.children[0]))}`, [node])];
    }
    if (node.type !== 'table' || !node.children?.length) return [node];
    const [header, ...rows] = node.children;
    const labels = (header.children ?? []).map(cell => plain(cell).trim().toLowerCase());
    const recognised = ['', 'kenmerk|waarde', 'feature|value', 'onderdeel|gegeven', 'item|detail', '|'].includes(labels.join('|'));
    if (labels.length !== 2 || !recognised || !rows.length || rows.some(row => row.children?.length !== 2 || !plain(row.children[0]).trim())) return [node];
    const routes: InfographicNode[] = [];
    const facts: InfographicNode[] = [];
    for (const row of rows) {
      const [key, value] = row.children!;
      const label = plain(key).trim();
      const route = journey(label, value);
      if (route) { routes.push(route); continue; }
      facts.push(element('div', `route-infographic__fact route-infographic__fact--${icon(label)}`, [
        element('dt', 'route-infographic__term', key.children ?? []),
        element('dd', 'route-infographic__value', value.children ?? []),
      ]));
    }
    return [...routes, ...(facts.length ? [element('dl', 'route-infographic__facts', facts)] : [])];
  });
}
