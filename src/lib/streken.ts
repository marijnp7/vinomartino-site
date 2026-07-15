import type { RelatedRef } from './articles';
import { getCtaStructure, type CtaStructure } from './cta-blocks';
import { isGyGTourUrl } from './affiliate-regio';
import { assertAssetAllowed, heroAssetAllowedForRegion } from './image-guard';

// LAT-1127 — curated accommodation tiers (Marijn-spec 2026-06-07). Stored as
// cast-json on streken (LAT-1136 import). The site renders its own map + cards
// from this data; Stay22 only supplies the per-address boeklink.
export type StayTier = 'slim_geboekt' | 'prijs_kwaliteit' | 'pure_luxe';

export interface Accommodation {
    naam: string;
    tier: StayTier;
    whyThisOne: string;
    prijsLaag: number | null;
    prijsHoog: number | null;
    /** ISO/symbol currency for the prices (bv. 'ZAR'). Leeg = euro. */
    valuta: string;
    lat: number | null;
    lng: number | null;
    /** Stay22 Allez deeplink (affiliate). */
    boeklink: string;
    adres: string;
    rating: string;
    /**
     * LAT-1536: Directus file-UUID van de per-verblijf foto (`hero_image` in de
     * accommodaties-JSON). Dit is de geïmporteerde Directus-asset-UUID, NIET de
     * rauwe DAM-ref. DevOps: importeer DAM-ref → nieuwe Directus-UUID → zet die
     * hier. Leeg = geen foto (kaart rendert dan zonder afbeelding, zoals nu).
     */
    fotoRef: string | null;
    /** Op buildtijd gedownloade self-hosted foto-URL (`/images/accommodaties/<uuid>.jpg`). */
    foto: string | null;
}

export interface WijnhuisPin {
    naam: string;
    lat: number | null;
    lng: number | null;
}

// LAT-2427 — on-page beeldcredit voor de streek-hero. Verplicht bij CC BY/BY-SA
// beelden (zichtbare naamsvermelding + licentie + bronlink). Gevuld uit het
// Directus-veld `streken.hero_credit` (JSON), niet hardcoded, zodat een
// beeldwissel de credit meeneemt via de CMS-bron. Alle drie de kernvelden zijn
// nodig om aan de licentie te voldoen; de hero-credit-guard blokkeert een
// attributie-plichtig beeld zonder complete credit.
export interface HeroCredit {
    /** Fotograaf/auteur zoals op de bronpagina, bv. "jacilluch". */
    author: string;
    /** Licentielabel zoals getoond, bv. "CC BY-SA 2.0". */
    licenseLabel: string;
    /** Canonieke licentie-URL voor de deeplink op het label (leeg = geen link). */
    licenseUrl: string;
    /** Bronpagina (bv. Wikimedia Commons-bestandspagina). */
    sourceUrl: string;
}

// LAT-1898 — beknopte planningspassage(s) die NÁ de accommodatielijst tonen op
// /accommodaties/<streek>/. Apart van de affiliate-3-CTA-structuur (LAT-1821):
// dit zijn redactionele prose-blokken (heading + tekst), gevuld door de Content
// Writer als `accom_cta_blocks.planning`. Leeg = niets gerenderd.
export interface AccomPlanningBlock {
    heading: string;
    text: string;
}

// LAT-1592 — Eten/Activiteiten leven in de pilot als genummerde POI-blokken op
// de streek-pagina (geen eigen detailroutes, plan 4a). Tolerant JSON op streken,
// optioneel; ontbreekt het veld of is het leeg dan rendert het blok niet
// ("coming soon" is verboden). De affiliate-boeklink (bv. GetYourGuide voor
// activiteiten) wordt alleen getoond als die bestaat.
export interface StreekPoi {
    naam: string;
    beschrijving: string;
    prijs: string;
    lat: number | null;
    lng: number | null;
    /** Externe affiliate-link (bv. GetYourGuide). Leeg = geen CTA. */
    boeklink: string;
}

// LAT-2252 — Gecureerde GetYourGuide-tour per streek. URL is de kale,
// gecureerde getyourguide.com-deeplink (zónder tracking); de partner_id + cmp
// worden pas op render-tijd toegevoegd via decorateGyGTourUrl (affiliate-regio.ts).
// Gevoed uit het Directus JSON-veld `gyg_tours` (CMS-only mandaat), niet hardcoded.
export interface GygTour {
    /** Titel zoals getoond op de kaart. */
    title: string;
    /** Kale gecureerde GetYourGuide-tour-URL (deeplink, zonder tracking-params). */
    url: string;
    /** Duur/omvang, bv. '4–5 uur' of 'Meerdaags (privé)'. Optioneel. */
    duration: string;
    /** Korte omschrijving: waarom deze tour. */
    blurb: string;
}

