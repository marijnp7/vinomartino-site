// LAT-4907: `og:image:width`/`og:image:height` moeten het bestand beschrijven dat
// we werkelijk serveren. Ze stonden als literals `1200`/`630` in SiteLayout — de
// maat van `/og-default.png` — waardoor elke pagina met een echt beeld een
// verkeerde ratio declareerde (gemeten: 1200x630 gedeclareerd tegen 1600x637
// geserveerd, op 511 van de 555 live-URLs).
//
// We meten daarom het bestand onder `public/` tijdens de build. Dat gebeurt op
// één plek — in SiteLayout, waar het beeld ook gekozen wordt — zodat de meting
// automatisch de hele keten `og_image -> hero_image -> og-default.png` dekt en
// niet per content-type opnieuw gewired hoeft te worden.
//
// Lukt meten niet (SVG, onbekend formaat, bestand nog niet weggeschreven), dan
// rendert SiteLayout de twee tags niet. Beide zijn optioneel in de OG-spec en
// géén tag is beter dan een foute (LAT-4907, optie 2).

export interface ImageDimensions {
    width: number;
    height: number;
}

// Bewust module-scope: SiteLayout rendert 555+ pagina's per build en veel
// pagina's delen hetzelfde og-beeld (228 distinct assets op 555 URL's).
const cache = new Map<string, ImageDimensions | null>();

// SOF-markers dragen een frame-header met de afmetingen. 0xC4 (DHT), 0xC8 (JPG)
// en 0xCC (DAC) vallen binnen hetzelfde bereik maar zijn géén SOF.
function isStartOfFrame(marker: number): boolean {
    return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

export function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    let pos = 2; // achter de SOI-marker
    while (pos + 9 <= buffer.length) {
        if (buffer[pos] !== 0xff) {
            pos++; // fill-byte of desync: schuif door tot de volgende marker
            continue;
        }
        const marker = buffer[pos + 1];
        // 0xFF-padding voor een marker is toegestaan.
        if (marker === 0xff) {
            pos++;
            continue;
        }
        // TEM (0x01), RSTn (0xD0-0xD7), SOI (0xD8) en EOI (0xD9) hebben geen
        // lengteveld; ze mogen dus niet als segment worden overgeslagen.
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
            pos += 2;
            continue;
        }
        if (isStartOfFrame(marker)) {
            return {
                height: buffer.readUInt16BE(pos + 5),
                width: buffer.readUInt16BE(pos + 7),
            };
        }
        const segmentLength = buffer.readUInt16BE(pos + 2);
        // Een lengte < 2 zou pos niet vooruit bewegen: corrupt, stop meteen in
        // plaats van eindeloos door de buffer te lopen.
        if (segmentLength < 2) return null;
        pos += 2 + segmentLength;
    }
    return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngDimensions(buffer: Buffer): ImageDimensions | null {
    if (buffer.length < 24) return null;
    if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
    // IHDR is per spec de eerste chunk; breedte/hoogte staan direct erachter.
    if (buffer.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width === 0 || height === 0) return null;
    return { width, height };
}

export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
    return readPngDimensions(buffer) ?? readJpegDimensions(buffer);
}

/**
 * Meet een beeld dat we zelf serveren, aan de hand van zijn site-pad
 * (bijv. `/images/articles/<id>.jpg`). Alleen lokale, absolute paden: een
 * externe URL kunnen we tijdens de build niet betrouwbaar meten en willen we
 * ook niet ophalen.
 */
export async function getPublicImageDimensions(sitePath: string | null | undefined): Promise<ImageDimensions | null> {
    if (!sitePath || !sitePath.startsWith('/') || sitePath.startsWith('//')) return null;
    const cached = cache.get(sitePath);
    if (cached !== undefined) return cached;

    let result: ImageDimensions | null = null;
    try {
        const { readFileSync } = await import('node:fs');
        const { join, normalize } = await import('node:path');
        const publicDir = join(process.cwd(), 'public');
        // normalize + prefix-check houdt `../`-paden binnen public/.
        const fullPath = normalize(join(publicDir, sitePath));
        if (fullPath.startsWith(publicDir)) {
            result = readImageDimensions(readFileSync(fullPath));
        }
    } catch {
        result = null; // bestand ontbreekt of is onleesbaar: tags weglaten
    }
    cache.set(sitePath, result);
    return result;
}
