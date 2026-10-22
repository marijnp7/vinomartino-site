/** Presentation for CMS article tables. Content and rich inline nodes stay intact. */
type Node = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: Node[]; value?: string };
const elements = (n: Node, tag?: string) => (n.children ?? []).filter(c => c.type === 'element' && (!tag || c.tagName === tag));
const text = (n: Node): string => n.value ?? (n.children ?? []).map(text).join('');
const addClass = (n: Node, value: string) => {
 n.properties ??= {};
 const old = n.properties.className;
 n.properties.className = [...(Array.isArray(old) ? old : old ? [old] : []), value];
};
export function enhanceArticleTables(parent: Node): void {
 parent.children = parent.children?.map(node => {
  if (node.tagName !== 'table') { enhanceArticleTables(node); return node; }
  const heads = elements(node, 'thead');
  const headerRows = heads.flatMap(h => elements(h, 'tr'));
  const headers = headerRows.length === 1 ? elements(headerRows[0]) : [];
  const bodies = elements(node, 'tbody');
  const rows = bodies.flatMap(b => elements(b, 'tr'));
  const cols = headers.length;
  const simple = cols >= 2 && rows.length > 0 && rows.every(r => elements(r).length === cols) &&
   [...headers, ...rows.flatMap(r => elements(r))].every(c => !c.properties?.colSpan && !c.properties?.rowSpan && !elements(c, 'table').length);
  const labels = headers.map(text).map(s => s.trim());
  const comparison = simple && cols === 3 && !labels[0] && labels.slice(1).every(Boolean);
  // Twee kolommen = feitenlijst (wat/details): blijft op mobiel een tabel, geen kaarten.
  const facts = simple && cols === 2 && labels.every(Boolean);
  const cards = simple && cols >= 3 && labels.every(Boolean);
  addClass(node, 'editorial-table');
  if (comparison) addClass(node, 'editorial-table--comparison');
  if (cards) addClass(node, 'editorial-table--cards');
  if (facts) addClass(node, 'editorial-table--facts');
  node.properties = {...node.properties, role:'table'};
  for (const group of [...heads, ...bodies]) group.properties = {...group.properties,role:'rowgroup'};
  for (const row of [...headerRows, ...rows]) row.properties = {...row.properties,role:'row'};
  for (const h of headers) h.properties = {...h.properties, scope:'col',role:'columnheader'};
  if (simple) for (const row of rows) {
   elements(row).forEach((cell,index) => {
    cell.properties = {...cell.properties,role:index===0?'rowheader':'cell'};
    if (index===0) {cell.tagName='th';cell.properties.scope='row';}
    if (cards && index>0) cell.children = [
     {type:'element',tagName:'span',properties:{className:['editorial-table__mobile-label'],ariaHidden:'true'},children:[{type:'text',value:labels[index]}]},
     ...(cell.children ?? []),
    ];
   });
  }
  return {type:'element',tagName:'div',properties:{className:['editorial-table-wrap'],tabIndex:0},children:[node]};
 });
}