export interface Streek {
    slug: string;
    name: string;
    description: string;
    // LAT-2451 — dedicated korte kaart-blurb (max 140) voor de 6-8 uitgelichte
    // hero-streken op de homepage. Los van `description` (die elders intro/meta
    // is, ~220-760 tekens). Leeg = de homepage valt terug op zinsgrens-truncatie
    // van `description` (Marijn-besluit Optie B, 2026-07-14).
    cardBlurb: string;
    country: string;
    landSlug: string;
    climate: string;
    soil: string;
    mainGrapes: string[];
    subRegions: string[];
    vineyardArea: string;
    altitude: string;
    appellations: string[];
    // LAT-1676 — WijnFactBox-velden (ReisJunk fact-box-les). Vrije-tekst, gevuld
    // via Directus; leeg = die rij verschijnt niet in de fact-box.
    bestVintages: string;
    harvestPeriod: string;
    minVisitTime: string;
    tastingBudget: string;
    // LAT-2009 (VIS-BL-10) — feitenblok "In het kort 2.0". Vrije-tekst, gevuld via
    // Directus; leeg = die rij verschijnt niet. bestSeason = beste seizoen om te
    // reizen, driveDays = aantal rijdagen voor de route, nearestAirport =
    // dichtstbijzijnd vliegveld.
    bestSeason: string;
    driveDays: string;
    nearestAirport: string;
    heroImage: string | null;
    ogImage: string | null;
    // LAT-2427 — beeldcredit voor de hero (CC-attributie). Null = geen credit
    // in Directus; de hero-credit-guard bepaalt of het beeld dan nog mag tonen.
    heroCredit: HeroCredit | null;
    status: string;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
    relatedArticles: RelatedRef[];
    accommodaties: Accommodation[];
    wijnhuizen: WijnhuisPin[];
    eten: StreekPoi[];
    activiteiten: StreekPoi[];
    // LAT-1784/LAT-1795 — gestandaardiseerde 3-CTA-structuur (Directus `cta_blocks`).
    cta: CtaStructure;
    // LAT-1821 — aparte CTA-structuur voor de accommodatie-surface
    // (/accommodaties/<slug>/). Andere copy/intentiepubliek dan `cta` (streek).
    accomCta: CtaStructure;
    // LAT-1898 — Piemonte-funnel op /accommodaties/<streek>/: intro-blok 'Slapen
    // in de Langhe' (markdown→HTML, VÓÓR de lijst) + planningspassage(s) (NÁ de
    // lijst). Leeg = blok rendert niet (bestaande streken breken niet).
    waarSlapenIntroHtml: string;
    accomPlanning: AccomPlanningBlock[];
    // LAT-1958 — twee-tier authenticiteitsmodel (regels: LAT-1957). zelfGereisd
    // stuurt de "Zelf gereisd"-badge; bezoekjaar is het jaar van bezoek (nullable).
    zelfGereisd: boolean;
    bezoekjaar: number | null;
    // LAT-2252 — gecureerde GetYourGuide-tours (Directus `gyg_tours`). Leeg =
    // geen "Tours en tickets"-sectie (graceful degrade).
    gygTours: GygTour[];
}

// LAT-1098: reverse M2M `streken.related_articles` → `articles_id.{slug,title}`.
// Same shape-tolerant mapping as articles.mapRelatedRefs (duplicated to avoid
// import cycle on the shared mapper).
function mapRelatedArticles(val: unknown): RelatedRef[] {
    if (!Array.isArray(val)) return [];
    const out: RelatedRef[] = [];
    for (const row of val) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const inner = rec.articles_id && typeof rec.articles_id === 'object'
            ? rec.articles_id as Record<string, unknown>
            : rec;
        const slug = inner.slug ? String(inner.slug) : '';
        const name = inner.title ? String(inner.title) : slug;
        if (!slug) continue;
        out.push({ slug, name: normalizeEmDashes(name) });
    }
    return out;
}

import { markdownToHtml as renderMarkdown, normalizeEmDashes } from './markdown';
import { heroImageAllowed } from './hero-credit-guard';

function markdownToHtml(markdown: string): Promise<string> {
    return renderMarkdown(markdown, { stripFirstH1: true });
}

import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
    assetUrl,
    assertCollectionReadableOrDegrade,
} from './directus-config';

const assetDebug: Array<Record<string, unknown>> = [];

