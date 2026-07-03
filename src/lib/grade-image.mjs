// Meegereisd Warm - de vaste kleur-grading preset voor de hele VinoMartino-beeldbank.
// Bron/spec: DESIGN_GUIDELINES.md § 5 / § 5a (VIS-STRAT-01). Operationeel: VIS-BL-08 / LAT-2007.
//
// Enige bron van waarheid voor de preset. Zowel het CLI-script
// (scripts/grade-meegereisd-warm.mjs) als de build-time DAM-loaders (src/lib/*.ts)
// gebruiken deze module, zodat elk beeld exact dezelfde grading krijgt.
//
// Licht en niet-destructief: warme balans, opgetilde zwartpunt, lichte vibrance-terugname.
// Geen HDR, geen oranje-teal. Deterministisch en idempotent (EXIF Software-tag).

export const PRESET_ID = 'MeegereisdWarm-v1';

// Parameters 1-op-1 afgeleid van DESIGN_GUIDELINES.md § 5.
export const PRESET = {
  // Per-kanaal lineair: out = a * in + b (0-255). a<1 = zachte highlight-roll-off +
  // opgetilde zwartpunt via b>0 (film-achtige voet). R>G>B = warme balans; blauw de
  // laagste winst zodat luchten niet knallen en groen richting olijf zakt.
  linear: { a: [0.985, 0.965, 0.93], b: [7.0, 5.5, 3.0] },
  // Globale HSL: lichte vibrance-terugname zodat aardetonen leven zonder poster-effect.
  modulate: { saturation: 0.95, brightness: 1.0 },
  // Zeer subtiele mid-gamma; neutraal genoeg om niet te verdonkeren.
  gamma: 1.02,
  jpegQuality: 86,
};

// True als de buffer al door deze preset is gegradeerd (voorkomt dubbel graden).
export async function isGradedBuffer(buf) {
  try {
    const sharp = (await import('sharp')).default;
    const md = await sharp(buf).metadata();
    const soft = md.exif && Buffer.isBuffer(md.exif) ? md.exif.toString('latin1') : '';
    return soft.includes(PRESET_ID);
  } catch {
    return false;
  }
}

// Past de preset toe op een JPEG/PNG/WebP-buffer en geeft een gegradeerde JPEG-buffer terug.
// Idempotent: een reeds gegradeerde buffer wordt ongewijzigd teruggegeven (tenzij force).
export async function gradeBuffer(buf, { force = false } = {}) {
  if (!force && (await isGradedBuffer(buf))) return buf;
  const sharp = (await import('sharp')).default;
  return sharp(buf)
    .rotate() // bak EXIF-orientatie in de pixels (auto-orient), DESIGN_GUIDELINES § 4
    .linear(PRESET.linear.a, PRESET.linear.b)
    .modulate(PRESET.modulate)
    .gamma(PRESET.gamma)
    .withMetadata({ exif: { IFD0: { Software: PRESET_ID } } })
    .jpeg({ quality: PRESET.jpegQuality, mozjpeg: true })
    .toBuffer();
}
