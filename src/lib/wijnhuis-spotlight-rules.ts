// LAT-13075 — pure spotlightregels (zonder Directus-imports, testbaar met strip-types).
import type { Wijnhuis } from './wijnhuizen';
import type { Locale } from './i18n';

/** Twee nachtelijke builds plus marge: alles wat daarin start, staat al in de HTML. */
export const SPOTLIGHT_HORIZON_MS = 50 * 3600 * 1000;

export interface SpotlightRow {
    id: number;
    status: string;
    wijnhuisSlug: string;
    startAt: string;
    endAt: string;
    campagneId: string;
    teaserNl: string;
    teaserEn: string;
}

export interface SpotlightEntry {
    id: number;
    start: number;
    end: number;
    campagneId: string;
    teaser: string;
    huis: Wijnhuis;
}

export function sentenceCount(text: string): number {
    return text.trim().split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean).length;
}

/**
 * Valideert ruwe rijen tegen de gepubliceerde huizen van deze locale. Een rij telt
 * alleen mee als: published, geldig venster (start < einde), gekoppeld huis
 * gepubliceerd in deze locale, NL én EN teaser aanwezig (max. twee zinnen), en een
 * huishero met bekende DAM-licentie (`hasCredit`). Afwijzingen komen in `rejected`.
 */
export function validateSpotlights(
    rows: SpotlightRow[],
    huizen: Wijnhuis[],
    locale: Locale,
    hasCredit: (huis: Wijnhuis) => boolean,
): { entries: SpotlightEntry[]; rejected: { id: number; reason: string }[] } {
    const bySlug = new Map(huizen.map((h) => [h.slug, h]));
    const entries: SpotlightEntry[] = [];
    const rejected: { id: number; reason: string }[] = [];
    for (const r of rows) {
        const no = (reason: string) => rejected.push({ id: r.id, reason });
        if (r.status !== 'published') { no('niet published'); continue; }
        const start = Date.parse(r.startAt), end = Date.parse(r.endAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) { no('ongeldig venster'); continue; }
        const huis = bySlug.get(r.wijnhuisSlug);
        if (!huis) { no(`huis '${r.wijnhuisSlug}' niet gepubliceerd in ${locale}`); continue; }
        const nl = r.teaserNl.trim(), en = r.teaserEn.trim();
        if (!nl || !en) { no('NL of EN teaser ontbreekt'); continue; }
        if (sentenceCount(nl) > 2 || sentenceCount(en) > 2) { no('teaser langer dan twee zinnen'); continue; }
        if (!huis.heroImage || !hasCredit(huis)) { no('geen hero met bekende DAM-licentie'); continue; }
        entries.push({ id: r.id, start, end, campagneId: r.campagneId || `spotlight-${r.id}`, teaser: locale === 'en' ? en : nl, huis });
    }
    return { entries: sortByPriority(entries), rejected };
}

/** Overlap-regel: de laatst gestarte wint, bij gelijke start het laagste id. */
export function sortByPriority(entries: SpotlightEntry[]): SpotlightEntry[] {
    return [...entries].sort((a, b) => b.start - a.start || a.id - b.id);
}

export function pickActive(entries: SpotlightEntry[], now: number): SpotlightEntry | null {
    return sortByPriority(entries).find((e) => e.start <= now && now < e.end) ?? null;
}

/** Wat de build in de HTML zet: alles wat nog niet verlopen is en binnen de horizon start. */
export function renderCandidates(entries: SpotlightEntry[], buildNow: number): SpotlightEntry[] {
    return sortByPriority(entries).filter((e) => e.end > buildNow && e.start < buildNow + SPOTLIGHT_HORIZON_MS);
}


/** Licenties die geen bevestigd beeldrecht zijn: leeg, onbekend, onbevestigd of AI (REGEL 61/64). */
const UNCONFIRMED_LICENSES = new Set(['', 'onbekend', 'booking-onbevestigd', 'pers-onbevestigd', 'synthetisch']);
export function hasConfirmedLicense(licentie: string | null | undefined): boolean {
    return !UNCONFIRMED_LICENSES.has(String(licentie ?? '').trim().toLowerCase());
}
