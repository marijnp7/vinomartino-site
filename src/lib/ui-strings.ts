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
    'streek.breadcrumb.home': 'Home',
    'streek.breadcrumb.landen': 'Landen',
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
    'streek.hero.bron': 'bron',

    // Wijnhuis-detailpagina breadcrumb-fallback (LAT-2638). Laterale index-crumb
    // wanneer de Land→Streek-keten (nog) onbekend is.
    'wijnhuis.breadcrumb.index': 'Wijnhuizen',

    // Wijnroute-detailpagina chrome (LAT-2638, RouteDetail.astro).
    'route.breadcrumb.index': 'Wijnroutes',
    'route.daysAria': 'Dagen op deze route',
    'route.wijnhuizenOpRoute': 'Wijnhuizen op deze route',
    'route.leesPortret': 'Lees portret',
    'route.info.heading': 'Route info',
    'route.info.duur': 'Duur:',
    'route.info.vervoer': 'Vervoer:',
    'route.info.stijl': 'Stijl:',
    'route.highlights': 'Highlights',
    'route.boekDag1': 'Boek dag 1',

    // Land-detailpagina chrome (LAT-2638, LandDetail.astro + LandPageContent.astro).
    // `strekenVanPrefix`/`reisroutesDoorPrefix` staan vóór de landnaam:
    // "<prefix> {name}". De "Alle …"-links dragen de pijl in de waarde zodat de
    // gerenderde NL-HTML byte-identiek blijft (letterlijke → i.p.v. entity).
    'land.hero.wijnland': 'Wijnland',
    'land.stat.reistijd': 'Beste reistijd',
    'land.stat.druiven': 'Druivenrassen',
    'land.stat.hoofdstad': 'Hoofdstad',
    'land.section.wijnstreken': 'Wijnstreken',
    'land.section.strekenVanPrefix': 'De streken van',
    'land.link.alleStreken': 'Alle streken →',
    'land.section.topWijnhuizen': 'Top wijnhuizen',
    'land.section.topWijnhuizenTitle': 'Adressen die we zelf bezochten',
    'land.link.alleWijnhuizen': 'Alle wijnhuizen →',
    'land.section.druiven': 'Druiven',
    'land.section.druivenTitle': 'Wat je hier proeft',
    'land.section.routes': 'Routes',
    'land.section.reisroutesDoorPrefix': 'Reisroutes door',
    'land.link.alleRoutes': 'Alle routes →',
    'land.section.planJeReis': 'Plan je reis',
    'land.section.reistijd': 'Reistijd',
    'land.section.reistijdTitle': 'Hoe lang doe je erover',
    'land.reistijd.thRegio': 'Regio',
    'land.reistijd.thVliegveld': 'Dichtstbijzijnde luchthaven',
    'land.reistijd.thReistijd': 'Reistijd met de auto',
    'land.reistijd.thPeriode': 'Beste reisperiode',
    'land.section.budget': 'Budget',
    'land.section.budgetTitle': 'Wat kost een wijnreis',
    'land.budget.note': "Richtprijzen in euro's, per persoon tenzij anders vermeld.",
    'land.section.praktisch': 'Praktisch',
    'land.section.praktischTitle': 'Voor je gaat',
    'land.section.faq': 'Veelgestelde vragen',
    'land.section.faqTitle': 'Goed om te weten',

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

    // StreekKaart.astro (LAT-1592) — "de geld-pagina" dubbele kaart + POI-lijst.
    // introPrefix/introSuffix omsluiten de {streek}{, land}-interpolatie; de
    // locator-aria idem (prefix + streek + land + suffix). `popupLeesMeer` wordt
    // via de mapData-JSON aan het client-script doorgegeven (Leaflet-popup).
    'streekkaart.kicker': 'Op de kaart',
    'streekkaart.titlePrefix': 'Ontdek',
    'streekkaart.introPrefix': 'Onze handgekozen adressen in',
    'streekkaart.introSuffix': ': wijnhuizen, plekken om te eten, te slapen en te beleven. De nummers op de kaart komen overeen met de lijst eronder.',
    'streekkaart.ariaDetailMap': 'Kaart met genummerde adressen in',
    'streekkaart.locatorPrefix': 'Locatie van',
    'streekkaart.locatorSuffix': ' binnen het land',
    'streekkaart.cat.wijnhuizen': 'Wijnhuizen',
    'streekkaart.cat.eten': 'Eten',
    'streekkaart.cat.overnachten': 'Overnachten',
    'streekkaart.cat.activiteiten': 'Activiteiten',
    'streekkaart.cta.overnachten': 'Bekijk & boek',
    'streekkaart.cta.activiteiten': 'Reserveer een plek',
    'streekkaart.cta.eten': 'Reserveer',
    'streekkaart.cta.default': 'Plan een bezoek',
    'streekkaart.clusterFallbackTitel': 'Verblijven in de buurt',
    'streekkaart.clusterNote': 'binnen ~40 min rijden',
    'streekkaart.disclosure': 'Affiliate-links · Sommige links op deze pagina (Stay22, GetYourGuide) zijn partnerlinks. Als je hiervia boekt, ontvangen we mogelijk een kleine commissie. Jij betaalt niets extra.',
    'streekkaart.stickyLabelPrefix': 'Plan je bezoek aan',
    'streekkaart.stickyCtaActiviteiten': 'Bekijk activiteiten',
    'streekkaart.stickyCtaOvernachten': 'Bekijk overnachtingen',
    'streekkaart.popupLeesMeer': 'Lees meer',

    // RouteMap.astro (LAT-1608) — schematische van-naar route-strip. `ariaPrefix`
    // + van + `ariaMid` + naar vormen het aria-label "Route van X naar Y".
    'routemap.label': 'Routekaart',
    'routemap.ariaPrefix': 'Route van',
    'routemap.ariaMid': 'naar',
    'routemap.endpointVan': 'Van',
    'routemap.endpointNaar': 'Naar',
    'routemap.stopsSuffix': 'stops',

    // AffiliatePlaceholder.astro (LAT-1029) — per-type affiliate-blok chrome
    // (titel/omschrijving/cta). De icon-emoji staat in de component (taal-neutraal).
    'affiliate.block.accommodation.title': 'Waar slapen',
    'affiliate.block.accommodation.desc': 'Boek dezelfde plek waar wij verbleven',
    'affiliate.block.accommodation.cta': 'Bekijk beschikbaarheid',
    'affiliate.block.activity.title': 'Activiteiten & tours',
    'affiliate.block.activity.desc': 'Boek de proeverij of tour die we zelf deden',
    'affiliate.block.activity.cta': 'Boek deze ervaring',
    'affiliate.block.flight.title': 'Vluchten vergelijken',
    'affiliate.block.flight.desc': 'Vind de goedkoopste vlucht',
    'affiliate.block.flight.cta': 'Vergelijk vluchten',
    'affiliate.block.insurance.title': 'Reisverzekering',
    'affiliate.block.insurance.desc': 'Reis verzekerd op pad',
    'affiliate.block.insurance.cta': 'Bekijk verzekeringen',
    'affiliate.block.sidebar.title': 'Boek je reis',
    'affiliate.block.sidebar.desc': 'Plan de reis die wij maakten',
    'affiliate.block.sidebar.cta': 'Plan je reis',

    // CTA-leaf-componenten (Cta{Primary,Comparison,Closing}.astro, LAT-1784). De
    // heading/why/label komen uit Directus (cta_blocks = content, gated op de
    // JSON-veld-beslissing); enkel de aria-labels + de fallback-CTA (wanneer de
    // data geen label levert) zijn chrome en horen in de dictionary.
    'ui.cta.primary.aria': 'Aanbevolen volgende stap',
    'ui.cta.primary.fallbackCta': 'Bekijk beschikbaarheid',
    'ui.cta.comparison.aria': 'Vergelijk je opties',
    'ui.cta.comparison.fallbackCta': 'Bekijk',
    'ui.cta.closing.aria': 'Onze aanbeveling',
    'ui.cta.closing.fallbackCta': 'Plan je bezoek',
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
