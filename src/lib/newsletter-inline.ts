// LAT-12560 (zet 5, taak 5.3) — nieuwsbrief-CTA na de eerste sectie van een clusterpagina.
// Splitst de gerenderde body vlak voor de tweede <h2>, zodat de CTA na de intro en de
// eerste sectie staat. Zonder tweede <h2> valt de split na de tweede alinea; zonder
// alinea's komt alles in `head` en staat de CTA onder de tekst.
export function splitAfterFirstSection(html: string): { head: string; tail: string } {
  const h2 = [...html.matchAll(/<h2[\s>]/g)];
  if (h2.length >= 2) {
    const at = h2[1].index as number;
    return { head: html.slice(0, at), tail: html.slice(at) };
  }
  const closers = [...html.matchAll(/<\/p>/g)];
  if (closers.length >= 2) {
    const at = (closers[1].index as number) + '</p>'.length;
    return { head: html.slice(0, at), tail: html.slice(at) };
  }
  return { head: html, tail: '' };
}
