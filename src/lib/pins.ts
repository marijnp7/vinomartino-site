/**
 * LAT-11988 (groeiplan 5.0): pure logica voor de Pinterest-RSS-feed `/pins.xml`.
 *
 * Geen Astro- of Directus-imports, zodat `node --test` dit direct laadt. De
 * feed-route (`pages/pins.xml.ts`) en de plan-module (`pin-plan.ts`) leveren de
 * data; hier staan clusterregels, rotatie, lint, UTM en de RSS-serialisatie.
 */

export const SITE = 'https://vinomartino.com';
export const PINS_PER_WEEKDAY = 5;
export const FEED_WEEKDAYS = 5;

export type PinLang = 'en' | 'nl';

export interface PinCluster {
    id: string;
    lang: PinLang;
    /** Deelstrings (lowercase) die in slug of naam van een gekoppelde streek moeten staan. */
    streekMatch: string[];
    /** Deelstrings (lowercase) in tags, rubriek of slug; alleen voor de B-test. */
    tagMatch?: string[];
}

/**
 * Taalregel uit KANALEN sectie 2: Engels voor D (Champagne, Kaap, Langhe,
 * Toscane), Nederlands voor Moezel, Loire en de B-test (autovakantie). Zodra de
 * clusterlijst `clusters.yml` (taak 3.3) er is, vervangt die deze constante.
 */
export const PIN_CLUSTERS: readonly PinCluster[] = [
    { id: 'b-test', lang: 'nl', streekMatch: [], tagMatch: ['autovakantie', 'auto-vakantie'] },
    { id: 'champagne', lang: 'en', streekMatch: ['champagne'] },
    { id: 'kaap', lang: 'en', streekMatch: ['kaap', 'cape', 'stellenbosch', 'franschhoek', 'winelands', 'constantia', 'hemel-en-aarde', 'swartland'] },
    { id: 'langhe', lang: 'en', streekMatch: ['langhe', 'piemonte', 'piedmont', 'barolo', 'barbaresco'] },
    { id: 'toscane', lang: 'en', streekMatch: ['toscane', 'tuscany', 'chianti', 'montalcino'] },
    { id: 'moezel', lang: 'nl', streekMatch: ['mosel', 'moezel'] },
    { id: 'loire', lang: 'nl', streekMatch: ['loire'] },
];

/**
 * LAT-12109 (groeiplan zet 5, week 40): kant-en-klare pinbeelden uit het DAM
 * (Directus `/files`, 1000x1500, synthetisch met zichtbare disclosure). Een batch
 * neemt op één werkdag de plekken van de rotatie over; `slug` is de NL-slug van
 * het artikel (Champagne verwijst naar de EN-pagina met dezelfde slug). Deze
 * artikelen doen niet meer mee aan de gewone rotatie: het DAM-beeld is het enige.
 * Burgenland en Priorat staan niet in PIN_CLUSTERS en volgen de standaardtaal NL.
 */
export interface PinDamPin {
    articleId: number;
    slug: string;
    lang: PinLang;
    fileId: string;
}

export interface PinDamBatch {
    day: string;
    pins: readonly PinDamPin[];
}

export const PIN_DAM_BATCHES: readonly PinDamBatch[] = [
    {
        day: '2026-09-30',
        pins: [
            { articleId: 139, slug: 'champagne-overnachten-reims-epernay', lang: 'en', fileId: '32d9d6ee-098d-46d0-a9f6-9f8e10aa00a6' },
            { articleId: 141, slug: 'champagnehuizen-bezoeken-met-of-zonder-tour', lang: 'en', fileId: 'ff1fb993-121c-4388-8562-d0805c764cd2' },
            { articleId: 142, slug: 'kleine-champagnehuizen-bezoeken-proeverij-boeken', lang: 'en', fileId: '33d28f07-344c-49fc-9818-31ae256848ed' },
            { articleId: 136, slug: 'burgenland-blaufrankisch-route-twee-dagen', lang: 'nl', fileId: '66621cf9-9805-4180-8c4b-29be97a9705d' },
            { articleId: 131, slug: 'priorat-licorella-route-gratallops-torroja', lang: 'nl', fileId: 'd0b9f126-adc4-4c8c-9cb5-e7d49f93da33' },
        ],
    },
];