// LAT-2518: Directus dropt onder de parallelle asset-download-last sporadisch
// TCP-connecties ("fetch failed"), waardoor een hele regio zonder foto's
// rendert (2 van 30 regio's per build, wisselend). Retry met backoff maakt de
// build deterministisch compleet zonder de data te wijzigen.
async function fetchAssetWithRetry(url: string, token: string, attempts = 4): Promise<Response> {
    let lastErr: unknown = new Error('fetch not attempted');
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(15000),
            });
            // 2xx of niet-transiente 4xx → direct teruggeven; caller logt de status.
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) return res;
            lastErr = new Error(`HTTP ${res.status}`);
        } catch (err) {
            lastErr = err; // netwerk-drop ("fetch failed") of timeout → retry
        }
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function downloadAsset(assetId: string, directusUrl: string, token: string, prefix = ''): Promise<string | null> {
    if (!assertAssetAllowed(assetId)) return null; // LAT-2361: fout-gekoppeld beeld → lege hero i.p.v. verkeerde regio
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'streken');
    const fileName = `${prefix}${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/streken/${fileName}`;
    try {
        const res = await fetchAssetWithRetry(assetUrl(directusUrl, assetId), token);
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[loadStreken] could not fetch asset ${assetId}: ${res.status} body=${body.slice(0, 300)}`);
            assetDebug.push({ assetId, prefix, status: res.status, body: body.slice(0, 500) });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadStreken] grading-preset overgeslagen voor ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        assetDebug.push({ assetId, prefix, status: 200, bytes: outBuf.byteLength });
        return `/images/streken/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadStreken] asset download failed for ${assetId}: ${msg}`);
        assetDebug.push({ assetId, prefix, error: msg });
        return null;
    }
}

// LAT-1536: per-verblijf foto's voor de CuratedStayMap-kaarten. Schrijft naar
// dezelfde self-hosted map als de accommodaties-loader (LAT-1372), zodat een
// gedeelde Directus-UUID maar één keer wordt gedownload en de bron identiek is.
async function downloadAccommodatieAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    if (!assertAssetAllowed(assetId)) return null; // LAT-2361: gedeelde fout-asset (bv. rhone==accommodatiefoto) ook hier weigeren
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'accommodaties');
    const fileName = `${assetId}.jpg`;
    const outPath = join(outDir, fileName);
    if (existsSync(outPath)) return `/images/accommodaties/${fileName}`;
    try {
        const res = await fetchAssetWithRetry(assetUrl(directusUrl, assetId), token);
        if (!res.ok) {
            console.warn(`[loadStreken] kon accommodatie-foto ${assetId} niet ophalen: ${res.status}`);
            assetDebug.push({ kind: 'accommodatie-foto', assetId, status: res.status });
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        let outBuf = buf;
        try {
            const { gradeBuffer } = await import('./grade-image.mjs');
            outBuf = await gradeBuffer(buf); // Meegereisd Warm preset (LAT-2007)
        } catch (e) {
            console.warn(`[loadStreken] grading-preset overgeslagen voor accommodatie-foto ${assetId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, outBuf);
        assetDebug.push({ kind: 'accommodatie-foto', assetId, status: 200, bytes: outBuf.byteLength });
        return `/images/accommodaties/${fileName}`;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadStreken] accommodatie-foto download faalde voor ${assetId}: ${msg}`);
        assetDebug.push({ kind: 'accommodatie-foto', assetId, error: msg });
        return null;
    }
}

async function writeAssetDebug(pathTaken: string): Promise<void> {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const dir = join(process.cwd(), 'public');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
        join(dir, 'build-debug-streken.json'),
        JSON.stringify({ asOf: new Date().toISOString(), pathTaken, entries: assetDebug }, null, 2),
    );
}

function parseJsonField(val: unknown): string[] {
    if (Array.isArray(val)) return val.map(String);
    if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed.map(String) : []; }
        catch { return []; }
    }
    return [];
}

// LAT-1127 — JSON array field that may arrive as an array (cast-json) or a
// stringified array, depending on how Directus serialises the column.
function parseJsonObjects(val: unknown): Record<string, unknown>[] {
    let arr: unknown = val;
    if (typeof val === 'string') {
        try { arr = JSON.parse(val); } catch { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
}

function firstString(rec: Record<string, unknown>, keys: string[]): string {
    for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'string' && v.trim()) return normalizeEmDashes(v.trim());
        if (typeof v === 'number') return String(v);
    }
    return '';
}

function firstNumber(rec: Record<string, unknown>, keys: string[]): number | null {
    for (const k of keys) {
        const v = rec[k];
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'string' && v.trim()) {
            const n = Number(v.replace(/[^0-9.\-]/g, ''));
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

// LAT-1958 — tolerante boolean-read (Directus levert true/1/'1'/'true').
function firstBoolean(rec: Record<string, unknown>, keys: string[]): boolean {
    for (const k of keys) {
        const v = rec[k];
        if (v === true || v === 1 || v === '1' || v === 'true') return true;
        if (v === false || v === 0 || v === '0' || v === 'false') return false;
    }
    return false;
}

const TIER_VALUES: StayTier[] = ['slim_geboekt', 'prijs_kwaliteit', 'pure_luxe'];

function normalizeTier(raw: string): StayTier {
    const v = raw.toLowerCase().replace(/[\s-]+/g, '_');
    if ((TIER_VALUES as string[]).includes(v)) return v as StayTier;
    if (v.includes('luxe') || v.includes('luxury')) return 'pure_luxe';
    if (v.includes('kwaliteit') || v.includes('sweet') || v.includes('value')) return 'prijs_kwaliteit';
    return 'slim_geboekt';
}

// Tolerant mapper: field names follow the LAT-1133 signed-off dataset but accept
// reasonable aliases so a naming drift in Directus does not silently drop data.
function parseAccommodaties(val: unknown): Accommodation[] {
    return parseJsonObjects(val).map((r) => {
        const naam = firstString(r, ['naam', 'name', 'title']);
        const boeklink = firstString(r, ['boeklink', 'boeklink_stay22', 'stay22_link', 'allez_link', 'link']);
        return {
            naam,
            tier: normalizeTier(firstString(r, ['tier', 'categorie', 'category'])),
            whyThisOne: firstString(r, ['why_this_one', 'whyThisOne', 'blurb', 'why', 'beschrijving']),
            prijsLaag: firstNumber(r, ['prijs_laag', 'prijsLaag', 'price_low', 'prijs_van']),
            prijsHoog: firstNumber(r, ['prijs_hoog', 'prijsHoog', 'price_high', 'prijs_tot']),
            valuta: firstString(r, ['prijs_valuta', 'valuta', 'currency']),
            lat: firstNumber(r, ['lat', 'latitude']),
            lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
            boeklink,
            adres: firstString(r, ['adres', 'address']),
            rating: firstString(r, ['rating', 'score']),
            // LAT-1536: foto-ref draagveld in de accommodaties-JSON. `hero_image`
            // is het canonieke veld (gelijk aan de accommodaties-collectie); de
            // overige zijn tolerante aliassen zodat een naming-drift de foto niet
            // stilletjes laat vallen.
            fotoRef: firstString(r, ['hero_image', 'fotoRef', 'foto_ref', 'foto', 'image', 'hero_image_uuid']) || null,
            foto: null,
        };
    }).filter((a) => a.naam);
}

function parseWijnhuizen(val: unknown): WijnhuisPin[] {
    return parseJsonObjects(val).map((r) => ({
        naam: firstString(r, ['naam', 'name', 'title']),
        lat: firstNumber(r, ['lat', 'latitude']),
        lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
    })).filter((w) => w.naam);
}

// LAT-1898 — lees de redactionele planning-passage(s) uit `accom_cta_blocks`.
// Het veld is gedeeld met de affiliate-3-CTA-structuur (LAT-1821): die blokken
// (`primary`/`comparison`/`closing`) dragen `why`/`link`/`options`, NIET `text`.
// Door alleen blokken mét een `text` mee te nemen lezen beide schema's los van
// elkaar uit hetzelfde veld zonder elkaar te corrumperen. Accepteert object met
// benoemde blokken ({ planning: { heading, text } }), array, of stringified JSON.
function parseAccomPlanning(val: unknown): AccomPlanningBlock[] {
    let data: unknown = val;
    if (typeof val === 'string') {
        try { data = JSON.parse(val); } catch { return []; }
    }
    if (!data || typeof data !== 'object') return [];
    const rows = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);
    const out: AccomPlanningBlock[] = [];
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const text = firstString(rec, ['text', 'tekst', 'body', 'beschrijving']);
        if (!text) continue;
        out.push({ heading: firstString(rec, ['heading', 'titel', 'title', 'kop']), text });
    }
    return out;
}

// LAT-2427 — `hero_credit` komt als JSON-object (of stringified JSON) met de
// bron-attributie van de hero. Tolerante reads (snake_case canoniek + aliassen)
// zodat een naming-drift de credit niet stilletjes laat vallen. Leeg/ongeldig →
// null (de guard bepaalt dan of het beeld nog mag renderen).
function parseHeroCredit(val: unknown): HeroCredit | null {
    let data: unknown = val;
    if (typeof val === 'string') {
        const s = val.trim();
        if (!s) return null;
        try { data = JSON.parse(s); } catch { return null; }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const rec = data as Record<string, unknown>;
    const author = firstString(rec, ['author', 'fotograaf', 'credit', 'auteur', 'photographer']);
    const licenseLabel = firstString(rec, ['license_label', 'licenseLabel', 'licentie', 'license']);
    const licenseUrl = firstString(rec, ['license_url', 'licenseUrl', 'licentie_url']);
    const sourceUrl = firstString(rec, ['source_url', 'sourceUrl', 'bron', 'bron_url', 'source', 'commons_url']);
    if (!author && !licenseLabel && !sourceUrl) return null;
    return { author, licenseLabel, licenseUrl, sourceUrl };
}

// LAT-1592 — tolerante mapper voor eten/activiteiten POI-blokken. Prijs is een
// vrije tekst-label ('vanaf €45', '€€') zodat we geen muntconversie hoeven te
// doen; boeklink is optioneel (alleen renderen als die bestaat).
function parseStreekPois(val: unknown): StreekPoi[] {
    return parseJsonObjects(val).map((r) => ({
        naam: firstString(r, ['naam', 'name', 'title']),
        beschrijving: firstString(r, ['beschrijving', 'description', 'why_this_one', 'whyThisOne', 'blurb', 'why']),
        prijs: firstString(r, ['prijs', 'price', 'prijs_label', 'price_label', 'prijsindicatie']),
        lat: firstNumber(r, ['lat', 'latitude']),
        lng: firstNumber(r, ['lng', 'lon', 'long', 'longitude']),
        boeklink: firstString(r, ['boeklink', 'link', 'url', 'affiliate_link', 'getyourguide', 'gyg_link']),
    })).filter((p) => p.naam);
}

// LAT-2252 — tolerante mapper voor gecureerde GYG-tours (Directus `gyg_tours`).
// Alleen rijen met een titel én een geldige getyourguide.com-URL overleven, zodat
// een half-ingevulde CMS-rij niet als kapotte kaart of foute link rendert.
function parseGygTours(val: unknown): GygTour[] {
    return parseJsonObjects(val).map((r) => ({
        title: normalizeEmDashes(firstString(r, ['title', 'titel', 'naam', 'name'])),
        url: firstString(r, ['url', 'link', 'tour_url', 'getyourguide', 'gyg_url', 'boeklink']),
        duration: normalizeEmDashes(firstString(r, ['duration', 'duur', 'omvang'])),
        blurb: normalizeEmDashes(firstString(r, ['blurb', 'beschrijving', 'description', 'why', 'omschrijving'])),
    })).filter((t) => t.title && isGyGTourUrl(t.url));
}

function mapStreek(
    r: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
    waarSlapenIntroHtml: string,
): Streek {
    return {
        slug: String(r.slug),
        name: normalizeEmDashes(String(r.name)),
        description: normalizeEmDashes(String(r.description || '')),
        // LAT-2451 — card_blurb tolerante read (canoniek + camelCase-alias).
        cardBlurb: firstString(r, ['card_blurb', 'cardBlurb', 'kaart_blurb']),
        country: String(r.country || r.land_name || ''),
        landSlug: String(r.land_slug || ''),
        climate: String(r.climate || ''),
        soil: String(r.soil || ''),
        mainGrapes: parseJsonField(r.main_grapes),
        subRegions: parseJsonField(r.sub_regions),
        vineyardArea: String(r.vineyard_area || ''),
        altitude: String(r.altitude || ''),
        appellations: parseJsonField(r.appellations),
        // LAT-1676 — tolerante reads (snake_case canoniek + NL-aliassen) zodat
        // een naming-drift in Directus de fact-box niet stilletjes leegtrekt.
        bestVintages: firstString(r, ['best_vintages', 'beste_jaargangen', 'vintages']),
        harvestPeriod: firstString(r, ['harvest_period', 'oogstperiode', 'harvest']),
        minVisitTime: firstString(r, ['min_visit_time', 'min_bezoektijd', 'visit_time', 'bezoektijd']),
        tastingBudget: firstString(r, ['tasting_budget', 'budget_proeverij', 'budget']),
        // LAT-2009 — feitenblok-velden, tolerante reads (snake_case + NL-aliassen).
        bestSeason: firstString(r, ['best_season', 'beste_seizoen', 'seizoen']),
        driveDays: firstString(r, ['drive_days', 'rijdagen', 'route_days']),
        nearestAirport: firstString(r, ['nearest_airport', 'dichtstbijzijnd_vliegveld', 'vliegveld', 'airport']),
        heroImage: heroImagePath,
        ogImage: ogImagePath,
        heroCredit: parseHeroCredit(r.hero_credit),
        status: String(r.status || 'draft'),
        metaTitle: String(r.meta_title || r.name),
        metaDescription: String(r.meta_description || r.description || ''),
        bodyHtml,
        accommodaties: parseAccommodaties(r.accommodaties),
        wijnhuizen: parseWijnhuizen(r.wijnhuizen),
        eten: parseStreekPois(r.eten),
        activiteiten: parseStreekPois(r.activiteiten),
        relatedArticles: mapRelatedArticles(r.related_articles),
        cta: getCtaStructure(r),
        accomCta: getCtaStructure(r, 'accom_cta_blocks'),
        waarSlapenIntroHtml,
        accomPlanning: parseAccomPlanning(r.accom_cta_blocks),
        // LAT-1958 — twee-tier authenticiteitsmodel (regels: LAT-1957).
        zelfGereisd: firstBoolean(r, ['zelf_gereisd']),
        bezoekjaar: firstNumber(r, ['bezoekjaar', 'bezoek_jaar', 'visit_year']),
        // LAT-2252 — gecureerde GYG-tours uit Directus `gyg_tours`.
        gygTours: parseGygTours(r.gyg_tours),
    };
}

async function fetchStrekenItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,name,description,body,climate,soil,main_grapes,sub_regions,vineyard_area,altitude,appellations,accommodaties,wijnhuizen,hero_image,status,meta_title,meta_description,land_id.name,land_id.slug';
    const withOg = `${baseFields},og_image`;
    // LAT-1098: reverse-relation auto-aangemaakt door Directus M2M op articles
    // (LAT-1097). Junction `articles_streken` → `articles_id.{slug,title}`.
    // LAT-1795: cta_blocks rijdt mee op de stabiele relations-tier, NIET op de
    // hogere POI/facts-tiers. Reden: streken.eten/activiteiten (LAT-1592) ontbreken
    // in dit schema → withPoi/withFacts 400'en, en cta_blocks zou als collateral
    // sneuvelen. Op withRelations (de hoogste tier die slaagt) overleeft de CTA.
    // LAT-1821: accom_cta_blocks rijdt mee op dezelfde stabiele relations-tier als
    // cta_blocks (aparte CTA-copy voor /accommodaties/<slug>/).
    // LAT-1898: waar_slapen_intro (markdown intro vóór de accommodatielijst) rijdt
    // mee op dezelfde stabiele tier — een content-veld op streken, net als
    // cta_blocks/accom_cta_blocks dat de build-rol al leest.
    // LAT-1958: zelf_gereisd/bezoekjaar rijden mee op DEZELFDE stabiele relations-tier
    // als cta_blocks/waar_slapen_intro — NIET op de hogere POI/facts-tiers. Reden: die
    // hogere tiers 400'en zolang streken.eten/activiteiten (LAT-1592) ontbreken, dus een
    // badge-veld daarbovenop zou als collateral sneuvelen en de "Zelf gereisd"-badge zou
    // nooit renderen. Op withRelations (de hoogste tier die feitelijk slaagt) overleeft de badge.
    // LAT-2427: hero_credit (CC-attributie voor de hero) rijdt mee op DEZELFDE
    // stabiele relations-tier — een scalar-veld op streken, net als gyg_tours.
    // Op de hogere POI/facts-tiers zou het als collateral sneuvelen wanneer
    // eten/activiteiten 403'en, en de verplichte credit zou dan nooit laden.
    const withRelations = `${withOg},related_articles.articles_id.slug,related_articles.articles_id.title,cta_blocks,accom_cta_blocks,waar_slapen_intro,zelf_gereisd,bezoekjaar,gyg_tours,hero_credit`;  // LAT-2252: gyg_tours + LAT-2427: hero_credit rijden mee op withRelations (withGyg/withBl10/withFacts 403en op eten/activiteiten en vallen terug)
    // LAT-2451: card_blurb (homepage hero-streken kaart-blurb) als eigen tier BOVEN
    // withRelations. Bewust NIET in de withRelations-constante: bestaat card_blurb nog
    // niet in Directus (DevOps moet het veld aanmaken), dan zou de withRelations-retry
    // 400'en en zou de badge/tours/credit-tier als collateral sneuvelen. Als aparte
    // tier degradeert een ontbrekend card_blurb stil naar withRelations.
    const withCardBlurb = `${withRelations},card_blurb`;
    // LAT-1592: eten/activiteiten zijn nieuwe streek-velden. Bestaat het veld nog
    // niet (of mist de build-rol read-permissie) dan degradeert deze top-tier naar
    // `withRelations`, zodat related_articles (LAT-1098) NIET sneuvelt op het
    // moment dat alleen de POI-velden ontbreken.
    const withPoi = `${withRelations},eten,activiteiten`;
    // LAT-1676: WijnFactBox-velden als hoogste tier. Bestaan ze nog niet in het
    // Directus-schema (DevOps moet ze aanmaken), dan degradeert deze fetch naar
    // `withPoi` zónder iets anders te verliezen — de fact-box rendert dan gewoon
    // niets tot de velden bestaan en gevuld zijn.
    const factFields = 'best_vintages,harvest_period,min_visit_time,tasting_budget';
    const withFacts = `${withPoi},${factFields}`;
    // LAT-2009 (VIS-BL-10): feitenblok-velden als eigen bovenste tier. Bestaan ze
    // nog niet in Directus (DevOps moet ze aanmaken), dan degradeert deze fetch
    // stil naar `withFacts` — de bestaande fact-velden blijven dus renderen; enkel
    // de nieuwe feitenblok-rijen zijn leeg tot de velden bestaan en gevuld zijn.
    const bl10Fields = 'best_season,drive_days,nearest_airport';
    const withBl10 = `${withFacts},${bl10Fields}`;
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${token}` };
    const signal = AbortSignal.timeout(15000);

    // LAT-2009: bovenste tier mét feitenblok-velden; val bij 400/403 stil terug op
    // withFacts (bestaande fact-velden blijven), dan verder omlaag via withPoi.
    try {
        const bl10Res = await fetch(`${url}/items/streken?limit=-1&fields=${withBl10}${filterSort}`, { headers, signal });
        if (bl10Res.ok) {
            const json = await bl10Res.json();
            assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length, tier: 'withBl10' });
            return (json.data || []) as Record<string, unknown>[];
        }
        if (bl10Res.status === 400 || bl10Res.status === 403) {
            console.warn(`[loadStreken] Directus rejected fields=…,${bl10Fields} (HTTP ${bl10Res.status}) — retrying without LAT-2009 feitenblok-velden. Run directus/scripts/extend-streken-feitenblok-fields.mjs en/of geef de build-rol read-permissie op streken.best_season/drive_days/nearest_airport.`);
            assetDebug.push({ kind: 'query', url, status: bl10Res.status, retryWithoutBl10: true });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query-bl10', url, error: msg });
        // Val door naar de withFacts-poging hieronder.
    }

    // Top-tier poging mét fact-box-velden; val bij 400/403 stil terug op withPoi.
    try {
        const factsRes = await fetch(`${url}/items/streken?limit=-1&fields=${withFacts}${filterSort}`, { headers, signal });
        if (factsRes.ok) {
            const json = await factsRes.json();
            assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length, tier: 'withFacts' });
            return (json.data || []) as Record<string, unknown>[];
        }
        if (factsRes.status === 400 || factsRes.status === 403) {
            console.warn(`[loadStreken] Directus rejected fields=…,${factFields} (HTTP ${factsRes.status}) — retrying without LAT-1676 fact-velden. Maak streken.best_vintages/harvest_period/min_visit_time/tasting_budget aan en/of geef de build-rol read-permissie. (cta_blocks rijdt mee op withRelations.)`);
            assetDebug.push({ kind: 'query', url, status: factsRes.status, retryWithoutFacts: true });
        } else {
            // Andere status (bv. 5xx/timeout): laat de bestaande withPoi-pad de
            // foutafhandeling doen i.p.v. hier te stoppen.
            const body = await factsRes.text().catch(() => '');
            assetDebug.push({ kind: 'query', url, status: factsRes.status, body: body.slice(0, 300), tier: 'withFacts' });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query-facts', url, error: msg });
        // Val door naar de withPoi-poging hieronder (die de echte fout opwerpt).
    }

    let res: Response;
    try {
        res = await fetch(`${url}/items/streken?limit=-1&fields=${withPoi}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        assetDebug.push({ kind: 'query', url, error: msg });
        throw new Error(`[loadStreken] Directus unreachable at ${url}: ${msg}`);
    }
    if (res.ok) {
        const json = await res.json();
        assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length, tier: 'withPoi' });
        return (json.data || []) as Record<string, unknown>[];
    }
    if (res.status === 400 || res.status === 403) {
        const poiBody = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,eten,activiteiten (HTTP ${res.status}) — retrying without LAT-1592 POI-velden. Maak streken.eten/streken.activiteiten aan en/of geef de build-rol read-permissie.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: poiBody.slice(0, 300), retryWithoutPoi: true });
        // LAT-2451: probeer eerst withRelations + card_blurb. Bestaat card_blurb nog
        // niet (of mist de build-rol read-permissie) dan degradeert dit stil naar
        // withRelations, zodat badge/tours/credit/related_articles NIET sneuvelen.
        try {
            const cbRes = await fetch(`${url}/items/streken?limit=-1&fields=${withCardBlurb}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
            if (cbRes.ok) {
                const json = await cbRes.json();
                assetDebug.push({ kind: 'query', url, status: 200, count: (json.data || []).length, tier: 'withCardBlurb' });
                return (json.data || []) as Record<string, unknown>[];
            }
            if (cbRes.status === 400 || cbRes.status === 403) {
                console.warn(`[loadStreken] Directus rejected fields=…,card_blurb (HTTP ${cbRes.status}) — retry zonder LAT-2451 card_blurb. Run directus/scripts/add-card-blurb-field.mjs en/of geef de build-rol read-permissie op streken.card_blurb.`);
                assetDebug.push({ kind: 'query', url, status: cbRes.status, retryWithoutCardBlurb: true });
            } else {
                const cbBody = await cbRes.text().catch(() => '');
                assetDebug.push({ kind: 'query', url, status: cbRes.status, body: cbBody.slice(0, 300), tier: 'withCardBlurb' });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-cardblurb', url, error: msg });
            // Val door naar de withRelations-retry hieronder.
        }
        try {
            res = await fetch(`${url}/items/streken?limit=-1&fields=${withRelations}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-poi', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without POI fields threw: ${msg}`);
        }
        if (res.ok) {
            const json = await res.json();
            assetDebug.push({ kind: 'query-retry-poi', url, status: 200, count: (json.data || []).length, tier: 'withRelations' });
            return (json.data || []) as Record<string, unknown>[];
        }
    }
    if (res.status === 400 || res.status === 403) {
        const body = await res.text().catch(() => '');
        console.warn(`[loadStreken] Directus rejected fields=…,related_articles (HTTP ${res.status}) — retrying without LAT-1098 relations. Run LAT-1097 (Directus M2M schema) en/of geef de build-rol read-permissie op streken.related_articles.`);
        assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500), retryWithoutRelations: true });
        let retryRel: Response;
        try {
            retryRel = await fetch(`${url}/items/streken?limit=-1&fields=${withOg}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry-rel', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without relations threw: ${msg}`);
        }
        if (retryRel.ok) {
            const json = await retryRel.json();
            assetDebug.push({ kind: 'query-retry-rel', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        // Relations missing AND og_image still failing → drop to baseFields.
        if (retryRel.status !== 400 && retryRel.status !== 403) {
            const rbody = await retryRel.text().catch(() => '');
            assetDebug.push({ kind: 'query-retry-rel', url, status: retryRel.status, body: rbody.slice(0, 500) });
            throw new Error(`[loadStreken] Directus retry without relations failed: ${retryRel.status} ${retryRel.statusText}: ${rbody.slice(0, 300)}`);
        }
        console.warn(`[loadStreken] Directus also rejected fields=…,og_image (HTTP ${retryRel.status}) — retrying without og_image. Run directus/scripts/add-og-image-fields.mjs en/of geef de build-rol read-permissie op streken.og_image.`);
        assetDebug.push({ kind: 'query-retry-og', url, status: retryRel.status });
        let retry: Response;
        try {
            retry = await fetch(`${url}/items/streken?limit=-1&fields=${baseFields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            assetDebug.push({ kind: 'query-retry', url, error: msg });
            throw new Error(`[loadStreken] Directus retry without og_image threw: ${msg}`);
        }
        if (retry.ok) {
            const json = await retry.json();
            assetDebug.push({ kind: 'query-retry', url, status: 200, count: (json.data || []).length });
            return (json.data || []) as Record<string, unknown>[];
        }
        const rbody = await retry.text().catch(() => '');
        assetDebug.push({ kind: 'query-retry', url, status: retry.status, body: rbody.slice(0, 500) });
        // LAT-1011/LAT-1768: collection-level 403/404 → productie fail-loud,
        // alleen preview/dev degradeert naar lege lijst.
        if (retry.status === 403 || retry.status === 404) {
            assertCollectionReadableOrDegrade('loadStreken', 'streken', retry.status, env, rbody.slice(0, 200));
            return [];
        }
        throw new Error(`[loadStreken] Directus retry without og_image failed: ${retry.status} ${retry.statusText}: ${rbody.slice(0, 300)}`);
    }
    const body = await res.text().catch(() => '');
    assetDebug.push({ kind: 'query', url, status: res.status, body: body.slice(0, 500) });
    throw new Error(`[loadStreken] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Streek[]> {
    const data = await fetchStrekenItems(url, token);
    const items = await Promise.all(
        data.map(async (r) => {
            const land = r.land_id as Record<string, unknown> | null;
            if (land && land.name) r.land_name = land.name;
            if (land && land.slug) r.land_slug = land.slug;
            const bodyHtml = r.body ? await markdownToHtml(String(r.body)) : '';
            // LAT-1898: intro is een los markdown-blok (eigen H2-kop, geen H1 om te
            // strippen) → render zonder stripFirstH1.
            const waarSlapenIntroHtml = r.waar_slapen_intro
                ? await renderMarkdown(String(r.waar_slapen_intro))
                : '';
            const heroImagePath = r.hero_image
                ? await downloadAsset(String(r.hero_image), url, token)
                : null;
            const ogImagePath = r.og_image
                ? await downloadAsset(String(r.og_image), url, token, 'og-')
                : null;
            const streek = mapStreek(r, heroImagePath, ogImagePath, bodyHtml, waarSlapenIntroHtml);
            // LAT-2427 — fail-closed CC-credit guard. Draagt de hero-asset een
            // attributie-plichtige licentie (CC BY/BY-SA) maar ontbreekt de
            // complete credit in Directus, dan wordt de hero op leeg gezet: een
            // naamloos CC-beeld is een licentieschending (liever leeg dan fout).
            if (!heroImageAllowed(r.hero_image ? String(r.hero_image) : null, streek.heroCredit)) {
                streek.heroImage = null;
            }
            // LAT-2379 — durende per-streek allowlist (Optie A). Voor een
            // ingeschreven streek mag alléén de geverifieerde asset-UUID renderen;
            // een afwijkend (of later foutief geswapt) hero_image valt fail-closed
            // terug op leeg. Niet-ingeschreven streken passeren ongewijzigd.
            if (!heroAssetAllowedForRegion(streek.slug, r.hero_image ? String(r.hero_image) : null)) {
                streek.heroImage = null;
            }
            // LAT-1536: download per-verblijf foto's en hang de self-hosted URL
            // aan elke accommodatie. fotoRef leeg → foto blijft null (kaart toont
            // dan geen afbeelding; bestaande streken breken niet).
            await Promise.all(
                streek.accommodaties.map(async (acc) => {
                    if (!acc.fotoRef) return;
                    acc.foto = await downloadAccommodatieAsset(acc.fotoRef, url, token);
                }),
            );
            return streek;
        }),
    );
    console.log(`[loadStreken] fetched ${items.length} streken from Directus`);
    return items;
}

export async function loadStreken(): Promise<Streek[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadStreken', env);
    const items = await loadFromDirectus(env.url, env.token);
    await writeAssetDebug('directus');
    return items;
}

export interface NavStreek {
    slug: string;
    name: string;
    landSlug: string;
}

/**
 * Lightweight streken-loader voor de "Ontdek" nav-dropdown (LAT-1604). Haalt
 * alleen slug/name/land_slug op — geen body-render, geen asset-download — zodat
 * de globale header op elke pagina goedkoop blijft. Volgt het fail-loud-contract
 * (LAT-1078): zonder Directus-config gooit dit, net als loadStreken().
 */
export async function loadStrekenNav(): Promise<NavStreek[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadStrekenNav', env);
    const filterSort = `${statusFilterQuery(env)}&sort=name`;
    const headers = { Authorization: `Bearer ${env.token}` };
    let res = await fetch(`${env.url}/items/streken?limit=-1&fields=slug,name,land_id.slug${filterSort}`, {
        headers,
        signal: AbortSignal.timeout(15000),
    });
    // land_id-veld/permissie ontbreekt (pre-migratie) → degradeer naar slug/name
    // zonder land-koppeling; de header valt dan terug op landen-only.
    if (res.status === 400 || res.status === 403) {
        console.warn(`[loadStrekenNav] Directus rejected land_id.slug (HTTP ${res.status}) — retry zonder land-koppeling.`);
        res = await fetch(`${env.url}/items/streken?limit=-1&fields=slug,name${filterSort}`, {
            headers,
            signal: AbortSignal.timeout(15000),
        });
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`[loadStrekenNav] Directus returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const data = (json.data || []) as Record<string, unknown>[];
    return data
        .filter((r) => r.slug && r.name)
        .map((r) => {
            const land = r.land_id as Record<string, unknown> | null;
            return {
                slug: String(r.slug),
                name: normalizeEmDashes(String(r.name)),
                landSlug: land && land.slug ? String(land.slug) : '',
            };
        });
}
