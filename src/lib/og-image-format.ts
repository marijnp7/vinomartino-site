// LAT-4988: social scrapers (Facebook, LinkedIn, X, Slack) renderen geen vector-
// beeld. Een `og:image` die naar een SVG wijst levert dus helemaal géén deelkaart
// op — niet een lelijke, maar geen. De auteurspagina's liepen hier tegenaan: de
// auteurs-avatars zijn SVG (`marijn.svg`), en AuteurDetail/AuteursIndex gaven die
// door als `ogImage`.
//
// Vandaar deze guard: alleen een raster-formaat mag de keten in; al het andere
// valt terug op `/og-default.png` (de merkkaart uit LAT-4755). Dat is dezelfde
// fallback die pagina's zonder eigen beeld al kregen, dus geen nieuw gedrag —
// alleen een extra reden om hem te gebruiken.
//
// De check kijkt naar de extensie, niet naar het bestand zelf: de waarde kan een
// externe URL zijn die wij niet kunnen inlezen, en een verkeerde extensie is
// sowieso al reden genoeg om de scraper niet te vertrouwen. Een querystring mag
// er achter staan (`/foo.png?v=2`), een fragment ook.

const RASTER_EXTENSION = /\.(jpe?g|png|webp|gif)(?:$|[?#])/i;

/**
 * Is dit een og:image die een scraper daadwerkelijk als kaart kan renderen?
 * `false` voor SVG, voor extensieloze paden en voor lege waarden.
 */
export function isRasterImageFormat(url?: string | null): boolean {
    if (!url) return false;
    return RASTER_EXTENSION.test(url);
}
