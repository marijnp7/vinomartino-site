// LAT-12710 — één-pagina-opbouw voor wijnroutes (blauwdruk LAT-12709).
//
// Gestructureerde paginadata leeft in `routes.itinerary.pagina` (bestaand, vertaalbaar
// JSON-veld; geen schemawijziging nodig, schrijfrecht voor Lead Editor/Content Writer
// is al geregeld op routes.itinerary). Ontbreekt `pagina`, dan rendert de route het
// bestaande sjabloon (nul regressie op overige routes).
//
// Vorm (alle sleutels optioneel behalve dagen[]):
//   hero      { h1, tagline, badge, foto, foto_alt, knop_slapen, knop_route }
//   intro_md  hook-intro, de enige intro
//   glance    { kop, feiten:[{label,value}], mustdos:[{titel,regel}], mustdos_kop,
//               wijntabel:{ kop:[..], rijen:[[..]] } }
//   dagen     [{ n, label, titel, hook, foto, foto_alt, prose_md,
//                wijnhuizen:[{ slug, naam, regel, label, url }],
//                slaap:{ naam, plaats, type, why, foto, booking_url, label } }]
//   slapen    { kop, intro, items:[slaap..], disclosure_md }
//   wijnhuizen[{ slug, label }]   // label ("Zelf geweest") + volgorde in het grid
//   praktisch { kop, items:[{label,value}] }
//   slot      { kop, tekst, knop }   // CTA onderaan, gebruikt slapen.items[0..2]
import { normalizeEmDashes } from './markdown';

export interface PaginaSlaap {
    naam: string;
    plaats: string | null;
    type: string | null;
    why: string | null;
    foto: string | null;
    fotoId: string | null;
    bookingUrl: string | null;
    /** Bv. "Hier sliepen wij". Leeg = geen label. */
    label: string | null;
}

export interface PaginaWijnhuis {
    slug: string | null;
    naam: string;
    regel: string | null;
    /** Bv. "Zelf geweest". Leeg = geen label (nooit een "niet geweest"-label). */
    label: string | null;
    url: string | null;
}

export interface PaginaDag {
    n: number;
    label: string;
    titel: string;
    hook: string | null;
    foto: string | null;
    fotoId: string | null;
    fotoAlt: string | null;
    proseMd: string;
    proseHtml: string;
    wijnhuizen: PaginaWijnhuis[];
    slaap: PaginaSlaap | null;
}

