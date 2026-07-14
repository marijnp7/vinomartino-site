import type { TocItem } from './markdown';
import { getCtaStructure, type CtaStructure } from './cta-blocks';
import { assertAssetAllowed } from './image-guard';

export interface RelatedRef {
    slug: string;
    name: string;
}

export type { TocItem };

export interface Article {
    slug: string;
    title: string;
    description: string;
    author: string;
    pubDate: string;
    updatedAt: string | null;
    category: string;
    tags: string[];
    heroImage: string | null;
    // LAT-1687: ruwe Directus file-UUID van de hero, zodat de beeldcredit-registry
    // (lib/image-credits) de attributie aan het beeld kan koppelen.
    heroImageId: string | null;
    ogImage: string | null;
    status: string;
    featured: boolean;
    metaTitle: string;
    metaDescription: string;
    bodyHtml: string;
    wordCount: number;
    readingMinutes: number;
    toc: TocItem[];
    // LAT-1680: rauwe FAQPage JSON-LD-string uit Directus (SEO/Content Writer input).
    // De template doet JSON.parse + push in de schema-array; leeg = niets renderen.
    faqSchema: string | null;
    relatedStreken: RelatedRef[];
    relatedWijnhuizen: RelatedRef[];
    relatedWijnroutes: RelatedRef[];
    relatedLanden: RelatedRef[];
    // LAT-1619: redactioneel gekozen artikel→artikel cross-links.
    // relatedArtikelen → rechterzijbalk "Gerelateerde stukken" (max 3).
    // meerOver → voetblok "Meer over [druif/regio]" (max 3).
    relatedArtikelen: RelatedRef[];
    meerOver: RelatedRef[];
    // LAT-1784/LAT-1795 — gestandaardiseerde 3-CTA-structuur (Directus `cta_blocks`).
    cta: CtaStructure;
    // LAT-1958 — twee-tier authenticiteitsmodel (regels: LAT-1957). zelfGereisd
    // stuurt de "Zelf gereisd"-badge in de artikel-header; bezoekjaar is het jaar
    // van bezoek (nullable).
    zelfGereisd: boolean;
    bezoekjaar: number | null;
    // LAT-2112 (VIS-STRAT-03, kader LAT-2014) — rubriekenstelsel + visuele stempel.
    // rubriek = één van de vier terugkerende formats (stuurt de rubriek-signatuur).
    // tier = redactioneel gewicht ('1' of '2'), toegekend door Lead Editor.
    // plaatsstempel = "BESTEMMING . MMM JJJJ" overlay op de Tier 1 header-foto.
    // Alle drie optioneel/nullable → graceful degrade zolang schema/content ontbreekt.
    rubriek: string | null;
    tier: string | null;
    plaatsstempel: string | null;
    // proefnotities → "Uit de kelder"-kaarten; eerstDitBoeken → praktisch voetblok.
    // Beide JSON-repeaters op articles; leeg = component rendert niets.
    proefnotities: Proefnotitie[];
    eerstDitBoeken: EerstDitBoekenItem[];
}

// LAT-2112 — "Uit de kelder": fles-first proefnotitie-kaart (kader LAT-2014).
export interface Proefnotitie {
    wijnnaam: string;
    jaar: string;
    wijnmaker: string;
    appellation: string;
    gedronkenIn: string;
    prijs: string;
    notitie: string;
    etiketFoto: string | null;
    etiketFotoAlt: string | null;
}

// LAT-2112 — "Eerst dit boeken": praktisch afsluitblok van reisartikelen.
export interface EerstDitBoekenItem {
    naam: string;
    handeling: string;
}

const META_DESC_RE = /^\s*\*{0,2}Meta-description:?\*{0,2}\s*/i;