export const PIN_DAM_SLUGS: ReadonlySet<string> = new Set(PIN_DAM_BATCHES.flatMap((b) => b.pins.map((p) => p.slug)));

/** Een dag: eerst de DAM-pins, daarna de rotatie tot `perDay` plekken gevuld zijn. */
export function composeDay<T>(dam: T[], rotationPicks: T[], perDay = PINS_PER_WEEKDAY): T[] {
    const head = dam.slice(0, perDay);
    return [...head, ...rotationPicks.slice(0, perDay - head.length)];
}

export interface PinSource {
    slug: string;
    title: string;
    description: string;
    category: string;
    tags: string[];
    streken: { slug: string; name: string }[];
}

export function clusterOf(a: PinSource): PinCluster | null {
    const hay = [a.category, a.slug, ...a.tags].map((s) => String(s ?? '').toLowerCase());
    for (const c of PIN_CLUSTERS) {
        if (c.tagMatch?.some((m) => hay.some((h) => h.includes(m)))) return c;
    }
    const streken = a.streken.flatMap((s) => [s.slug, s.name]).map((s) => String(s ?? '').toLowerCase());
    for (const c of PIN_CLUSTERS) {
        if (c.streekMatch.some((m) => streken.some((s) => s.includes(m)))) return c;
    }
    return null;
}

// ---------------------------------------------------------------- lint

export interface LintHit {
    rule: string;
    match: string;
}

const LINT_RULES: { rule: string; re: RegExp }[] = [
    { rule: 'c-tier', re: /\bTier\s?\d/i },
    { rule: 'c-draft', re: /\bDraft v/i },
    { rule: 'c-lat', re: /\bLAT-\d+/ },
    { rule: 'd-dash', re: /[–—]/ },
    { rule: 'd-spaced-hyphen', re: /\s-\s/ },
    { rule: 'e-martin', re: /\bMartin\b/ },
    { rule: 'e-wset4', re: /\bWSET\s?(4|level 4|niveau 4)\b/i },
    { rule: 'a-sophie', re: /\bSophie\b/ },
    { rule: 'a-geproefd', re: /\bgeproefd\b/i },
    { rule: 'a-we-sliepen', re: /\bwe (sliepen|zaten|liepen|aten|dronken|reden|bezochten)\b/i },
    { rule: 'a-we-past-en', re: /\bwe (stayed|slept|sat|walked|ate|drank|drove|visited|tasted)\b/i },
    { rule: 'a-i-past-en', re: /\bI (tasted|stayed|slept|visited|walked|drove|ate|drank)\b/ },
    { rule: 'a-ik-past-nl', re: /\bik (proefde|sliep|bezocht|liep|reed|at|dronk)\b/i },
];

/** Authenticiteits-lint (PAPERCLIP sectie 8, regels a, c, d, e, g) op een stuk pintekst. */
export function lintText(text: string): LintHit[] {
    const hits: LintHit[] = [];
    for (const { rule, re } of LINT_RULES) {
        const m = re.exec(text);
        if (m) hits.push({ rule, match: m[0] });
    }
    return hits;
}

// ---------------------------------------------------------------- rotatie

const DAY_MS = 86_400_000;
// Maandag 5 januari 2026, 00:00 UTC: anker voor het werkdagnummer.
const ANCHOR_MS = Date.UTC(2026, 0, 5);

export function isWeekday(d: Date): boolean {
    const dow = d.getUTCDay();
    return dow >= 1 && dow <= 5;
}

/** De laatste `count` werkdagen tot en met `now` (UTC), oudste eerst. */
export function lastWeekdays(now: Date, count = FEED_WEEKDAYS): Date[] {
    const out: Date[] = [];
    let t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    while (out.length < count) {
        const d = new Date(t);
        if (isWeekday(d)) out.unshift(d);
        t -= DAY_MS;
    }
    return out;
}

/** Doorlopend werkdagnummer sinds het anker (ma=0, di=1, ..., vr=4, volgende ma=5). */
export function weekdayNumber(d: Date): number {
    const days = Math.round((d.getTime() - ANCHOR_MS) / DAY_MS);
    return Math.floor(days / 7) * 5 + (((days % 7) + 7) % 7);
}

