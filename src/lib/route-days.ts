// LAT-2005 [VIS-BL-06] — splitst een gerenderde route-body in visuele dag-blokken.
//
// Routebody's volgen de redactionele conventie `## Dag N: <etappe>` (zie o.a.
// etna-noord, mosel-bernkastel). De markdown-renderer (LAT-1118) geeft elke H2 een
// stabiel `id`, dus we kunnen de body op H2-grenzen splitsen en de dag-koppen eruit
// lichten. Puur en dependency-vrij: geen VIS-BL-13 datastructuur nodig. Bij minder
// dan twee `Dag N`-koppen valt de pagina terug op de bestaande proza (geen regressie
// op routes zonder dag-structuur, bv. douro-tejo/priorat).

export interface RouteDay {
  /** "Dag 1", "Dag 2", … — afgeleid van de kop. */
  label: string;
  /** Etappe/titel na het dag-nummer, bv. "Barolo-gemeente". Kan leeg zijn. */
  title: string;
  /** Slug-anchor van de oorspronkelijke H2, voor deeplinks vanuit de dag-strip. */
  anchor: string;
  /** Dag-nummer als integer, voor sortering/telling. */
  n: number;
}

export interface RouteSegment {
  kind: 'prose' | 'day';
  /** Bij 'day': de body ná de H2-kop. Bij 'prose': het hele fragment. */
  html: string;
  day?: RouteDay;
}

export interface RouteBodySplit {
  /** True zodra er ≥2 dag-blokken zijn; anders rendert de pagina de proza ongewijzigd. */
  hasDays: boolean;
  segments: RouteSegment[];
  days: RouteDay[];
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, '’')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// LAT-2431: een dag-titel mag nooit met een los leesteken beginnen of eindigen.
// Wanneer het plaats-veld leeg is (Directus) rendert de bron een kop als
// "Dag 1: , Bernkastel en de Doktor" → titel ", Bernkastel …". Strip separators
// aan beide randen zodat de kop fail-safe is, ongeacht de data. Interne leestekens
// (bv. "Bernkastel-Kues", "Hemel-en-Aarde") blijven ongemoeid.
export function stripEdgeSeparators(s: string): string {
  return s.replace(/^[\s,;:·./–—-]+/, '').replace(/[\s,;:·./–—-]+$/, '');
}

export function splitRouteBody(bodyHtml: string): RouteBodySplit {
  const empty: RouteBodySplit = { hasDays: false, segments: [], days: [] };
  if (!bodyHtml || !bodyHtml.trim()) return empty;

  // Splits vóór elke H2, zodat elk fragment ofwel intro-proza is (vóór de eerste H2)
  // ofwel begint met een H2-sectie tot aan de volgende H2.
  const parts = bodyHtml.split(/(?=<h2\b)/i).filter((p) => p.trim() !== '');
  const segments: RouteSegment[] = [];
  const days: RouteDay[] = [];

  for (const part of parts) {
    const headMatch = part.match(/^<h2\b([^>]*)>([\s\S]*?)<\/h2>/i);
    if (headMatch) {
      const attrs = headMatch[1];
      const headInner = headMatch[2];
      const text = decodeEntities(stripTags(headInner));
      // "Dag 1", "Dag 2:", "Dag 3 —", "Dag 4: vertrekdag" enz.
      const dayMatch = text.match(/^dag\s*(\d+)\b\s*[:.–—-]?\s*(.*)$/i);
      if (dayMatch) {
        const idMatch = attrs.match(/\bid="([^"]+)"/i);
        const n = Number(dayMatch[1]);
        const anchor = idMatch ? idMatch[1] : `dag-${n}`;
        const day: RouteDay = {
          label: `Dag ${n}`,
          title: stripEdgeSeparators(dayMatch[2]),
          anchor,
          n,
        };
        days.push(day);
        // Body = alles ná de H2-kop; de kop rendert de pagina zelf als kaart-header.
        const body = part.slice(headMatch[0].length);
        segments.push({ kind: 'day', html: body, day });
        continue;
      }
    }
    segments.push({ kind: 'prose', html: part });
  }

  return { hasDays: days.length >= 2, segments, days };
}