// LAT-1061: redactionele metadata-headers die Lead Editor soms in de Directus
// `body` plakt (bv. "**Byline:** ...", "**SEO Meta-title:** ...") horen NIET
// als prose op de site. Normaliseer op lowercase, strip optionele afmetingen
// tussen haakjes (bv. "Hero image (1600×900)" → "hero image").
const EDITORIAL_KEYS = new Set<string>([
    'byline', 'auteur', 'author',
    'slug',
    'pub-datum', 'pubdatum', 'pub date', 'publicatie', 'publicatiedatum', 'publish date',
    'pillar', 'rubriek', 'sectie', 'category', 'categorie',
    'woordtelling', 'word count', 'aantal woorden',
    'status',
    'titel', 'title',
    'seo meta-title', 'seo meta title', 'meta-title', 'meta title', 'meta-titel', 'meta titel',
    'seo meta-description', 'seo meta description', 'meta-description', 'meta description',
    'focus keyword', 'focus-keyword',
    'secundair keyword', 'secundaire keyword', 'secundair keywords', 'secundaire keywords',
    'keywords', 'keyword',
    'hero image', 'hero', 'header image', 'headerafbeelding',
    'og image', 'og-image', 'og / social image', 'og/social image', 'social image', 'og social image',
    'alt-tekst', 'alt tekst', 'alttekst', 'alt text', 'alt', 'alternative text',
    'fotocredit', 'foto-credit', 'foto credit', 'photo credit', 'image credit', 'credit', 'beeldcredit',
    'intern', 'internal', 'redactioneel', 'redactionele notitie', 'editorial',
]);

const KEY_LABEL_RE = /\*\*([^*\n]+?):\*\*/g;

function normalizeEditorialKey(raw: string): string {
    const norm = raw.replace(/\s+/g, ' ').trim().toLowerCase();
    if (EDITORIAL_KEYS.has(norm)) return norm;
    const base = norm.replace(/\s*\([^)]*\)\s*$/, '').trim();
    return EDITORIAL_KEYS.has(base) ? base : norm;
}

function isEditorialParagraph(paragraph: string): boolean {
    const lines = paragraph.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    let editorialKeyFound = false;
    for (const line of lines) {
        if (!line.startsWith('**')) return false;
        const matches = [...line.matchAll(KEY_LABEL_RE)];
        if (matches.length === 0) return false;
        for (const m of matches) {
            const key = normalizeEditorialKey(m[1]);
            if (EDITORIAL_KEYS.has(key)) editorialKeyFound = true;
        }
    }
    return editorialKeyFound;
}

function extractMetaDescriptionFromEditorial(blocks: string[]): string {
    const re = /\*\*(?:SEO\s+)?Meta[\s-]?description:?\*\*\s*([^\n*]+?)(?=\s*\n|\s*\*\*[^*]+:\*\*|$)/i;
    for (const b of blocks) {
        const m = b.match(re);
        if (m && m[1]) return m[1].trim();
    }
    return '';
}

function stripLegacyMetaDescriptionLine(markdown: string): { body: string; extracted: string } {
    const lines = markdown.split('\n');
    const limit = Math.min(lines.length, 10);
    for (let i = 0; i < limit; i++) {
        if (META_DESC_RE.test(lines[i])) {
            const extracted = lines[i].replace(META_DESC_RE, '').trim();
            let endIdx = i + 1;
            while (endIdx < lines.length && lines[endIdx].trim() === '') endIdx++;
            const cleaned = [...lines.slice(0, i), ...lines.slice(endIdx)].join('\n');
            return { body: cleaned, extracted };
        }
    }
    return { body: markdown, extracted: '' };
}

// LAT-1208: routes/[slug] rendert de Directus `body` rechtstreeks en miste de
// redactionele-header strip die artikelen al hadden. Exporteer een dunne helper
// zodat routes.ts dezelfde EDITORIAL_KEYS-logica hergebruikt.
export function stripEditorialHeader(markdown: string): string {
    return stripMetaDescriptionFromBody(markdown).body;
}