/** Verweeft de clusters (round robin), zodat een dag niet uit één streek bestaat. */
export function interleaveByCluster<T extends { clusterId: string; slug: string }>(items: T[]): T[] {
    const groups = new Map<string, T[]>();
    for (const it of [...items].sort((a, b) => a.slug.localeCompare(b.slug))) {
        if (!groups.has(it.clusterId)) groups.set(it.clusterId, []);
        groups.get(it.clusterId)!.push(it);
    }
    const order = PIN_CLUSTERS.map((c) => c.id).filter((id) => groups.has(id));
    const out: T[] = [];
    for (let i = 0; out.length < items.length; i++) {
        for (const id of order) {
            const g = groups.get(id)!;
            if (i < g.length) out.push(g[i]);
        }
    }
    return out;
}

/** Vaste rotatie: werkdag w krijgt items w*5 .. w*5+4 (modulo N), zonder dubbelen. */
export function selectForWeekday<T>(rotation: T[], d: Date, perDay = PINS_PER_WEEKDAY): T[] {
    const n = rotation.length;
    if (n === 0) return [];
    const take = Math.min(perDay, n);
    const start = (((weekdayNumber(d) * perDay) % n) + n) % n;
    return Array.from({ length: take }, (_, j) => rotation[(start + j) % n]);
}

// ---------------------------------------------------------------- tekst en url

/** Kapt af op een woordgrens; geen streepje of puntjes die de lint raken. */
export function truncateAtWord(text: string, max: number): string {
    const t = text.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, '');
}

export function pageUrl(lang: PinLang, slug: string): string {
    return `${SITE}${lang === 'en' ? '/en' : ''}/artikelen/${slug}/`;
}

export function pinUrl(lang: PinLang, slug: string): string {
    const u = new URL(pageUrl(lang, slug));
    u.searchParams.set('utm_source', 'pinterest');
    u.searchParams.set('utm_medium', 'social');
    u.searchParams.set('utm_campaign', 'pins-feed');
    u.searchParams.set('utm_content', `${lang}-${slug}`);
    return u.toString();
}

export function pinImageUrl(lang: PinLang, slug: string, ext: 'jpg' | 'png' = 'jpg'): string {
    return `${SITE}/pins/${lang}/${slug}.${ext}`;
}

export interface PinItem {
    lang: PinLang;
    slug: string;
    clusterId: string;
    title: string;
    description: string;
    link: string;
    image: string;
    imageBytes: number;
    /** Standaard image/jpeg; DAM-pins zijn PNG en gaan ongewijzigd de feed in. */
    imageMime?: string;
    date: Date;
}

// ---------------------------------------------------------------- RSS

export function xmlEscape(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export function renderFeed(items: PinItem[], builtAt: Date): string {
    const body = items
        .map((it, i) => {
            const pub = new Date(it.date.getTime() + i * 60_000);
            return [
                '    <item>',
                `      <title>${xmlEscape(it.title)}</title>`,
                `      <link>${xmlEscape(it.link)}</link>`,
                `      <guid isPermaLink="false">pin-${ymd(it.date)}-${it.lang}-${xmlEscape(it.slug)}</guid>`,
                `      <pubDate>${pub.toUTCString()}</pubDate>`,
                `      <description>${xmlEscape(it.description)}</description>`,
                `      <enclosure url="${xmlEscape(it.image)}" length="${it.imageBytes}" type="${it.imageMime ?? 'image/jpeg'}" />`,
                `      <media:content url="${xmlEscape(it.image)}" medium="image" type="${it.imageMime ?? 'image/jpeg'}" width="1000" height="1500" />`,
                '    </item>',
            ].join('\n');
        })
        .join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">',
        '  <channel>',
        '    <title>VinoMartino</title>',
        `    <link>${SITE}/</link>`,
        '    <description>Wine travel guides from VinoMartino: where to stay, what to visit and how to plan a wine trip.</description>',
        '    <language>en</language>',
        `    <lastBuildDate>${builtAt.toUTCString()}</lastBuildDate>`,
        `    <atom:link href="${SITE}/pins.xml" rel="self" type="application/rss+xml" />`,
        body,
        '  </channel>',
        '</rss>',
        '',
    ].join('\n');
}

/** Alle tekst die de feed zichtbaar maakt, voor de lint op het eindproduct. */
export function feedTexts(xml: string): string[] {
    const out: string[] = [];
    const re = /<(title|description)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
        out.push(
            m[2]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&'),
        );
    }
    return out;
}
