/**
 * LAT-2575 — `ui_strings` locale-overlay (native Directus, LAT-2574).
 *
 * `ui-copy.ts` (UI_COPY) blijft de NL-bron-van-waarheid en tevens de
 * seed-specificatie: elke stabiele key hieronder krijgt in Directus
 * `ui_strings` een rij met dezelfde key, en `ui_strings_translations` levert de
 * per-taal `value`. Voor NL lezen we niets uit Directus (byte-identiek aan de
 * bestaande hardcoded copy); voor EN halen we de vertaalde values op en vallen
 * we per key terug op de NL-default wanneer er (nog) geen EN-vertaling is —
 * dit is een UI-dictionary, geen pagina-inhoud, dus een ontbrekende string mag
 * geen 404 veroorzaken (anders dan de content-loaders in `directus-i18n.ts`).
 *
 * Schemacontract: `ui_strings` (PK id, uniek `key`) met O2M-alias `translations`
 * naar `ui_strings_translations` (`ui_strings_id`, `languages_code`, `value`).
 * Nav-labels: `nav_items` heeft géén translations-junction (T1), dus EN-nav
 * leest via deze dictionary op key `nav.<navKey>` met de NL-`label` als default.
 */

import { readDirectusEnv } from './directus-config';
import { DEFAULT_LOCALE, type Locale } from './i18n';
import { UI_COPY } from './ui-copy';

/**
 * Stabiele, gepunte key-namespace → NL-default. Afgeleid van UI_COPY zodat NL
 * nooit kan divergeren. Dit is de autoritatieve seed-lijst voor T4
 * (content-writer vult per key de EN-`value` in `ui_strings_translations`).
 */
export const UI_STRING_DEFAULTS: Record<string, string> = {
    'ui.badge.zelfGereisd': UI_COPY.zelfGereisdBadge,
    'ui.badge.zelfGereisd.title': UI_COPY.zelfGereisdBadgeTitle,
    'ui.badge.redactiegids': UI_COPY.redactiegidsBadge,
    'ui.badge.redactiegids.title': UI_COPY.redactiegidsBadgeTitle,
    'ui.rubriek.de_route': UI_COPY.rubrieken.de_route,
    'ui.rubriek.het_portret': UI_COPY.rubrieken.het_portret,
    'ui.rubriek.uit_de_kelder': UI_COPY.rubrieken.uit_de_kelder,
    'ui.rubriek.eerst_dit_boeken': UI_COPY.rubrieken.eerst_dit_boeken,
    'ui.rubriekSignatuur.title': UI_COPY.rubriekSignatuurTitle,
    'ui.tierPrefix': UI_COPY.tierPrefix,
    'ui.proefnotitie.kaartLabel': UI_COPY.proefnotitieKaartLabel,
    'ui.proefnotitie.datarij1Labels': UI_COPY.proefnotitieDatarij1Labels,
    'ui.proefnotitie.gedronkenLabel': UI_COPY.proefnotitieGedronkenLabel,
    'ui.proefnotitie.prijsLabel': UI_COPY.proefnotitiePrijsLabel,
    'ui.eerstDitBoeken.heading': UI_COPY.eerstDitBoekenHeading,

    // Streek-detailpagina chrome-labels (LAT-2575 pilot). Deze stonden als losse
    // literals in src/pages/streken/[slug].astro; de dictionary is nu de enige
    // NL-bron zodat de /en/-tegenhanger dezelfde keys kan overlayen.
    'streek.breadcrumb.streken': 'Streken',
    'streek.label.wijnstreek': 'Wijnstreek',
    'streek.stat.klimaat': 'Klimaat',
    'streek.stat.bodem': 'Bodem',
    'streek.stat.oppervlakte': 'Oppervlakte',
    'streek.stat.hoogte': 'Hoogte',
    'streek.section.wijnroutes': 'Wijnroutes',
    'streek.routes.rijdPrefix': 'Rijd',
    'streek.routes.intro': 'Uitgestippelde routes door de streek, van waar naar waar, met de mooiste stops onderweg.',
    'streek.route.bekijkCta': 'Bekijk route',
    'streek.section.deelregios': "Deelregio's",
    'streek.section.appellations': 'Appellations',

    // Streek-feitenblok (StreekFeitenblok.astro, LAT-2009). Rij-labels + kop; de
    // tier-badge hergebruikt de bestaande `ui.badge.*`-keys.
    'streek.feit.heading': 'In het kort',
    'streek.feit.ariaLabel': 'Wijnregio in het kort',
    'streek.feit.druiven': 'Druiven',
    'streek.feit.besteSeizoen': 'Beste seizoen',
    'streek.feit.rijdagen': 'Rijdagen',
    'streek.feit.vliegveld': 'Dichtstbijzijnd vliegveld',
    'streek.feit.aantalAdressen': 'Aantal adressen',
    'streek.feit.appellatieniveau': 'Appellatieniveau',
    'streek.feit.besteJaargangen': 'Beste jaargangen',
    'streek.feit.oogstperiode': 'Oogstperiode',
    'streek.feit.minBezoektijd': 'Min. bezoektijd',
    'streek.feit.budgetProeverij': 'Budget proeverij',

    // TourCards.astro (streek-tours, LAT-2252). `titlePrefix` staat vóór de
    // streeknaam: "<prefix> {streekName}".
    'streek.tours.label': 'Tours & tickets',
    'streek.tours.titlePrefix': 'Tours en tickets in',
    'streek.tours.intro': 'Een handvol tours en proeverijen die passen bij de streek: geen zoeklijst, maar een selectie. We werken met GetYourGuide, boek je via een van deze links dan krijgen wij een kleine commissie; jij betaalt niets extra.',
    'streek.tours.gygCta': 'Bekijk op GetYourGuide',

    // AffiliateDisclosure.astro — site-brede affiliate-voetnoot.
    'affiliate.disclosure.text': 'Deze pagina bevat affiliate-links. VinoMartino ontvangt een kleine vergoeding bij boekingen of aankopen via deze links, zonder extra kosten voor jou.',
    'affiliate.disclosure.meer': 'Meer informatie',

    // RelatedArticles.astro — cross-link-blok onderaan streek/wijnhuis/route/land.
    'ui.relatedArticles.title': 'Gerelateerde artikelen',
    'ui.relatedArticles.label': 'Artikelen',
    'ui.relatedArticles.meta': 'Artikel',

    // AccommodatieRoundup.astro (LAT-1332) — per-regio hotel-roundup chrome.
    // `hotelsInPrefix` staat vóór regio én plaats: "<prefix> {naam}"; `hotelsRondPrefix`
    // voor een cluster met meerdere plaatsen.
    'acc.kicker': 'Waar te slapen',
    'acc.hotelsInPrefix': 'Leuke hotels in',
    'acc.hotelsRondPrefix': 'Leuke hotels rond',
    'acc.intro': 'Een handgekozen selectie verblijven per bestemming, geen willekeurig hotelaanbod, maar adressen die we zelf zouden boeken. Prijzen zijn indicatief "vanaf"-tarieven en variëren per seizoen.',
    'acc.ariaVerblijvenPrefix': 'Verblijven in',
    'acc.navAria': 'Spring naar een bestemming',
    'acc.navLabel': 'Voor welke bestemming zoek je een accommodatie?',
    'acc.groepNote': 'Allemaal binnen ~40 min rijden van elkaar',
    'acc.disclosure': "Affiliate-links · we kunnen een commissie ontvangen als je via deze links boekt; jij betaalt niets extra. We tonen alleen accommodaties en foto's die onder ons affiliate-/licentieprogramma zijn toegestaan.",

    // NewsletterFooter.astro (LAT-2436) — MailerLite artikel/streek-footer. Merk-
    // naam "VinoMartino" en de MailerLite-veldwaarden blijven ongewijzigd.
    'newsletter.footer.kicker': 'De brief · nieuwsbrief van VinoMartino',
    'newsletter.footer.heading': 'Wijnreisverhalen in je inbox',
    'newsletter.footer.lede': 'Een paar keer per jaar stuurt Marijn een echte brief: over een wijnmaker die we net bezochten, een regio die opnieuw onze aandacht trok, een fles die indruk maakte. Vertel ons welke regio je het meest boeit, dan sturen we je verhalen op maat.',
    'newsletter.footer.emailLabel': 'E-mailadres',
    'newsletter.footer.emailPlaceholder': 'je@adres.nl',
    'newsletter.footer.submit': 'Stuur me De brief',
    'newsletter.footer.fineprint': 'Je ontvangt een e-mail om je aanmelding te bevestigen. Afmelden kan altijd, met één klik.',

    // NewsletterRegionField.astro (LAT-2452) — gedeeld regio-keuzeveld. Alleen
    // display-tekst; de MailerLite `value`-opties blijven literal.
    'newsletter.region.label': 'Welke wijnregio interesseert jou het meest?',
    'newsletter.region.optional': '(optioneel)',
    'newsletter.region.placeholder': 'Maak een keuze…',
    'newsletter.region.optionOther': 'Een andere regio',
};