export interface RoutePagina {
    hero: {
        h1: string | null;
        tagline: string | null;
        badge: string | null;
        foto: string | null;
        fotoAlt: string | null;
        knopSlapen: string | null;
        knopRoute: string | null;
    };
    introMd: string;
    introHtml: string;
    glance: {
        kop: string | null;
        feiten: { label: string; value: string }[];
        mustdosKop: string | null;
        mustdos: { titel: string; regel: string | null }[];
        wijntabel: { kop: string[]; rijen: string[][] } | null;
    } | null;
    dagen: PaginaDag[];
    slapen: { kop: string | null; intro: string | null; items: PaginaSlaap[]; disclosureMd: string; disclosureHtml: string } | null;
    wijnhuizen: { slug: string; label: string | null }[];
    praktisch: { kop: string | null; items: { label: string; value: string }[] } | null;
    slot: { kop: string | null; tekst: string | null; knop: string | null } | null;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function str(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? normalizeEmDashes(s) : null;
}

function httpUrl(v: unknown): string | null {
    const s = str(v);
    return s && /^https?:\/\//i.test(s) ? s : null;
}

function parseSlaap(v: unknown): PaginaSlaap | null {
    if (!isRec(v)) return null;
    const naam = str(v.naam ?? v.name);
    if (!naam) return null;
    return {
        naam,
        plaats: str(v.plaats),
        type: str(v.type),
        why: str(v.why ?? v.waarom),
        foto: str(v.foto),
        fotoId: null,
        bookingUrl: httpUrl(v.booking_url ?? v.bookingUrl),
        label: str(v.label),
    };
}

function parseWijnhuis(v: unknown): PaginaWijnhuis | null {
    if (!isRec(v)) return null;
    const slug = str(v.slug);
    const naam = str(v.naam ?? v.name) ?? slug;
    if (!naam) return null;
    return { slug, naam, regel: str(v.regel ?? v.why), label: str(v.label), url: httpUrl(v.url) };
}

function pairs(v: unknown): { label: string; value: string }[] {
    return arr(v).flatMap((r) => {
        if (!isRec(r)) return [];
        const label = str(r.label);
        const value = str(r.value ?? r.waarde);
        return label && value ? [{ label, value }] : [];
    });
}

/** Tolerant: ontbrekende/halve data breekt de build nooit; geen dagen = geen pagina-modus. */
export function parseRoutePagina(raw: unknown): RoutePagina | null {
    let root: unknown = raw;
    if (typeof raw === 'string') {
        try { root = JSON.parse(raw); } catch { return null; }
    }
    if (!isRec(root) || !isRec(root.pagina)) return null;
    const p = root.pagina;

    const dagen: PaginaDag[] = arr(p.dagen).flatMap((d, i) => {
        if (!isRec(d)) return [];
        const n = Math.trunc(Number(d.n ?? i + 1)) || i + 1;
        const titel = str(d.titel ?? d.title);
        const proseMd = str(d.prose_md ?? d.prose) ?? '';
        if (!titel && !proseMd) return [];
        return [{
            n,
            label: str(d.label) ?? `Dag ${n}`,
            titel: titel ?? `Dag ${n}`,
            hook: str(d.hook),
            foto: str(d.foto),
            fotoId: null,
            fotoAlt: str(d.foto_alt),
            proseMd,
            proseHtml: '',
            wijnhuizen: arr(d.wijnhuizen).map(parseWijnhuis).filter((x): x is PaginaWijnhuis => x !== null),
            slaap: parseSlaap(d.slaap),
        }];
    });
    if (dagen.length === 0) return null;

    const h = isRec(p.hero) ? p.hero : {};
    const g = isRec(p.glance) ? p.glance : null;
    const wt = g && isRec(g.wijntabel) ? g.wijntabel : null;
    const s = isRec(p.slapen) ? p.slapen : null;
    const pr = isRec(p.praktisch) ? p.praktisch : null;
    const sl = isRec(p.slot) ? p.slot : null;

    return {
        hero: {
            h1: str(h.h1),
            tagline: str(h.tagline),
            badge: str(h.badge),
            foto: str(h.foto),
            fotoAlt: str(h.foto_alt),
            knopSlapen: str(h.knop_slapen),
            knopRoute: str(h.knop_route),
        },
        introMd: str(p.intro_md) ?? '',
        introHtml: '',
        glance: g ? {
            kop: str(g.kop),
            feiten: pairs(g.feiten),
            mustdosKop: str(g.mustdos_kop),
            mustdos: arr(g.mustdos).flatMap((m) => {
                if (!isRec(m)) return [];
                const titel = str(m.titel);
                return titel ? [{ titel, regel: str(m.regel) }] : [];
            }),
            wijntabel: wt ? {
                kop: arr(wt.kop).map((c) => str(c) ?? ''),
                rijen: arr(wt.rijen).map((r) => arr(r).map((c) => str(c) ?? '')),
            } : null,
        } : null,
        dagen,
        slapen: s ? {
            kop: str(s.kop),
            intro: str(s.intro),
            items: arr(s.items).map(parseSlaap).filter((x): x is PaginaSlaap => x !== null),
            disclosureMd: str(s.disclosure_md) ?? '',
            disclosureHtml: '',
        } : null,
        wijnhuizen: arr(p.wijnhuizen).flatMap((w) => {
            if (!isRec(w)) return [];
            const slug = str(w.slug);
            return slug ? [{ slug, label: str(w.label) }] : [];
        }),
        praktisch: pr ? { kop: str(pr.kop), items: pairs(pr.items) } : null,
        slot: sl ? { kop: str(sl.kop), tekst: str(sl.tekst), knop: str(sl.knop) } : null,
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Foto-UUID's → gedownload pad (+ fotoId voor de beeldcredit); markdown → HTML. */
export async function finalizePagina(
    p: RoutePagina,
    io: { downloadFoto: (id: string) => Promise<string | null>; renderMd: (md: string) => Promise<string> },
): Promise<void> {
    const resolve = async (o: { foto: string | null; fotoId?: string | null }) => {
        const ref = o.foto?.trim();
        if (!ref || !UUID_RE.test(ref)) return;
        o.fotoId = ref;
        o.foto = await io.downloadFoto(ref);
    };
    const heroRef = { foto: p.hero.foto, fotoId: null as string | null };
    await resolve(heroRef);
    p.hero.foto = heroRef.foto;
    for (const d of p.dagen) {
        await resolve(d);
        if (d.slaap) await resolve(d.slaap);
        if (d.proseMd) d.proseHtml = await io.renderMd(d.proseMd);
    }
    if (p.slapen) {
        for (const it of p.slapen.items) await resolve(it);
        if (p.slapen.disclosureMd) p.slapen.disclosureHtml = await io.renderMd(p.slapen.disclosureMd);
    }
    if (p.introMd) p.introHtml = await io.renderMd(p.introMd);
}