function stripMetaDescriptionFromBody(markdown: string): { body: string; extracted: string } {
    const paragraphs = markdown.split(/\n\s*\n/);
    const kept: string[] = [];
    const stripped: string[] = [];
    let scanning = true;
    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const trimmed = p.trim();
        if (!scanning) { kept.push(p); continue; }
        if (!trimmed) continue;
        if (isEditorialParagraph(p)) { stripped.push(p); continue; }
        // Skip past leading title/subtitle headings — they are real content but should
        // not stop us from finding the editorial block that often follows the title.
        if (/^#{1,6}\s/.test(trimmed)) { kept.push(p); continue; }
        // Thematic break (---) acts as separator: drop it only if it sits between
        // editorial blocks we just stripped; otherwise keep.
        if (/^-{3,}\s*$/.test(trimmed)) {
            if (stripped.length > 0) continue;
            kept.push(p);
            continue;
        }
        scanning = false;
        kept.push(p);
    }
    if (stripped.length === 0) return stripLegacyMetaDescriptionLine(markdown);
    const body = kept.join('\n\n');
    const extracted = extractMetaDescriptionFromEditorial(stripped);
    return { body, extracted };
}

import { markdownToHtmlWithToc, countWords, normalizeEmDashes } from './markdown';
import { buildCjBookingLink } from './affiliates';

function renderArticleBody(markdown: string, slug: string): Promise<{ html: string; toc: TocItem[] }> {
    return markdownToHtmlWithToc(substituteAffiliateTokens(markdown, slug), { stripFirstH1: true });
}

// LAT-2251: wrap élke booking.com-URL in de artikel-body (markdown-link of raw
// href) door het CJ-klikdomein, zodat de artikelpagina's dezelfde CJ-attributie
// krijgen als de streek-/accommodatie-pagina's. buildCjBookingLink pelt een
// bestaande CJ-hop af, stript oude aid/label en wrapt door kqzyfj.com.
function cjWrapBookingLinksInBody(markdown: string, slug: string): string {
    const sid = `artikel-${slug}`;
    const isBooking = (u: string) => /^https?:\/\/(www\.)?booking\.com\//i.test(u);
    let result = markdown.replace(
        /(\]\()(https?:\/\/[^)\s]+)(\))/g,
        (m, open, url, close) => (isBooking(url) ? `${open}${buildCjBookingLink(url, sid)}${close}` : m),
    );
    result = result.replace(
        /(href=["'])(https?:\/\/[^"']+)(["'])/g,
        (m, open, url, close) => (isBooking(url) ? `${open}${buildCjBookingLink(url, sid)}${close}` : m),
    );
    return result;
}

function substituteAffiliateTokens(markdown: string, slug: string): string {
    const bookingAid = process.env['BOOKING_AID'] || '';
    const gygPartner = process.env['GETYOURGUIDE_PARTNER'] || '';

    let result = markdown;

    if (bookingAid) {
        result = result.replace(/BOOKING_PARTNER_ID/g, bookingAid);
    } else {
        // Degrade to plain anchor text when partner ID is not yet configured
        result = result.replace(
            /\[([^\]]+)\]\(https?:\/\/[^)]*BOOKING_PARTNER_ID[^)]*\)/g,
            '$1',
        );
    }

    if (gygPartner) {
        result = result.replace(/partner=VINOMARTINO/g, `partner=${gygPartner}`);
    } else {
        result = result.replace(
            /\[([^\]]+)\]\(https?:\/\/[^)]*partner=VINOMARTINO[^)]*\)/g,
            '$1',
        );
    }

    // LAT-2251: na token-substitutie ALLE booking.com-links door de CJ-wrapper halen.
    result = cjWrapBookingLinksInBody(result, slug);

    return result;
}

import {
    readDirectusEnv,
    statusFilterQuery,
    assertDirectusConfigured,
    assetUrl,
} from './directus-config';