/** Resolver over de UI-dictionary: EN-value indien aanwezig, anders NL-default. */
export interface UiStrings {
    locale: Locale;
    /** Vertaalde string voor `key`; valt terug op de NL-default, en (laatste
     *  redmiddel) op `key` zelf als de key onbekend is. */
    t(key: string): string;
}

function fromDefaults(locale: Locale): UiStrings {
    return { locale, t: (key) => UI_STRING_DEFAULTS[key] ?? key };
}

/**
 * Laadt de UI-dictionary voor `locale`. NL = geen fetch (byte-identiek aan de
 * hardcoded defaults). EN = haalt de `ui_strings`-rijen met hun `translations`
 * op, bouwt een key→EN-value-Map en overlayt die op de NL-defaults.
 */
export async function loadUiStrings(locale: Locale = DEFAULT_LOCALE): Promise<UiStrings> {
    if (locale === DEFAULT_LOCALE) return fromDefaults(locale);

    const env = readDirectusEnv();
    if (!env.configured) return fromDefaults(locale);

    const url = `${env.url}/items/ui_strings?limit=-1&fields=key,translations.languages_code,translations.value`;
    let res: Response;
    try {
        res = await fetch(url, {
            headers: { Authorization: `Bearer ${env.token}` },
            signal: AbortSignal.timeout(15000),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadUiStrings] Directus onbereikbaar (${locale}): ${msg} — terugval op NL-defaults.`);
        return fromDefaults(locale);
    }
    if (!res.ok) {
        console.warn(`[loadUiStrings] Directus ${res.status} op ui_strings (${locale}) — terugval op NL-defaults.`);
        return fromDefaults(locale);
    }

    const json = await res.json().catch(() => null) as { data?: Record<string, unknown>[] } | null;
    const rows = json?.data ?? [];
    const overlay = new Map<string, string>();
    for (const row of rows) {
        const key = String(row.key ?? '');
        if (!key) continue;
        const translations = Array.isArray(row.translations) ? row.translations : [];
        for (const tr of translations as Record<string, unknown>[]) {
            if (String(tr.languages_code ?? '') !== locale) continue;
            const value = tr.value;
            if (typeof value === 'string' && value.trim() !== '') overlay.set(key, value);
        }
    }

    return {
        locale,
        t: (key) => overlay.get(key) ?? UI_STRING_DEFAULTS[key] ?? key,
    };
}
