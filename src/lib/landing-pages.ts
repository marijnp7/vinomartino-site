/**
 * LAT-3209 — loader voor de `landing_pages`-collectie (losstaande
 * landingspagina's, eerste consument /seizoenskalender).
 *
 * Contract, en dit wijkt bewust af van de andere loaders:
 *
 * 1. **Geen fallback-copy.** Er staat geen enkele zin uit deze pagina's in de
 *    repo. Ontbreekt de rij, of is een veld leeg, dan rendert het bijbehorende
 *    blok niet. Dat is de expliciete eis uit LAT-3209 (PROJECT_BRIEF §3.0):
 *    liever niets tonen dan een hardcoded zin die stilletjes uit sync loopt met
 *    het CMS.
 * 2. **Ontbrekende rij is geen build-fout.** `loadLandingPage` geeft `null`
 *    terug op een 404/lege respons. De route zet dat om in "geen pagina
 *    genereren". Een collectie-brede 403 (permissieprobleem) blijft wél luid
 *    falen via de gedeelde `assertCollectionReadableOrDegrade`, want dat is een
 *    kapotte koppeling en geen redactionele keuze.
 *
 * Formulier-copy staat hier niet: die leeft in de `ui_strings`-dictionary
 * (`newsletter.footer.*` / `newsletter.region.*`) en moet daar één bron
 * blijven — zie src/lib/ui-strings.ts.
 */

import {
    readDirectusEnv,
    statusFilterQuery,
    fetchDirectusCollection,
    assertCollectionReadableOrDegrade,
} from './directus-config';

export interface LandingPageValueItem {
    title: string;
    body: string;
}

export interface LandingPage {
    slug: string;
    heroKicker: string;
    heroHeading: string;
    heroLede: string;
    valueHeading: string;
    valueItems: LandingPageValueItem[];
    formHeading: string;
    formSuccess: string;
    formError: string;
    seoTitle: string;
    seoDescription: string;
}

const COLLECTION = 'landing_pages';
const FIELDS = [
    'slug',
    'status',
    'hero_kicker',
    'hero_heading',
    'hero_lede',
    'value_heading',
    'value_items',
    'form_heading',
    'form_success',
    'form_error',
    'seo_title',
    'seo_description',
].join(',');

/** Lege string voor alles wat geen bruikbare tekst is. Templates testen op falsy. */
function str(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/**
 * `value_items` is een JSON-repeater in Directus en dus ongetypeerd. Alleen
 * items met minstens een titel of een body overleven; half-lege rijen uit de
 * CMS-UI mogen geen leeg lijstitem renderen.
 */
function valueItems(raw: unknown): LandingPageValueItem[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            const row = (entry ?? {}) as Record<string, unknown>;
            return { title: str(row['title']), body: str(row['body']) };
        })
        .filter((item) => item.title || item.body);
}

function toLandingPage(row: Record<string, unknown>): LandingPage {
    return {
        slug: str(row['slug']),
        heroKicker: str(row['hero_kicker']),
        heroHeading: str(row['hero_heading']),
        heroLede: str(row['hero_lede']),
        valueHeading: str(row['value_heading']),
        valueItems: valueItems(row['value_items']),
        formHeading: str(row['form_heading']),
        formSuccess: str(row['form_success']),
        formError: str(row['form_error']),
        seoTitle: str(row['seo_title']),
        seoDescription: str(row['seo_description']),
    };
}

/**
 * Haal één landingspagina op. Geeft `null` wanneer Directus niet is
 * geconfigureerd, de collectie nog niet bestaat, of er geen publiceerbare rij
 * met deze slug is. De aanroeper genereert dan geen pagina.
 */
export async function loadLandingPage(slug: string): Promise<LandingPage | null> {
    const env = readDirectusEnv();
    if (!env.configured) {
        console.warn(`[loadLandingPage] Directus niet geconfigureerd — /${slug} wordt niet gegenereerd.`);
        return null;
    }

    const url =
        `${env.url}/items/${COLLECTION}?limit=1&fields=${FIELDS}` +
        `${statusFilterQuery(env)}&filter[slug][_eq]=${encodeURIComponent(slug)}`;

    const res = await fetchDirectusCollection('loadLandingPage', url, {
        headers: { Authorization: `Bearer ${env.token}` },
    });

    // 404 = collectie bestaat nog niet (migratie niet gedraaid). Dat mag een
    // build niet slopen: de route is optioneel en levert dan simpelweg niets op.
    if (res.status === 404) {
        console.warn(`[loadLandingPage] collectie '${COLLECTION}' bestaat niet — /${slug} overgeslagen.`);
        return null;
    }
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        assertCollectionReadableOrDegrade('loadLandingPage', COLLECTION, res.status, env, body.slice(0, 300));
        return null;
    }

    const json = await res.json();
    const rows = (json.data || []) as Record<string, unknown>[];
    if (rows.length === 0) {
        console.warn(`[loadLandingPage] geen publiceerbare rij '${slug}' in ${COLLECTION} — pagina overgeslagen.`);
        return null;
    }
    return toLandingPage(rows[0]!);
}

/**
 * Heeft deze landingspagina genoeg inhoud om te renderen? Zonder kop én zonder
 * lede is er geen pagina, alleen een formulier zonder context — dat is precies
 * de gebroken belofte die LAT-3209 wil voorkomen.
 */
export function hasRenderableContent(page: LandingPage): boolean {
    return Boolean(page.heroHeading || page.heroLede);
}
