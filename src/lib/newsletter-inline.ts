// LAT-12560/12572 — nieuwsbrief-CTA na de eerste sectie van een clusterpagina.
// Splitst de gerenderde body vlak voor de tweede <h2>. Zonder tweede <h2> is er geen echte
// eerste sectie: `found` is false, alles blijft in `head` en de CTA wordt niet gerenderd
// (de footer-CTA dekt die pagina's).
export function splitAfterFirstSection(html: string): { head: string; tail: string; found: boolean } {
  const h2 = [...html.matchAll(/<h2[\s>]/g)];
  if (h2.length < 2) return { head: html, tail: '', found: false };
  const at = h2[1].index as number;
  return { head: html.slice(0, at), tail: html.slice(at), found: true };
}
