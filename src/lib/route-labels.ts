// LAT-13075 — routes.style en routes.duration zijn vertaalbare CMS-velden, maar
// van de meeste routes ontbreekt de EN-waarde, waardoor /en/ (zoekindex, kaarten,
// statstrip) de NL-bron toont: "gemiddeld · 5 dagen". Het niveau is een vaste
// woordenlijst en de duur een telling; die vertalen we via ui_strings (NL/EN in
// Directus), zonder de bron te wijzigen. NL blijft de CMS-waarde letterlijk.
// Vrije tekst ("Riesling van steile leisteen") laten we staan: dat is een
// ontbrekende EN-vertaling in het CMS, geen label.

type T = (key: string) => string;

const NIVEAU: Record<string, 'makkelijk' | 'gemiddeld' | 'uitdagend'> = {
    makkelijk: 'makkelijk', gemakkelijk: 'makkelijk', eenvoudig: 'makkelijk', laag: 'makkelijk', easy: 'makkelijk',
    gemiddeld: 'gemiddeld', matig: 'gemiddeld', moderate: 'gemiddeld', medium: 'gemiddeld',
    uitdagend: 'uitdagend', moeilijk: 'uitdagend', zwaar: 'uitdagend', challenging: 'uitdagend', hard: 'uitdagend',
};

export function localizeRouteStyle(style: string, locale: string, t: T): string {
    if (locale === 'nl' || !style) return style;
    const key = NIVEAU[style.trim().toLowerCase()];
    return key ? t(`route.niveau.${key}`) : style;
}

const DUUR_NL = /^\s*(\d+)\s+dag(?:en)?(?:\s*,\s*(\d+)\s+nacht(?:en)?)?\s*$/i;

export function localizeRouteDuration(duration: string, locale: string, t: T): string {
    if (locale === 'nl' || !duration) return duration;
    const m = DUUR_NL.exec(duration);
    if (!m) return duration;
    const dagen = Number(m[1]);
    let out = t(dagen === 1 ? 'route.duur.dag' : 'route.duur.dagen').replace('{n}', String(dagen));
    if (m[2]) {
        const nachten = Number(m[2]);
        out += ', ' + t(nachten === 1 ? 'route.duur.nacht' : 'route.duur.nachten').replace('{n}', String(nachten));
    }
    return out;
}

// LAT-13075 — landen.continent is een NL-woordenlijst zonder EN-vertaling in het
// CMS; de EN-zoekindex toonde daardoor "Europa". Weergave via ui_strings, de
// bron blijft ongewijzigd. Onbekende waarden blijven letterlijk staan.
const CONTINENT: Record<string, string> = {
    europa: 'europa', europe: 'europa',
    afrika: 'afrika', africa: 'afrika',
    'noord-amerika': 'noord-amerika', 'north america': 'noord-amerika',
    'zuid-amerika': 'zuid-amerika', 'south america': 'zuid-amerika',
    'azië': 'azie', azie: 'azie', asia: 'azie',
    'oceanië': 'oceanie', oceanie: 'oceanie', oceania: 'oceanie',
};

export function localizeContinent(continent: string, locale: string, t: T): string {
    if (locale === 'nl' || !continent) return continent;
    const key = CONTINENT[continent.trim().toLowerCase()];
    return key ? t(`continent.${key}`) : continent;
}