async function downloadArticleAsset(assetId: string, directusUrl: string, token: string): Promise<string | null> {
    if (!assertAssetAllowed(assetId)) return null; // LAT-2361: blokkeer fout-gekoppelde/gedeelde beelden ook in artikel-hero's
    const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const outDir = join(process.cwd(), 'public', 'images', 'articles');
    const outPath = join(outDir, `${assetId}.jpg`);
    if (existsSync(outPath)) return `/images/articles/${assetId}.jpg`;
    try {
        const res = await fetch(assetUrl(directusUrl, assetId), {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            console.warn(`[loadArticles] could not fetch asset ${assetId}: ${res.status}`);
            return null;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        mkdirSync(outDir, { recursive: true });
        writeFileSync(outPath, buf);
        return `/images/articles/${assetId}.jpg`;
    } catch (err) {
        console.warn(`[loadArticles] asset download failed for ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
    }
}

// LAT-1098: Directus M2M-junction shape on `articles.related_<entity>` is
// `{[junction_id_or_index]: {<entity>_id: {slug, name|title}}}`. Reverse on the
// entity side uses `{articles_id: {slug, title}}`. We accept a few common shapes
// so a missing/renamed junction degrades to empty instead of throwing.
function mapRelatedRefs(val: unknown, slugKey: string, nameKey: string): RelatedRef[] {
    if (!Array.isArray(val)) return [];
    const out: RelatedRef[] = [];
    for (const row of val) {
        if (!row || typeof row !== 'object') continue;
        const rec = row as Record<string, unknown>;
        const inner = rec[slugKey] && typeof rec[slugKey] === 'object'
            ? rec[slugKey] as Record<string, unknown>
            : rec;
        const slug = inner.slug ? String(inner.slug) : '';
        const name = inner[nameKey] ? String(inner[nameKey]) : slug;
        if (!slug) continue;
        out.push({ slug, name: normalizeEmDashes(name) });
    }
    return out;
}

// LAT-2112 — Directus JSON-velden (proefnotities, eerst_dit_boeken) komen binnen
// als array óf als JSON-string, afhankelijk van het interface. Coerce beide naar
// een array van objecten; ongeldige/lege input → [] zodat de component niets rendert.
function coerceJsonArray(val: unknown): Record<string, unknown>[] {
    let parsed: unknown = val;
    if (typeof val === 'string') {
        const s = val.trim();
        if (!s) return [];
        try { parsed = JSON.parse(s); } catch { return []; }
    }
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}

function mapProefnotities(val: unknown): Proefnotitie[] {
    return coerceJsonArray(val)
        .map((r) => ({
            wijnnaam: normalizeEmDashes(String(r.wijnnaam ?? r.naam ?? '')),
            jaar: String(r.jaar ?? '').trim(),
            wijnmaker: normalizeEmDashes(String(r.wijnmaker ?? '')),
            appellation: normalizeEmDashes(String(r.appellation ?? r.appellatie ?? '')),
            gedronkenIn: normalizeEmDashes(String(r.gedronken_in ?? r.gedronkenIn ?? r.locatie ?? '')),
            prijs: String(r.prijs ?? '').trim(),
            notitie: normalizeEmDashes(String(r.notitie ?? '')),
            etiketFoto: r.etiket_foto ? String(r.etiket_foto) : (r.etiketFoto ? String(r.etiketFoto) : null),
            etiketFotoAlt: r.etiket_foto_alt ? String(r.etiket_foto_alt) : (r.etiketFotoAlt ? String(r.etiketFotoAlt) : null),
        }))
        .filter((p) => p.wijnnaam);
}

function mapEerstDitBoeken(val: unknown): EerstDitBoekenItem[] {
    return coerceJsonArray(val)
        .map((r) => ({
            naam: normalizeEmDashes(String(r.naam ?? r.categorie ?? '')),
            handeling: normalizeEmDashes(String(r.handeling ?? r.actie ?? '')),
        }))
        .filter((i) => i.naam || i.handeling);
}

// LAT-2358: when an article has no pub_date, do NOT fall back to the build's
// `new Date()` — that stamps every dateless article with today and shifts it on
// each rebuild, which is exactly the "machine-generated" smell we are removing.
// Derive a stable date from the slug inside the historic window instead, so
// builds are reproducible until the real pub_date is backfilled in Directus.
function stableFallbackPubDate(slug: string): string {
    const START = Date.UTC(2026, 0, 13); // 2026-01-13
    const END = Date.UTC(2026, 6, 12); // 2026-07-12
    let h = 2166136261;
    for (let i = 0; i < slug.length; i++) {
        h ^= slug.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const span = (END - START) / 86400000;
    const offsetDays = (h >>> 0) % (span + 1);
    return new Date(START + offsetDays * 86400000).toISOString().slice(0, 10);
}

function mapArticle(
    a: Record<string, unknown>,
    heroImagePath: string | null,
    ogImagePath: string | null,
    bodyHtml: string,
    toc: TocItem[],
    wordCount: number,
    readingMinutes: number,
): Article {
    return {
          slug: String(a.slug),
          title: normalizeEmDashes(String(a.title)),
          description: normalizeEmDashes(String(a.description || '')),
          author: String(a.author || 'VinoMartino'),
          pubDate: String(a.pub_date || stableFallbackPubDate(String(a.slug))),
          updatedAt: a.updated_at ? String(a.updated_at) : null,
          category: String(a.category || ''),
          tags: (a.tags as string[]) || [],
          heroImage: heroImagePath,
          heroImageId: a.hero_image ? String(a.hero_image) : null,
          ogImage: ogImagePath,
          status: String(a.status || 'draft'),
          featured: a.featured === true || a.featured === 1 || a.featured === '1',
          metaTitle: normalizeEmDashes(String(a.meta_title || a.title)),
          metaDescription: normalizeEmDashes(String(a.meta_description || a.description || '')),
          bodyHtml,
          wordCount,
          readingMinutes,
          toc,
          faqSchema: a.faq_schema_json ? String(a.faq_schema_json) : null,
          relatedStreken: mapRelatedRefs(a.related_streken, 'streken_id', 'name'),
          relatedWijnhuizen: mapRelatedRefs(a.related_wijnhuizen, 'wijnhuizen_id', 'name'),
          relatedWijnroutes: mapRelatedRefs(a.related_routes, 'routes_id', 'title'),
          relatedLanden: mapRelatedRefs(a.related_landen, 'landen_id', 'name'),
          // LAT-1619: zelf-referentiële M2M; junction-FK naar de doel-article is
          // `related_articles_id` voor beide velden (related_articles, meer_over).
          relatedArtikelen: mapRelatedRefs(a.related_articles, 'related_articles_id', 'title').slice(0, 3),
          meerOver: mapRelatedRefs(a.meer_over, 'related_articles_id', 'title').slice(0, 3),
          cta: getCtaStructure(a),
          // LAT-1958 — twee-tier authenticiteitsmodel (regels: LAT-1957). Zelfde
          // tolerante coercion als `featured` (Directus levert true/1/'1').
          zelfGereisd: a.zelf_gereisd === true || a.zelf_gereisd === 1 || a.zelf_gereisd === '1',
          bezoekjaar: Number.isFinite(Number(a.bezoekjaar)) && a.bezoekjaar !== null && a.bezoekjaar !== ''
                ? Number(a.bezoekjaar)
                : null,
          // LAT-2112 — rubriekenstelsel + visuele stempel (kader LAT-2014).
          rubriek: a.rubriek ? String(a.rubriek) : null,
          tier: a.tier ? String(a.tier) : null,
          plaatsstempel: a.plaatsstempel ? normalizeEmDashes(String(a.plaatsstempel)).trim() : null,
          proefnotities: mapProefnotities(a.proefnotities),
          eerstDitBoeken: mapEerstDitBoeken(a.eerst_dit_boeken),
    };
}

/**
 * Load published articles from Directus.
 *
 * Directus is the canonical content source. Legacy seed markdown lives in
 * src/content/_legacy/posts/ and is archive-only since LAT-1078 — no loader
 * reads it at runtime.
 *
 * Throws on any failure so silent broken builds (build succeeds with 0 articles)
 * are impossible by design.
 */
async function fetchArticlesItems(url: string, token: string): Promise<Record<string, unknown>[]> {
    const env = readDirectusEnv();
    const baseFields = 'id,slug,title,description,body,pub_date,author,category,tags,hero_image,og_image,status,meta_title,meta_description';
    // LAT-1611: `featured` markeert het "verhaal van de week" op de homepage.
    // Bewust NIET in baseFields (de laatste fallback) zodat een pre-migratie
    // Directus zonder dit veld graceful degradeert naar nieuwste-artikel ipv
    // hard te breken. Zodra DevOps het veld toevoegt, leest withUpdatedAt het.
    const withUpdatedAt = `${baseFields},updated_at,featured`;
    // LAT-1098: 4 forward relations toegevoegd aan articles. Junction-tabellen
    // volgen Directus-conventie `articles_<entity>` met FK `<entity>_id`.
    // Faalt graceful met 400/403 retry naar withUpdatedAt zolang LAT-1097
    // schema nog niet live is — site bouwt dan zonder cross-links.
    const withRelations = `${withUpdatedAt}` +
        ',related_streken.streken_id.slug,related_streken.streken_id.name' +
        ',related_wijnhuizen.wijnhuizen_id.slug,related_wijnhuizen.wijnhuizen_id.name' +
        ',related_routes.routes_id.slug,related_routes.routes_id.title' +
        ',related_landen.landen_id.slug,related_landen.landen_id.name';
    // LAT-1619: artikel→artikel cross-links (zelf-referentiële M2M). Junctions
    // `articles_related` + `articles_meer_over`, beide met FK `related_articles_id`
    // naar de doel-article. Eigen degradatie-tier bovenop LAT-1098 zodat de
    // bestaande entiteit-cross-links blijven werken zolang LAT-1619-schema nog
    // niet live is.
    const withArticleRelations = `${withRelations}` +
        ',related_articles.related_articles_id.slug,related_articles.related_articles_id.title' +
        ',meer_over.related_articles_id.slug,meer_over.related_articles_id.title';
    // LAT-1680: FAQPage JSON-LD-veld. Eigen degradatie-tier bovenop zodat een
    // pre-migratie Directus (veld bestaat niet) of een build-rol zonder read-perm
    // graceful terugvalt naar withArticleRelations i.p.v. de build te breken.
    const withFaqSchema = `${withArticleRelations},faq_schema_json`;
    // LAT-1784/LAT-1795: cta_blocks als rijkste tier; degradeert per-tier zacht
    // terug naar withFaqSchema als veld/permissie ontbreekt (CTA's renderen niets).
    const withCta = `${withFaqSchema},cta_blocks`;
    // LAT-1958: twee-tier authenticiteitsvelden als rijkste tier. Degradeert zacht
    // terug naar withCta als veld/permissie ontbreekt (badge rendert dan niets).
    const withVisited = `${withCta},zelf_gereisd,bezoekjaar`;
    // LAT-2112: rubriekenstelsel + visuele stempel als rijkste tier. Degradeert
    // zacht terug naar withVisited als veld/permissie ontbreekt (stempel/kaarten
    // renderen dan niets — de rest van het artikel blijft ongewijzigd).
    const withRubrieken = `${withVisited},rubriek,tier,plaatsstempel,proefnotities,eerst_dit_boeken`;
    // LAT-1053: scheduled publish — verberg artikelen waarvan pub_date in de toekomst
    // ligt, ook als status=published. Directus's $NOW resolvet server-side; pub_date
    // null wordt eveneens getoond (legacy/onbekend) zodat bestaande artikelen niet
    // ineens verdwijnen. Drafts blijven excluded via statusFilterQuery.
    const futureGate = '&filter[_or][0][pub_date][_lte]=$NOW&filter[_or][1][pub_date][_null]=true';
    const filterSort = `${statusFilterQuery(env)}${futureGate}&sort=-pub_date`;
    const headers = { Authorization: `Bearer ${token}` };

    // Degradatie-tiers van rijk → arm. Een 400 (veld bestaat niet, pre-migratie)
    // of 403 (veld bestaat maar build-rol mist read-permissie) zakt naar de
    // volgende tier i.p.v. de build te breken. Elke tier laat alleen zijn eigen
    // velden vallen, zodat bv. LAT-1619 artikel-links degraderen zonder de
    // LAT-1098 entiteit-links mee te slepen.
    const tiers: { fields: string; drop: string; hint: string }[] = [
        { fields: withRubrieken, drop: 'rubriek/tier/plaatsstempel/proefnotities/eerst_dit_boeken', hint: 'Run LAT-2112 Directus-schema (directus/scripts/add-rubrieken-stempel-fields.mjs) en/of geef de build-rol read-permissie op de rubriekvelden.' },
        { fields: withVisited, drop: 'zelf_gereisd/bezoekjaar', hint: 'Maak articles.zelf_gereisd/bezoekjaar aan (LAT-1958) en/of geef de build-rol read-permissie erop.' },
        { fields: withCta, drop: 'cta_blocks', hint: 'Maak articles.cta_blocks aan (LAT-1784) en/of geef de build-rol read-permissie op articles.cta_blocks.' },
        { fields: withFaqSchema, drop: 'faq_schema_json', hint: 'Run LAT-1680 Directus-schema (directus/scripts/add-faq-schema-field.mjs) en/of geef de build-rol read-permissie op articles.faq_schema_json.' },
        { fields: withArticleRelations, drop: 'related_articles/meer_over', hint: 'Run LAT-1619 Directus M2M-schema (directus/scripts/add-related-articles-fields.mjs) en/of geef de build-rol read-permissie op related_articles + meer_over.' },
        { fields: withRelations, drop: 'related_* (LAT-1098)', hint: 'Run LAT-1097 (Directus M2M schema) en/of geef de build-rol read-permissie op related_*.' },
        { fields: withUpdatedAt, drop: 'updated_at', hint: 'Run directus/scripts/add-seo-meta-fields.mjs en/of geef de build-rol read-permissie op articles.updated_at.' },
        { fields: baseFields, drop: '(none)', hint: '' },
    ];

    let lastStatus = 0;
    let lastBody = '';
    for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          let res: Response;
          try {
                res = await fetch(`${url}/items/articles?limit=-1&fields=${tier.fields}${filterSort}`, { headers, signal: AbortSignal.timeout(15000) });
          } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`[loadArticles] Directus unreachable at ${url}: ${msg}`);
          }
          if (res.ok) {
                const json = await res.json();
                return (json.data || []) as Record<string, unknown>[];
          }
          lastStatus = res.status;
          lastBody = await res.text().catch(() => '');
          const nextTier = tiers[i + 1];
          if ((res.status === 400 || res.status === 403) && nextTier) {
                console.warn(`[loadArticles] Directus rejected fields incl. ${tier.drop} (HTTP ${res.status}) — retrying without them. ${tier.hint}`);
                continue;
          }
          break;
    }
    throw new Error(`[loadArticles] Directus returned ${lastStatus} for /items/articles after all field-tier fallbacks: ${lastBody.slice(0, 300)}`);
}

async function loadFromDirectus(url: string, token: string): Promise<Article[]> {
    const data = await fetchArticlesItems(url, token);
    const items = await Promise.all(
          data.map(async (a) => {
                  const rawBody = String(a.body || '');
                  const { body: cleanBody, extracted } = stripMetaDescriptionFromBody(rawBody);
                  if (extracted && !a.meta_description) {
                            a.meta_description = extracted;
                  }
                  if (!a.meta_description && !a.description && cleanBody) {
                            const firstPara = cleanBody.trim().split(/\n\n+/)[0].replace(/[#*`_~[\]()]/g, '').trim();
                            if (firstPara.length > 30) a.description = firstPara.slice(0, 160);
                  }
                  const wordCount = cleanBody ? countWords(cleanBody) : 0;
                  const readingMinutes = Math.max(1, Math.ceil(wordCount / 200));
                  const { html: bodyHtml, toc } = cleanBody
                        ? await renderArticleBody(cleanBody, String(a.slug))
                        : { html: '', toc: [] };
                  const [heroImagePath, ogImagePath] = await Promise.all([
                        a.hero_image ? downloadArticleAsset(String(a.hero_image), url, token) : Promise.resolve(null),
                        a.og_image ? downloadArticleAsset(String(a.og_image), url, token) : Promise.resolve(null),
                  ]);
                  return mapArticle(a, heroImagePath, ogImagePath, bodyHtml, toc, wordCount, readingMinutes);
          }),
        );
    console.log(`[loadArticles] fetched ${items.length} articles from Directus`);
    return items;
}

export async function loadArticles(): Promise<Article[]> {
    const env = readDirectusEnv();
    assertDirectusConfigured('loadArticles', env);
    return loadFromDirectus(env.url, env.token);
}
