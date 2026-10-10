/** Enhance explicit CMS section structures without rewriting copy or inferring facts. */
type Node = {type:string;tagName?:string;properties?:Record<string,unknown>;children?:Node[];value?:string};
const text=(n:Node):string=>n.value??(n.children??[]).map(text).join('');
const cls=(n:Node,c:string)=>{n.properties??={};const v=n.properties.className;n.properties.className=[...(Array.isArray(v)?v:v?[v]:[]),c];};
const box=(c:string,children:Node[]):Node=>({type:'element',tagName:'div',properties:{className:[c]},children});
const heading=(n:Node)=>/^h[1-6]$/.test(n.tagName??'');
const meaningful=(n:Node)=>n.type!=='text'||Boolean(n.value?.trim());
function lead(n:Node):Node|undefined {
 if(n.tagName!=='p')return;
 const first=n.children?.find(meaningful);
 return first?.tagName==='strong' && text(first).trim().length<150 ? first:undefined;
}
function practical(label:string):string|null {
 if(/^(aanreis\b|hoe kom je er\b|vervoer\b|bereikbaarheid\b|getting (?:there|around)\b|how to get there\b|transport\b|arrival\b)/i.test(label))return 'car';
 if(/^(beste (?:periode|reistijd)\b|best (?:time|season)\b|when to (?:go|visit)\b)/i.test(label))return 'calendar';
 if(/^(reserveren\b|reserveringen\b|reservations\b|bookings?\b|how to book\b|when to book\b)/i.test(label))return 'ticket';
 if(/^(praktisch\b|praktische (?:informatie|planning)\b|practical\b|logistiek\b|logistics\b)/i.test(label))return 'info';
 return null;
}
export function enhanceArticleVisualBlocks(root:Node):void {
 const source=root.children??[];const out:Node[]=[];
 for(let i=0;i<source.length;i++) {
  const h=source[i];out.push(h);
  if(!heading(h))continue;
  const label=text(h).trim();
  const day=/^(?:dag(?:en)?|days?)\s+\d+(?:\s*[–-]\s*\d+)?\s*[:,.]/i.test(label);
  const tasting=/^(?:waar (?:je|te) proeft?|where to taste|proefadressen|tasting addresses)\s*[?.:]?$/i.test(label);
  const icon=practical(label);
  if(!day&&!tasting&&!icon)continue;
  let end=i+1;while(end<source.length&&!heading(source[end]))end++;
  const body=source.slice(i+1,end);
  if(!body.some(meaningful))continue;
  if(day) {
   cls(h,'article-day-heading');
   const items:Node[]=[];
   for(const n of body) {
    const title=lead(n);
    if(title){cls(title,'article-stop-title');items.push(box('article-day-stop',[n]));}
    else items.push(n);
   }
   out.push(box('article-day-body',items));
  } else if(tasting) {
   // An explicit tasting heading plus two named paragraphs is required.
   if(body.filter(n=>lead(n)).length<2)continue;
   cls(h,'article-tasting-heading');
   const items:Node[]=[];
   for(const n of body) {
    const title=lead(n);
    if(title){cls(title,'article-address-title');items.push(box('article-address-card',[n]));}
    else if(['figure','img'].includes(n.tagName??'') || (n.tagName==='p'&&n.children?.some(c=>c.tagName==='img'))) {
     const last=items.filter(meaningful).at(-1);
     if(Array.isArray(last?.properties?.className)&&last.properties.className.includes('article-address-card'))last.children!.push(n);else items.push(n);
    } else items.push(n);
   }
   out.push(box('article-addresses',items));
  } else {
   cls(h,'article-practical-heading');cls(h,`article-icon--${icon}`);
   out.push(box('article-practical-body',body));
  }
  i=end-1;
 }
 root.children=out;
}
