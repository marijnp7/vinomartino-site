// LAT-12769 — Wijnhuis-portret 2.0: normalisatie van de gestructureerde Directus-velden
// (LAT-12786). Elk veld is optioneel; een leeg of ongeldig veld wordt `null`/`[]`
// zodat de template het blok verbergt (nooit een leeg kader).

export const BODEMS = ['leisteen', 'kalk', 'vulkanisch', 'zand', 'klei', 'loess', 'graniet', 'overig'] as const;
export type Bodem = (typeof BODEMS)[number];

export const BEZOEK_TYPES = ['zonder_afspraak', 'vinothek', 'op_afspraak'] as const;
export type BezoekType = (typeof BEZOEK_TYPES)[number];

export const WIJN_ROLLEN = ['instap', 'signature', 'splurge'] as const;
export type WijnRol = (typeof WIJN_ROLLEN)[number];

export const DAGEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;
export type Dag = (typeof DAGEN)[number];

export interface Druif { naam: string; pct: number }
export interface PortretWijn {
    naam: string;
    rol: WijnRol;
    prijsband: number | null;
    van: number | null;
    tot: number | null;
    koopUrl: string | null;
}
export interface Proeverij { prijs: number | null; duur: number | null; talen: string[]; url: string | null }
export interface Openingstijden {
    /** undefined = onbekend, [] = gesloten, anders ["HH:MM-HH:MM", ...] */
    dagen: Partial<Record<Dag, string[]>>;
    opmerking: string | null;
}
export interface PortretAfbeelding { id: string; alt: string; width: number | null; height: number | null }
export interface NabijWijnhuis { slug: string; name: string }
export interface PortretFaq { vraag: string; antwoord: string }

export interface WijnhuisPortret {
    generatie: number | null;
    topwijngaarden: string[];
    druiven: Druif[];
    bodem: Bodem | null;
    maxHellingPct: number | null;
    stijl: { zoet: number | null; vol: number | null; bewaar: number | null };
    prijsband: number | null;
    bezoekType: BezoekType | null;
    talen: string[];
    openingstijden: Openingstijden | null;
    proeverij: Proeverij | null;
    zelfGeweest: boolean;
    onzeErvaring: string;
    wijnen: PortretWijn[];
    routeSlugs: string[];
    nabije: NabijWijnhuis[];
    afbeeldingen: PortretAfbeelding[];
    /** LAT-12804 — blok 3 "Waarom je hier heen gaat", max 3 regels. */
    waaromHier: string[];
    /** LAT-12804 — blok 10 "Snel antwoord"; voedt ook de FAQPage JSON-LD. */
    faq: PortretFaq[];
}

function parseJson(val: unknown): unknown {
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch { return null; }
}

function int(val: unknown, min: number, max: number): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
}

function strList(val: unknown): string[] {
    const v = parseJson(val);
    if (!Array.isArray(v)) return [];
    return v.map((s) => String(s ?? '').trim()).filter(Boolean);
}

function oneOf<T extends string>(val: unknown, set: readonly T[]): T | null {
    return typeof val === 'string' && (set as readonly string[]).includes(val) ? (val as T) : null;
}

/** Alleen http(s)-URLs; alles anders (javascript:, relatief gegokt) valt weg. */
export function safeUrl(val: unknown): string | null {
    if (typeof val !== 'string') return null;
    try {
        const u = new URL(val.trim());
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch { return null; }
}

export function normalizeDruiven(val: unknown): Druif[] {
    const v = parseJson(val);
    if (!Array.isArray(v)) return [];
    const rows = v
        .map((r): Druif | null => {
            if (!r || typeof r !== 'object') return null;
            const rec = r as Record<string, unknown>;
            const naam = String(rec.naam ?? '').trim();
            const pct = Number(rec.pct);
            return naam && Number.isFinite(pct) && pct > 0 && pct <= 100 ? { naam, pct } : null;
        })
        .filter((r): r is Druif => r !== null)
        .sort((a, b) => b.pct - a.pct);
    // De som mag niet boven 100 uitkomen; Directus dwingt dat niet af (LAT-12786 punt 4).
    const total = rows.reduce((s, r) => s + r.pct, 0);
    return total > 100.5 ? [] : rows;
}

export function normalizeWijnen(val: unknown): PortretWijn[] {
    const v = parseJson(val);
    if (!Array.isArray(v)) return [];
    const out: PortretWijn[] = [];
    for (const r of v) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        const naam = String(rec.naam ?? '').trim();
        const rol = oneOf(rec.rol, WIJN_ROLLEN);
        if (!naam || !rol) continue;
        const dv = (rec.drinkvenster && typeof rec.drinkvenster === 'object' ? rec.drinkvenster : {}) as Record<string, unknown>;
        out.push({
            naam,
            rol,
            prijsband: int(rec.prijsband, 1, 4),
            van: int(dv.van, 1900, 2200),
            tot: int(dv.tot, 1900, 2200),
            koopUrl: safeUrl(rec.koop_url),
        });
    }
    const order = new Map(WIJN_ROLLEN.map((r, i) => [r, i]));
    return out.sort((a, b) => order.get(a.rol)! - order.get(b.rol)!).slice(0, 3);
}

const TIJD = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeOpeningstijden(val: unknown): Openingstijden | null {
    const v = parseJson(val);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const rec = v as Record<string, unknown>;
    const dagen: Partial<Record<Dag, string[]>> = {};
    for (const d of DAGEN) {
        if (!(d in rec) || !Array.isArray(rec[d])) continue;
        dagen[d] = (rec[d] as unknown[]).map(String).filter((s) => TIJD.test(s));
    }
    const opmerking = typeof rec.opmerking === 'string' && rec.opmerking.trim() ? rec.opmerking.trim() : null;
    return Object.keys(dagen).length || opmerking ? { dagen, opmerking } : null;
}

export function normalizeProeverij(val: unknown): Proeverij | null {
    const v = parseJson(val);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const rec = v as Record<string, unknown>;
    const p: Proeverij = {
        prijs: int(rec.prijs, 0, 10000),
        duur: int(rec.duur, 1, 1440),
        talen: strList(rec.taal),
        url: safeUrl(rec.url),
    };
    return p.prijs !== null || p.duur !== null || p.talen.length || p.url ? p : null;
}

export function normalizeFaq(val: unknown): PortretFaq[] {
    const v = parseJson(val);
    if (!Array.isArray(v)) return [];
    const out: PortretFaq[] = [];
    for (const r of v) {
        if (!r || typeof r !== 'object') continue;
        const rec = r as Record<string, unknown>;
        const vraag = String(rec.vraag ?? '').trim();
        const antwoord = String(rec.antwoord ?? '').trim();
        // Half ingevulde paren vallen weg: Google eist dat elke Question een Answer heeft.
        if (vraag && antwoord) out.push({ vraag, antwoord });
    }
    return out;
}

function junctionIds<T>(val: unknown, pick: (row: Record<string, unknown>) => T | null): T[] {
    if (!Array.isArray(val)) return [];
    const out: T[] = [];
    for (const row of val) {
        if (!row || typeof row !== 'object') continue;
        const picked = pick(row as Record<string, unknown>);
        if (picked !== null) out.push(picked);
    }
    return out;
}

export function normalizePortret(r: Record<string, unknown>): WijnhuisPortret {
    return {
        generatie: int(r.eigenaar_generatie, 1, 30),
        topwijngaarden: strList(r.topwijngaarden),
        druiven: normalizeDruiven(r.druiven),
        bodem: oneOf(r.bodem, BODEMS),
        maxHellingPct: int(r.max_helling_pct, 0, 100),
        stijl: { zoet: int(r.stijl_zoet, 1, 5), vol: int(r.stijl_vol, 1, 5), bewaar: int(r.stijl_bewaar, 1, 5) },
        prijsband: int(r.prijsband, 1, 4),
        bezoekType: oneOf(r.bezoek_type, BEZOEK_TYPES),
        talen: strList(r.talen).map((t) => t.toLowerCase()),
        openingstijden: normalizeOpeningstijden(r.openingstijden),
        proeverij: normalizeProeverij(r.proeverij),
        zelfGeweest: r.zelf_geweest === true,
        onzeErvaring: typeof r.onze_ervaring === 'string' ? r.onze_ervaring.trim() : '',
        wijnen: normalizeWijnen(r.wijnen),
        routeSlugs: junctionIds(r.routes, (row) => {
            const inner = row.routes_id as Record<string, unknown> | undefined;
            return inner && typeof inner === 'object' && inner.slug ? String(inner.slug) : null;
        }),
        nabije: junctionIds(r.nabije_wijnhuizen, (row) => {
            const inner = row.nabij_id as Record<string, unknown> | undefined;
            return inner && typeof inner === 'object' && inner.slug
                ? { slug: String(inner.slug), name: String(inner.name ?? inner.slug) }
                : null;
        }),
        afbeeldingen: junctionIds(r.afbeeldingen, (row) => {
            const inner = row.directus_files_id as Record<string, unknown> | undefined;
            if (!inner || typeof inner !== 'object' || !inner.id) return null;
            const w = Number(inner.width);
            const h = Number(inner.height);
            const alt = String(inner.title || inner.description || '').trim();
            return { id: String(inner.id), alt, width: w > 0 ? w : null, height: h > 0 ? h : null };
        }),
        // Directus dwingt de max van 3 niet af (LAT-12804); de template toont de eerste 3.
        waaromHier: strList(r.waarom_hier).slice(0, 3),
        faq: normalizeFaq(r.faq),
    };
}

/** Heeft de infographic iets te tonen? Zo niet: hele kader weg (geen lege kaders). */
export function heeftInfographic(p: WijnhuisPortret, extra: { established: number | null; hectares: string }): boolean {
    return Boolean(
        extra.established || extra.hectares || p.generatie || p.topwijngaarden.length || p.druiven.length ||
        p.bodem || p.maxHellingPct !== null || p.stijl.zoet || p.stijl.vol || p.stijl.bewaar ||
        p.prijsband || p.bezoekType || p.talen.length,
    );
}

/** Heeft het Bezoek-blok iets te tonen? Ook gebruikt om de hero-CTA "Plan je bezoek" te tonen. */
export function heeftBezoek(p: WijnhuisPortret, address: string, website: string): boolean {
    const dagen = p.openingstijden ? Object.keys(p.openingstijden.dagen).length > 0 || Boolean(p.openingstijden.opmerking) : false;
    return Boolean(address || safeUrl(website) || dagen || p.proeverij || (p.zelfGeweest && p.onzeErvaring));
}

export function eurLabel(prijsband: number | null): string {
    return prijsband ? '€'.repeat(prijsband) : '';
}

/** Breedte per druif als aandeel van de som, zodat de balk altijd vol is. */
export function druivenSegmenten(druiven: Druif[]): Array<Druif & { width: number }> {
    const total = druiven.reduce((s, d) => s + d.pct, 0);
    if (!total) return [];
    return druiven.map((d) => ({ ...d, width: (d.pct / total) * 100 }));
}
