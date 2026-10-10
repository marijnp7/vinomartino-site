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

import { readDirectusEnv, fetchDirectusCollection } from './directus-config';
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
    // LAT-4776 — beeld-niveau §7-disclosure (BeeldHerkomst.astro). Niet te
    // verwarren met de reisprovenance-badge hierboven.
    'ui.beeldherkomst.ai': UI_COPY.beeldHerkomstAiCaption,
    'ui.beeldherkomst.ai.title': UI_COPY.beeldHerkomstAiTitle,
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

    // Wijnhuis-detailpagina template-chrome (LAT-4911, WijnhuisPageContent.astro).
    // Stonden als kale NL-literals in de template en renderden daardoor op alle
    // ~130 /en/wijnhuizen/-pagina's in het Nederlands. De defaults hieronder zijn
    // tekstueel identiek aan die literals — inclusief de `§ ` in `story.label` en
    // de letterlijke pijl in `visit.mapsCta` — zodat de NL-HTML byte-identiek blijft.
    // `meta.biologisch.ja` is de *waarde* (niet het label): WijnhuisDetail.astro gaf
    // `entry.biodynamisch ? 'Ja' : undefined` door.
    'wijnhuis.hero.eyebrow': 'Wijnhuis-portret',
    'wijnhuis.meta.streek': 'STREEK',
    'wijnhuis.meta.route': 'ROUTE',
    'wijnhuis.meta.sinds': 'SINDS',
    'wijnhuis.meta.hectaren': 'HECTAREN',
    'wijnhuis.meta.biologisch': 'BIOLOGISCH',
    'wijnhuis.meta.biologisch.ja': 'Ja',
    'wijnhuis.drieluik.beeldenVanPrefix': 'Beelden van',
    'wijnhuis.story.label': '§ Het verhaal',
    'wijnhuis.wines.eyebrow': 'De wijnen',
    'wijnhuis.wines.title': 'Wat we proefden',
    'wijnhuis.visit.eyebrow': 'Bezoek',
    'wijnhuis.visit.title': 'Voor je heen rijdt',
    'wijnhuis.visit.mapsCta': 'Open in Google Maps →',
    'wijnhuis.visit.reserveCta': 'Reservering aanvragen',
    'wijnhuis.related.label': 'Gerelateerd',
    'wijnhuis.related.title': 'Meer wijnhuizen in deze streek',

    // LAT-12769 — Wijnhuis-portret 2.0 (infographic 'In één glas', bezoek, wijnen).
    'wijnhuis.glas.title': 'In één glas',
    'wijnhuis.glas.eyebrow': 'Op een blik',
    'wijnhuis.glas.sinds': 'Sinds',
    'wijnhuis.glas.generatie': 'Generatie',
    'wijnhuis.glas.hectares': 'Hectares',
    'wijnhuis.glas.topwijngaarden': 'Topwijngaarden',
    'wijnhuis.glas.druiven': 'Druiven',
    'wijnhuis.glas.bodem': 'Bodem',
    'wijnhuis.glas.helling': 'Steilste helling',
    'wijnhuis.glas.stijl': 'Stijl',
    'wijnhuis.glas.stijl.zoet.l': 'Droog',
    'wijnhuis.glas.stijl.zoet.r': 'Zoet',
    'wijnhuis.glas.stijl.vol.l': 'Licht',
    'wijnhuis.glas.stijl.vol.r': 'Vol',
    'wijnhuis.glas.stijl.bewaar.l': 'Nu drinken',
    'wijnhuis.glas.stijl.bewaar.r': 'Bewaren',
    'wijnhuis.glas.prijs': 'Prijs',
    'wijnhuis.glas.bezoek': 'Bezoek',
    'wijnhuis.glas.talen': 'Spreekt',
    'wijnhuis.bodem.leisteen': 'Leisteen',
    'wijnhuis.bodem.kalk': 'Kalk',
    'wijnhuis.bodem.vulkanisch': 'Vulkanisch',
    'wijnhuis.bodem.zand': 'Zand',
    'wijnhuis.bodem.klei': 'Klei',
    'wijnhuis.bodem.loess': 'Löss',
    'wijnhuis.bodem.graniet': 'Graniet',
    'wijnhuis.bodem.overig': 'Gemengd',
    'wijnhuis.bezoek.zonder_afspraak': 'Zonder afspraak',
    'wijnhuis.bezoek.vinothek': 'Vinothek',
    'wijnhuis.bezoek.op_afspraak': 'Op afspraak',
    'wijnhuis.cta.plan': 'Plan je bezoek',
    'wijnhuis.cta.route': 'Op de route',
    'wijnhuis.badge.zelfGeweest': 'Zelf geweest',
    'wijnhuis.drinken.eyebrow': 'Wat te drinken',
    'wijnhuis.drinken.title': 'Drie flessen, drie momenten',
    'wijnhuis.rol.instap': 'Instap',
    'wijnhuis.rol.signature': 'Signature',
    'wijnhuis.rol.splurge': 'Splurge',
    'wijnhuis.drink.vanaf': 'Drink vanaf',
    'wijnhuis.drink.tot': 'tot',
    'wijnhuis.drink.wacht': 'Wacht tot',
    'wijnhuis.drink.koop': 'Koop deze fles',
    'wijnhuis.bezoek.eyebrow': 'Bezoek',
    'wijnhuis.bezoek.title': 'Plan je bezoek',
    'wijnhuis.bezoek.adres': 'Adres',
    'wijnhuis.bezoek.website': 'Website',
    'wijnhuis.bezoek.openingstijden': 'Openingstijden',
    'wijnhuis.bezoek.gesloten': 'Gesloten',
    'wijnhuis.bezoek.proeverij': 'Proeverij',
    'wijnhuis.bezoek.prijs': 'Prijs p.p.',
    'wijnhuis.bezoek.duur': 'Duur',
    'wijnhuis.bezoek.min': 'min',
    'wijnhuis.bezoek.taal': 'Taal',
    'wijnhuis.bezoek.reserveer': 'Reserveer je proeverij',
    'wijnhuis.dag.ma': 'Maandag',
    'wijnhuis.dag.di': 'Dinsdag',
    'wijnhuis.dag.wo': 'Woensdag',
    'wijnhuis.dag.do': 'Donderdag',
    'wijnhuis.dag.vr': 'Vrijdag',
    'wijnhuis.dag.za': 'Zaterdag',
    'wijnhuis.dag.zo': 'Zondag',
    'wijnhuis.ervaring.title': 'Onze ervaring',
    'wijnhuis.combineer.eyebrow': 'Combineer met',
    'wijnhuis.combineer.title': 'Meer in de buurt',
    'wijnhuis.combineer.route': 'Wijnroute',
    'wijnhuis.combineer.streek': 'Streek',
    'wijnhuis.waarom.eyebrow': 'Waarom je hier heen gaat',
    'wijnhuis.faq.eyebrow': 'Snel antwoord',
    'wijnhuis.faq.title': 'Goed om te weten',

    // Cross-linkblok onderaan de artikelpagina's (LAT-4911, RelatedEntities.astro).
    // Stonden als kale NL-literals — het component laadde de dictionary niet eens —
    // en zetten daardoor `Streek` op 20 en `Wijnhuis` op 9 /en/artikelen/-pagina's.
    'related.label': 'Gerelateerd',
    'related.title': 'Lees verder',
    'related.kind.streek': 'Streek',
    'related.kind.wijnhuis': 'Wijnhuis',
    'related.kind.wijnroute': 'Wijnroute',
    'related.kind.land': 'Land',

    // Stop-soort-labels in de route-itinerary (LAT-4911, RouteItineraryDays.astro)
    // en de chrome van de geo-kaart (RouteGeoMap.astro). Stonden als kale
    // NL-literals op de 11 /en/wijnroutes/-pagina's.
    'route.stop.wijnhuis': 'Wijnhuis',
    'route.stop.eten': 'Eten',
    'route.stop.bezienswaardigheid': 'Bezienswaardigheid',
    'route.stop.overnachting': 'Overnachting',
    'route.stay.cta': 'Bekijk & boek',
    // {duur} wordt vervangen door de duur-string uit de itinerary-data.
    'route.stop.duur': 'Reken op {duur}.',
    'route.stop.website': 'Website',
    'route.stop.kaart': 'Op de kaart',
    'routegeo.label': 'Routekaart',
    'routegeo.aria.mapPre': 'Kaart van de route',
    'routegeo.legend.aria': 'Legenda',
    'routegeo.legend.dagetappe': 'Dagetappe',
    'routegeo.legend.wijnhuis': 'Wijnhuis',
    'routegeo.legend.overnachten': 'Overnachten',

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
    'land.section.topWijnhuizenTitle': 'Wijnhuizen die een bezoek waard zijn',
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

    // Artikel-detailpagina chrome (LAT-2638, ArtikelDetail.astro). Breadcrumb `home`
    // hergebruikt `streek.breadcrumb.home`. De datum-locale wordt in het component
    // uit de `locale`-prop afgeleid (nl-NL / en-GB), niet via de dictionary.
    'artikel.breadcrumb.index': 'Artikelen',
    'artikel.meta.minLezen': 'min lezen',
    'artikel.toc.springNaar': 'Inhoud: spring naar',
    'artikel.toc.aria': 'Inhoudsopgave',
    'artikel.toc.heading': 'Inhoud',
    'artikel.author.overDeAuteur': 'Over de auteur',
    'artikel.author.meerArtikelenVan': 'Meer artikelen van',

    // Sitebrede chrome: header (SiteHeader.astro) + footer (SiteFooter.astro),
    // LAT-2638. Alléén de statische chrome zit hier; nav-item-labels en de land/
    // streek-namen in "Ontdek" komen uit CMS-data (nav_items/landen/streken) en
    // worden pas EN zodra die loaders locale-aware zijn (data-overlay follow-up).
    // De pijlen (→) blijven als HTML-entity in de markup; alleen de tekst is hier.
    'header.utility.tagline': 'Wijnreizen met karakter',
    'header.nav.aria': 'Hoofdnavigatie',
    'header.ontdek.trigger': 'Ontdek',
    // LAT-11950: het promoblok claimde eigen bezoek voor élke landengids. Dat
    // klopt voor elf streken (src/lib/bezochte-streken.ts); de rest is
    // Redactiegids. De claim staat sitebreed in de header, dus hij moet het
    // onderscheid zelf noemen.
    'header.ontdek.promoKicker': 'Zelf gereisd of Redactiegids',
    'header.ontdek.promoTitle': 'Elke gids zegt waar hij vandaan komt',
    'header.ontdek.promoBody': 'Elf streken bezocht ik zelf, van de Loire tot de Kaap: daar staat wat ik proefde en wie er inschonk. De andere gidsen zijn Redactiegids, gebouwd op primaire bronnen en lokale kennis, zonder ooggetuigeclaim.',
    'header.ontdek.alleLanden': 'Alle landen',
    'header.search.openAria': 'Zoeken openen',
    'header.search.label': 'Zoeken',
    'header.cellar.enterAria': 'Ga naar de kelder (donkere modus)',
    'header.cellar.enterLabel': 'Naar de kelder',
    'header.cellar.exitLabel': 'Naar buiten',
    'header.cellar.tipText': 'Te fel voor je ogen? Lees in de donkere kelder-modus.',
    'header.mobile.menuAria': 'Menu openen',
    'header.mobile.ontdekHeader': 'Kies je bestemming',
    'header.mobile.ontdekSubhead': 'Ontdek een wijnregio',
    'header.mobile.ontdekAll': 'Naar de Ontdek-atlas',
    'footer.desc': 'Wijnreizen met karakter. Geschreven door wijnliefhebbers, voor wijnliefhebbers.',
    'footer.nav.heading': 'Navigatie',
    'footer.nav.artikelen': 'Artikelen',
    'footer.nav.auteurs': 'Auteurs',
    'footer.nav.overOns': 'Ons verhaal',
    'footer.nav.samenwerken': 'Samenwerken',
    'footer.legal.heading': 'Juridisch',
    'footer.legal.colofon': 'Colofon',
    'footer.legal.privacy': 'Privacy',
    'footer.legal.cookies': 'Cookies',
    'footer.legal.affiliate': 'Affiliate-verklaring',
    'footer.copy.rights': 'Alle rechten voorbehouden.',
    'footer.affiliateNote': 'Sommige links op deze site zijn affiliate-links. Wij ontvangen een kleine commissie als je via onze link boekt, zonder extra kosten voor jou.',

    // Top-nav labels (SiteHeader.astro, LAT-2638). `nav_items` heeft géén
    // translations-junction, dus de EN-labels komen via deze dictionary op key
    // `nav.<navKey>` met de NL-`label` als default. NL rendert altijd de CMS-label
    // (component bypasst t() voor de standaardtaal), dus deze seeds raken NL niet;
    // ze zijn de T4-EN-spec + de EN-fallback wanneer een vertaling nog ontbreekt.
    'nav.ontdek': 'Ontdek',
    'nav.wijnroutes': 'Wijnroutes',
    'nav.wijnhuizen': 'Wijnhuizen',
    'nav.accommodaties': 'Overnachten',
    'nav.artikelen': 'Artikelen',
    'nav.de-brief': 'De brief',
    'nav.over-ons': 'Ons verhaal',

    // Homepage/portal (index.astro → HomeContent.astro, LAT-2638). Titel-em en de
    // manifest-zin worden in het component uit losse pre/em-keys samengesteld zodat
    // de <em>-markup byte-identiek blijft; de pijlen (→) staan in de waarde.
    'home.meta.title': 'VinoMartino: Wijnreizen met karakter',
    'home.meta.description': 'Image-led wijnreis-verhalen, routes en proefnotities uit Piemonte, de Douro, de Kaap en wijnstreken wereldwijd, geschreven door wijnliefhebbers die zelf op pad gaan.',
    'home.hero.aria': 'Wijnreizen met karakter',
    'home.hero.imageAlt': 'Golden-hour wijngaardlandschap in de Langhe, pad door de vines richting Barolo, Piemonte',
    'home.hero.eyebrow': 'Zelf gereisd sinds 2019',
    'home.hero.titleLine1': 'De wijnreizen die wij zelf maakten,',
    'home.hero.titleEm': 'klaar om na te reizen.',
    'home.hero.lede': 'Routes, wijnhuizen en adressen uit elf zelf-gereisde streken. Geen lijstjes, wel de weg ernaartoe.',
    'home.hero.ctaBestemming': 'Kies je bestemming',
    'home.hero.ctaRoutes': 'Bekijk de routes',
    'home.hero.scrollAria': 'Scroll verder',
    'home.hero.scrollLabel': 'Verder',
    'home.atlas.aria': 'Wijnatlas',
    'home.atlas.kicker': 'De wijnatlas',
    'home.atlas.title': 'Kies je land, vind je streek',
    'home.atlas.lede': 'Beweeg over een wijnland voor de kerndruif, klik door naar de streekgids. De hele atlas onder één kaart, geen menu dat meegroeit.',
    'home.atlas.fallbackAria': 'Wijnlanden',
    'home.atlas.regioSingular': 'streek',
    'home.atlas.regioPlural': 'streken',
    'home.atlas.allesCta': 'Naar de volledige atlas →',
    'home.dest.kicker': 'Zelf gereisd, dus we weten het',
    'home.dest.title': 'Waar begint jouw wijnreis?',
    'home.dest.lede': 'De streken waar we zélf waren, staan vooraan. Kies waar je heen wilt, en het verhaal, de routes en de adressen volgen.',
    'home.dest.tileAltSuffix': ', wijngaardlandschap',
    'home.dest.tileLink': 'Ontdek de streek →',
    'home.dest.allesCta': 'Alle streken →',
    'home.routes.kicker': 'Op pad',
    'home.routes.title': 'Wijnroutes met karakter',
    'home.routes.sub': 'Geen Google-maps-grids, maar reizen van twee tot vijf dagen, met wijnhuizen, eetadressen en de weg ertussen.',
    'home.routes.allesCta': 'Alle routes →',
    'home.spotlight.kicker': 'Verhaal van de week',
    'home.spotlight.cta': 'Lees het hele verhaal →',
    'home.latest.kicker': 'Laatste verhalen',
    'home.latest.title': 'Vers van de pers',
    'home.latest.sub': 'Reisverslagen, proefnotities en achtergronden. Onze tips komen uit eigen bezoek en geteste adressen; boek je via onze links, dan steun je de site zonder dat jij meer betaalt.',
    'home.latest.allesCta': 'Alle artikelen →',
    // LAT-13056 Variant A "Vlot"
    'card.leesVerder': 'Lees verder →',
    'card.sticker.zelfGereisd': '✓ Zelf gereisd',
    'home.hero.nieuwTag': 'Nieuw',
    'home.feed.title': 'Net terug',
    'artikel.facts.aria': 'Kerngegevens van dit artikel',
    // LAT-13056 Variant B "Uitgesproken"
    'home.hero.versLabel': 'vers van de pers',
    'home.hero.versAria': 'De nieuwste artikelen',
    'card.hand.zelfGeweest': 'zelf geweest',
    'home.proof.aria': 'Bewijs en gezicht',
    'home.proof.portraitAlt': 'Marijn proeft een glas wijn met wijngaarden op de achtergrond',
    'home.proof.kicker': 'Bewijs en gezicht',
    'home.proof.stat1Label': 'streken zelf bereisd',
    'home.proof.stat2Label': 'sinds we op pad zijn',
    'home.proof.manifestPre': 'Waar we zelf waren, zie je dat: het label ',
    'home.proof.manifestEm': 'Zelf gereisd',
    'home.proof.cta': 'Ons verhaal →',
    'home.brief.dateline': 'De Brief · eens per maand',
    'home.brief.heading': 'Eens per maand een brief. Geen lijstjes.',
    'home.brief.body': 'Een persoonlijke brief van Marijn: wat we recent dronken, waar we waren, en welke fles ons opviel. Geen affiliate-deals, geen nieuwsbriefformule.',
    'home.brief.submit': 'Schrijf je in voor de brief',

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

    // AffiliateBlockDisclosure.astro — per-blok disclosure onder M1-Optie B
    // (LAT-1029). Stond hardgecodeerd in het component en rendeerde daardoor NL
    // op /en/; door de dictionary getrokken in LAT-4979. De NL-waarden zijn
    // byte-identiek aan de literals die er stonden. Partnernamen (Booking.com,
    // GetYourGuide) zijn merknamen en staan bewust niet in de dictionary.
    'affiliate.blockDisclosure.bezoek': 'Wij bezochten {producent} in {maand} {jaar}.',
    'affiliate.blockDisclosure.reservering': 'Reservering via {bron}, VinoMartino ontvangt commissie, prijs voor jou identiek.',
    'affiliate.blockDisclosure.bron.directeLink': 'de directe link naar het wijnhuis',

    // Maandnamen voor de bezoekregel hierboven. NL rendert kleingeschreven
    // ("in oktober 2024"), Engels met hoofdletter ("in October 2024") — vandaar
    // een dictionary-key i.p.v. een toLowerCase() in het component.
    'ui.maand.januari': 'januari',
    'ui.maand.februari': 'februari',
    'ui.maand.maart': 'maart',
    'ui.maand.april': 'april',
    'ui.maand.mei': 'mei',
    'ui.maand.juni': 'juni',
    'ui.maand.juli': 'juli',
    'ui.maand.augustus': 'augustus',
    'ui.maand.september': 'september',
    'ui.maand.oktober': 'oktober',
    'ui.maand.november': 'november',
    'ui.maand.december': 'december',

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

    // Affiliate-disclosures die tot LAT-2771 als kale literals in componenten
    // stonden en daardoor ook op /en/ in het Nederlands renderden. De NL-defaults
    // hieronder zijn tekstueel identiek aan de oude literals, zodat de NL-copy
    // niet verandert; alleen de EN-overlay is nieuw. Enige verschil in de
    // gerenderde NL-HTML: `wijnhuis.staynear.disclosure` stond als `&middot;`
    // in de template en komt nu als het letterlijke teken `·` mee.
    'stay.disclosure.microcopy': 'Affiliate-link · als je hier boekt, kunnen wij een commissie ontvangen; jij betaalt niets extra.',
    'stay.map.disclosure': 'Affiliate-links · we kunnen een commissie ontvangen als je via deze links boekt; jij betaalt niets extra.',
    'stay.map.priceNote': 'Prijzen variëren per seizoen',
    'stay22.disclosure': 'Affiliate-link · we kunnen een commissie ontvangen, jij betaalt niets extra.',
    'wijnhuis.staynear.aria': 'Overnachtingen in de buurt',
    'wijnhuis.staynear.labelPrefix': 'Overnachten bij',
    'wijnhuis.staynear.disclosure': 'Affiliate-links · geen extra kosten',
    'wijnhuis.staynear.ctaNearPrefix': 'Slaap in de buurt van',
    'wijnhuis.staynear.ctaNear': 'Slaap in de buurt',

    // Tier-badges en prijs-labels op de accommodatie-kaart (LAT-2771). Stonden
    // als STAY_TIER_META-labels en inline template-literals in de componenten en
    // renderden daardoor NL op /en/accommodaties/<streek>/.
    'stay.tier.slim_geboekt': 'Slim geboekt',
    'stay.tier.prijs_kwaliteit': 'Prijs-kwaliteit',
    'stay.tier.pure_luxe': 'Pure luxe',
    'stay.price.perNight': '/ nacht',
    'stay.price.fromPrefix': 'vanaf',
    'stay.price.upToPrefix': 'tot',

    // NewsletterFooter.astro (LAT-2436) — artikel/streek-footer; CTA naar Substack
    // (LAT-12309). Merknaam "VinoMartino" blijft ongewijzigd.
    'newsletter.footer.kicker': 'De brief · eens per maand',
    'newsletter.footer.heading': 'Wijnreisverhalen in je inbox',
    'newsletter.footer.lede': 'Eens per maand stuurt Marijn een echte brief: over een wijnmaker die we net bezochten, een regio die opnieuw onze aandacht trok, een fles die indruk maakte.',
    'newsletter.footer.submit': 'Schrijf je in voor De brief',
    'newsletter.footer.fineprint': 'Aanmelden gaat via Substack: je ontvangt een e-mail om je aanmelding te bevestigen. Afmelden kan altijd, met één klik.',

    // NewsletterInline.astro (LAT-12560) — CTA na de eerste sectie van artikelen en streekpagina's.
    'newsletter.inline.heading': 'Dit soort verhalen, eens per maand in je inbox',
    'newsletter.inline.body': 'Eens per maand schrijf ik een brief: waar we waren, wie we spraken, welke fles ons bijbleef. Afmelden kan altijd.',
    'newsletter.inline.submit': 'Schrijf je in voor De brief',


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

    // ArtikelVoetblok.astro (LAT-2820) — vast voetblok onder elk artikel. De
    // lede is één zin met twee inline links ("Dit artikel hoort bij <streek> en
    // <route>."); t() kent geen interpolatie, dus de zin valt uiteen in een
    // prefix en een voegwoord. De spaties eromheen staan in de template, niet in
    // de waarde — een vertaler kan er dan geen per ongeluk weglaten.
    'voetblok.aria': 'Verder lezen',
    'voetblok.hoortBijPre': 'Dit artikel hoort bij',
    'voetblok.hoortBijJoin': 'en',
    'voetblok.routeThumbAria': 'Bekijk de route',
    'voetblok.hotel.kicker': 'Overnachten',
    'voetblok.hotel.labelPre': 'Waar je slaapt in',

    // ArtikelGerelateerdeStukken.astro (LAT-1619) — kop van de rechterzijbalk;
    // rendert zowel als zichtbare <p class="gs-heading"> als in het nav-aria-label.
    // RhoneMap.astro (LAT-1719) — aria-label van de kaart-canvas: 'Kaart:' is de
    // prefix, de kaarttitel volgt als variabele in de template (t() kent geen
    // interpolatie, net als voetblok.routeThumbAria). Beide zijn te kort om de
    // NL-woordratio over NL_THRESHOLD te tillen en stonden dus nog NL op /en/ (LAT-2848).
    'gerelateerdeStukken.title': 'Gerelateerde stukken',
    'rhonemap.aria.mapPre': 'Kaart:',

    // LAT-4909 — de resterende zichtbare chrome van RhoneMap.astro, die als kale
    // literals in de template stond en daardoor NL rendeerde op /en/: het
    // "Kaart"-kickerlabel, het aria-label van de legenda en het legenda-item van
    // de routelijn (alleen variant 'route'). De kaartteksten zelf
    // (titel/bijschrift/legenda-labels) zijn kaart-inhoud, geen chrome, en staan
    // daarom in src/lib/rhone-maps.ts en niet in deze dictionary.
    'rhonemap.label': 'Kaart',
    'rhonemap.legend.aria': 'Legenda',
    'rhonemap.legend.route': 'Route noord → zuid',

    // AffiliatePlaceholder.astro (LAT-1029) — per-type affiliate-blok chrome
    // (titel/omschrijving/cta). De icon-emoji staat in de component (taal-neutraal).
    'affiliate.block.accommodation.title': 'Waar slapen',
    'affiliate.block.accommodation.desc': 'Boek een verblijf in deze streek',
    'affiliate.block.accommodation.cta': 'Bekijk beschikbaarheid',
    'affiliate.block.activity.title': 'Activiteiten & tours',
    'affiliate.block.activity.desc': 'Boek een proeverij of tour in deze streek',
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

    // ── LAT-2693: listing-index chrome (go-live /en/ overzichtsroutes) ──────
    // Elke index-pagina (streken/wijnhuizen/wijnroutes/artikelen/accommodaties +
    // auteurs/infographics) deelt nu een locale-aware component. De NL-defaults
    // hieronder zijn byte-identiek aan de oude hardcoded literals; EN valt terug
    // op NL tot de ui_strings-vertaling landt (T4). Bare `&` in koppen wordt via
    // set:html gerenderd zodat NL byte-identiek blijft.

    // StreekCard.astro — "Begin hier"-hint op het overzicht.
    'streken.card.beginHier': 'Begin hier',

    // StrekenIndex.astro (/streken/).
    'streken.index.meta.title': 'Wijnstreken, Van Piemonte tot de Mosel | VinoMartino',
    'streken.index.meta.description': 'Ontdek de grote wijnstreken van Europa, terroir, druivenrassen, klimaat en de beste producenten. Diepgaande gidsen voor wijnliefhebbers.',
    'streken.index.hero.label': 'Wijnstreken',
    'streken.index.hero.h1': 'Terroir, druiven & traditie',
    'streken.index.hero.desc': 'Piemonte, Etna, Bourgogne, Mosel, elke streek heeft een eigen logica van bodem, klimaat en druif. Hier leg ik ze uit zoals ik ze heb leren kennen: door er naartoe te rijden.',
    'streken.index.tier1.label': 'Zelf gereisd',
    'streken.index.tier1.title': 'Streken waar ik zelf reed',
    'streken.index.tier1.desc': 'Deze gidsen schreef ik na eigen bezoek. Weet je niet waar te beginnen? Start bij de vier met een "Begin hier"-label.',
    'streken.index.tier2.label': 'Redactiegidsen',
    'streken.index.tier2.title': 'Gidsen per land',
    'streken.index.tier2.desc': 'Zorgvuldig samengesteld op basis van primaire bronnen en lokale kennis, gegroepeerd per land.',
    'streken.index.overig': 'Overig',
    'streken.index.empty.title': 'De gidsen zijn onderweg',
    'streken.index.empty.descPre': 'Piemonte, Etna, Bourgogne en de Mosel staan bovenaan de lijst. Ik schrijf ze liever goed dan snel, begin ondertussen bij de ',
    'streken.index.empty.descLink': 'artikelen',
    'streken.index.empty.descPost': '.',

    // LandenIndex.astro (/landen/) — LAT-2709 (EN-route). Empty-state gebruikt
    // pre/link/post zodat de NL-variant byte-identiek blijft (geen link → lege
    // descLink/descPost renderen niets) terwijl EN wél naar /en/artikelen/ linkt.
    'landen.index.meta.title': 'Wijnlanden, Wijnen & wijnstreken per land | VinoMartino',
    'landen.index.meta.description': 'Ontdek de grote wijnlanden van Europa: Italië, Frankrijk, Spanje, Portugal, Duitsland en Oostenrijk. Per land de belangrijkste streken, druivenrassen en reistips.',
    'landen.index.hero.label': 'Wijnlanden',
    'landen.index.hero.h1': 'Wijnen & wijnstreken per land',
    'landen.index.hero.desc': 'De grote wijnlanden van Europa, per land de streken, druivenrassen, tradities en reistips die ertoe doen.',
    'landen.index.empty.title': 'Landengidsen komen eraan',
    'landen.index.empty.descPre': 'We werken aan uitgebreide wijnlandgidsen. Begin ondertussen bij de ',
    'landen.index.empty.descLink': '',
    'landen.index.empty.descPost': '',

    // OntdekContent.astro (/ontdek/) — LAT-2709 (EN-route). Pluraliseringen als
    // losse singular/plural-keys omdat t() geen interpolatie kent.
    'ontdek.index.meta.title': 'Ontdek de wijnatlas, landen & streken | VinoMartino',
    'ontdek.index.meta.description': 'De wijnatlas van VinoMartino: blader van wijnland naar wijnstreek. Per land de streken die ertoe doen, elk met een eigen gids over terroir, druiven en reizen.',
    'ontdek.breadcrumb': 'Ontdek',
    'ontdek.index.hero.label': 'Wijnatlas',
    'ontdek.index.hero.h1': 'Ontdek per land en streek',
    'ontdek.index.hero.desc': 'Blader door de wijnlanden van de wereld. Kies een land, duik in de streken eronder en lees de gids van de regio die je trekt. Hoe meer we toevoegen, hoe rijker de atlas, zonder dat het menu meegroeit.',
    'ontdek.continent.landen.singular': 'land',
    'ontdek.continent.landen.plural': 'landen',
    'ontdek.continent.overig': 'Overig',
    'ontdek.tile.aria.prefix': 'Ontdek',
    'ontdek.tile.region.link.prefix': 'Bekijk het land',
    'ontdek.atlas.foot.wijnlanden.singular': 'wijnland',
    'ontdek.atlas.foot.wijnlanden.plural': 'wijnlanden',
    'ontdek.atlas.foot.streken.singular': 'streek',
    'ontdek.atlas.foot.streken.plural': 'streken',
    'ontdek.atlas.foot.tail': ' in de atlas. Elke streek is een eigen gids over terroir, druiven en reizen.',
    'ontdek.empty.h2': 'De atlas vult zich',
    'ontdek.empty.descPre': 'We werken aan de eerste wijnlandgidsen. Begin ondertussen bij de ',
    'ontdek.empty.descLink': 'artikelen',
    'ontdek.empty.descPost': '.',

    // WijnhuizenIndex.astro (/wijnhuizen/).
    'wijnhuizen.index.meta.title': 'Wijnhuizen, Producenten & wijnmakerijen | VinoMartino',
    'wijnhuizen.index.meta.description': 'Wijnhuizen per streek en druif: portretten van producenten van Barolo tot de Etna, met wat er te weten valt voor een bezoek.',
    'wijnhuizen.index.hero.label': 'Wijnhuizen',
    'wijnhuizen.index.hero.h1': 'Producenten & wijnmakerijen',
    'wijnhuizen.index.hero.desc': 'Niet de fles, maar de mensen erachter: van oude Piëmontese families tot nieuwe-golfmakers op de Etna. Kies op streek of druif en plan een bezoek. Waar ik zelf ben geweest, staat dat op de kaart. De andere portretten zijn redactiegids, gebaseerd op de huizen zelf en vakbronnen.',
    'wijnhuizen.index.empty.title': 'De portretten zijn onderweg',
    'wijnhuizen.index.empty.descPre': 'Elk wijnhuis krijgt één verhaal, geen scorekaart. De eerste portretten verschijnen binnenkort. Begin ondertussen bij de ',
    'wijnhuizen.index.empty.descLink': 'reisartikelen',
    'wijnhuizen.index.empty.descPost': '.',
    // LAT-13075 — keuzehulp op /wijnhuizen/ (zoeken, bestemming, druif).
    'wijnhuizen.filter.label': 'Vind een wijnhuis',
    'wijnhuizen.filter.zoek.label': 'Zoek op naam, streek, plaats of druif',
    'wijnhuizen.filter.zoek.placeholder': 'Bijvoorbeeld Langhe of Riesling',
    'wijnhuizen.filter.bestemming.label': 'Bestemming',
    'wijnhuizen.filter.bestemming.alle': 'Alle bestemmingen',
    'wijnhuizen.filter.land.alle': 'Heel {land}',
    'wijnhuizen.filter.druif.label': 'Druif',
    'wijnhuizen.filter.druif.alle': 'Alle druiven',
    'wijnhuizen.filter.overigeStreken': 'Overige streken',
    'wijnhuizen.filter.meer': 'Meer filters',
    'wijnhuizen.filter.actief': 'Actieve filters',
    'wijnhuizen.filter.wis': 'Alles wissen',
    'wijnhuizen.filter.chip.verwijder': 'Verwijder filter',
    'wijnhuizen.filter.telling.een': '1 wijnhuis',
    'wijnhuizen.filter.telling.meer': '{n} wijnhuizen',
    'wijnhuizen.filter.telling.van': '{n} van {totaal} wijnhuizen',
    'wijnhuizen.filter.leeg.titel': 'Geen wijnhuis dat hier precies op past',
    'wijnhuizen.filter.leeg.tekst': 'Haal een filter weg of zoek breder.',
    'wijnhuizen.filter.leeg.zonderDruif': 'Van {n} huizen is de druif nog niet vastgelegd; die vallen buiten een druiffilter, maar staan er zonder filter gewoon bij.',
    'wijnhuizen.filter.leeg.zoekOveral': 'Zoek "{q}" in alle bestemmingen',
    'wijnhuizen.card.druivenOnbekend': 'Druiven nog niet vastgelegd',
    'wijnhuizen.card.bezoekOnbekend': 'Bezoekmogelijkheid nog niet bevestigd',
    'wijnhuizen.card.druifFilter': 'Toon alle huizen met {druif}',

    // WijnroutesIndex.astro (/wijnroutes/).
    'wijnroutes.index.meta.title': 'Wijnroutes, Gids voor wijnreizen | VinoMartino',
    'wijnroutes.index.meta.description': 'Doorloop de mooiste wijnroutes ter wereld, van de steile Etna-noordflank tot de kronkelende Mosel. Praktische routes voor wijnliefhebbers die zelf op pad gaan.',
    'wijnroutes.index.hero.label': 'Wijnroutes',
    'wijnroutes.index.hero.h1': 'Gids voor wijnreizen',
    'wijnroutes.index.hero.desc': 'Routes door wijnstreken: dagindelingen, slaapadressen en de producenten die het waard zijn om twee weken vooruit voor te bellen.',
    'wijnroutes.index.map.title': 'Alle routes op de kaart',
    // Besluit 2026-10-05: /wijnroutes/ is de ene hub voor routes én Marijns reisverhalen
    // (de oude /reizen-nareizen/ is erin opgegaan). Nieuwe keys, zodat een eventuele
    // CMS-overlay op de oude reizen.*-hero-keys deze copy niet kan overschrijven.
    'wijnroutes.hub.meta.title': 'Wijnroutes om zelf te rijden, met slaapadressen en wijnhuizen | VinoMartino',
    'wijnroutes.hub.meta.description':
        'Wijnroutes van één tot vijf dagen door Europa en de Kaap: dagindeling, wijnhuizen die je kunt bellen en adressen om te slapen. Bij de routes die Marijn zelf reed, lees je hoe het echt ging.',
    'wijnroutes.hub.hero.label': 'Wijnroutes',
    'wijnroutes.hub.hero.h1': 'Wijnroutes om zelf te rijden',
    'wijnroutes.hub.hero.desc':
        'Dagindelingen met wijnhuizen die je kunt bellen en adressen waar je slaapt. Bij de routes die Marijn zelf reed, lees je eerst hoe het echt ging.',
    'wijnroutes.hub.hero.ctaStories': 'Lees hoe het echt ging',
    // Blok "Zo reisden wij hem" op de routepagina (ReisVerhaal.astro).
    'route.verhaal.kicker': 'Zo reisden wij hem · zelf gereisd',
    'route.verhaal.slapen': 'Waar wij sliepen',
    'wijnroutes.index.empty.title': 'Routes zijn onderweg',
    'wijnroutes.index.empty.descPre': 'Langhe, Etna, Mosel en Wachau staan als eerste op de planning. Intussen: de ',
    'wijnroutes.index.empty.descLink': 'reisartikelen',
    'wijnroutes.index.empty.descPost': ' bevatten al logistieke details per regio.',

    // LAT-2693 — artikelen-overzicht (listing-index + facet-filter)
    'artikelen.index.meta.title': 'Artikelen, Wijnverhalen en reistips',
    'artikelen.index.meta.description': 'Lees onze wijnverhalen, regio-gidsen en proefnotities, geschreven door wijnliefhebbers met passie voor terroir.',
    'artikelen.index.hero.label': 'Artikelen',
    'artikelen.index.hero.h1': 'Wijnverhalen & regiogidsen',
    'artikelen.index.hero.desc': 'Eerlijke verhalen, proefnotities en diepgaande regiogidsen, geschreven door wijnliefhebbers.',
    'artikelen.index.filter.rubriek': 'Rubriek',
    'artikelen.index.filter.land': 'Land',
    'artikelen.index.filter.streek': 'Streek',
    'artikelen.index.filter.toggle': 'Filteren',
    'artikelen.index.filter.countOf': 'van',
    'artikelen.index.filter.countItems': 'artikelen',
    'artikelen.index.filter.clear': 'Wis filters',
    'artikelen.index.filterEmpty.title': 'Geen artikelen voor deze filters',
    'artikelen.index.filterEmpty.desc': 'Pas je selectie aan of wis de filters om alles te zien.',
    'artikelen.index.empty.title': 'Artikelen komen eraan',
    'artikelen.index.empty.desc': 'We werken aan wijnverhalen en regiogidsen vanuit eigen bezoek aan de wijngaarden.',

    // LAT-2693 — accommodaties-overzicht (listing-index)
    'accommodaties.breadcrumb.index': 'Accommodaties',
    'accommodaties.index.meta.title': "Accommodaties in wijnregio's, handgekozen verblijven | VinoMartino",
    'accommodaties.index.meta.description': "Per wijnregio een persoonlijke selectie verblijven met echte foto's, locatie en prijsindicatie. Geen willekeurig hotelaanbod, maar adressen die we zelf zouden boeken.",
    'accommodaties.index.hero.label': 'Accommodaties',
    'accommodaties.index.hero.h1': 'Waar te slapen in de wijnstreek',
    'accommodaties.index.hero.desc': 'Voor elke regio een handgekozen selectie verblijven, geen willekeurig hotelaanbod. Kies een streek en vind adressen die we zelf zouden boeken.',
    'accommodaties.index.card.stayOne': 'verblijf',
    'accommodaties.index.card.stayMany': 'verblijven',
    'accommodaties.index.card.selected': 'geselecteerd',
    'accommodaties.index.empty.title': 'De selecties zijn onderweg',
    'accommodaties.index.empty.descPre': "We curateren per regio een handvol verblijven met echte foto's. Begin ondertussen bij de ",
    'accommodaties.index.empty.descLink': 'wijnstreken',
    'accommodaties.index.empty.descPost': '.',

    // LAT-2693 — accommodatie-roundup per streek (gedeelde detailpagina). Chrome
    // via ui.t(); pagina-inhoud (roundup-tekst) blijft NL tot LAT-2687. {regio}
    // wordt via pre/post-concatenatie ingevoegd (t() kent geen interpolatie).
    'accommodaties.roundup.crumbsAria': 'Kruimelpad',
    'accommodaties.roundup.heroLabel': 'Waar slapen',
    'accommodaties.roundup.h1Pre': 'Verblijven in ',
    'accommodaties.roundup.heroDesc': "Handgekozen adressen per bestemming, geen willekeurig hotelaanbod. Plekken die we zelf zouden boeken, met echte foto's en een eerlijke prijsindicatie.",
    'accommodaties.roundup.readGuidePre': 'Lees de wijngids over ',
    'accommodaties.roundup.readGuidePost': ' →',
    'accommodaties.roundup.planningAria': 'Je reis plannen',
    'accommodaties.roundup.meta.titlePre': 'Waar slapen in ',
    'accommodaties.roundup.meta.titlePost': '? Handgekozen verblijven | VinoMartino',
    'accommodaties.roundup.meta.descPre': 'Een persoonlijke selectie verblijven in ',
    'accommodaties.roundup.meta.descPost': ", met echte foto's, locatie en prijsindicatie. Geen willekeurig hotelaanbod, maar adressen die we zelf zouden boeken.",

    // LAT-2693 — auteurs-overzicht + auteur-detail (bios blijven NL; vertaling later)
    // LAT-3068 (A4): index herbouwd tot één Marijn-profiel; grid + per-auteur
    // kaarten zijn vervallen. `auteurs.breadcrumb.index` blijft ook de
    // middelste kruimel op de auteur-detailpagina's (AuteurDetail.astro).
    'auteurs.breadcrumb.index': 'Auteur',
    'auteurs.index.meta.title': 'Marijn — de auteur van VinoMartino',
    'auteurs.index.meta.description': 'Marijn is de stem achter VinoMartino: wijnreiziger, schrijver en de auteur van (vrijwel) elk artikel op deze site.',
    'auteurs.index.kicker': 'Auteur',
    'auteurs.index.lead': 'Eén notitieboekje per reis, één stem achter VinoMartino.',
    'auteurs.index.sophieCameo': 'Sophie reist regelmatig mee en duikt af en toe op in een verhaal — met haar eigen blik op wat er in het glas zit, maar niet als aparte auteur.',
    'auteurs.detail.kicker': 'Auteur',
    'auteurs.detail.metaTitleSuffix': ' — Auteur | VinoMartino',
    'auteurs.detail.regionsHeading': 'Bereisde streken',
    'auteurs.detail.socialPre': 'Volg ',
    'auteurs.detail.socialPost': ' op Instagram',
    'auteurs.detail.articlesHeadingPre': 'Artikelen van ',
    'auteurs.detail.emptyPre': 'Er zijn nog geen gepubliceerde artikelen van ',
    'auteurs.detail.emptyPost': '. Houd deze pagina in de gaten; nieuw werk verschijnt hier zodra het live staat.',

    // LAT-2826 — "Reizen & nareizen"-listing. NL-copy is definitief vastgesteld
    // door de Lead Editor in de ticketomschrijving (Martino-voice goedgekeurd);
    // wijzig deze vier hero/meta-keys niet zonder redactie.
    'reizen.breadcrumb.index': 'Reizen en nareizen',
    // LAT-12365 (Marijn, 3 okt): titel/meta zonder "van Martino" en zonder gedachtestreepje (REGEL 58).
    'reizen.index.meta.title': 'Reizen en nareizen | VinoMartino',
    'reizen.index.meta.description':
        'Wijnreizen om na te reizen: nareizen die Marijn zelf maakte en wijnroutes door Europa, met dagindeling, wijnhuizen en slaapadressen.',
    'reizen.index.hero.label': 'Reizen en nareizen',
    'reizen.index.hero.h1': 'Eerst het verhaal. Dan de route.',
    'reizen.index.hero.desc':
        'Nareizen zijn de reizen die Marijn zelf maakte, met alle omwegen. Routes zijn de dagindelingen om het na te doen.',
    'reizen.index.hero.ctaStories': 'Lees de verhalen',
    'reizen.index.hero.ctaRoutes': 'Kies een route',
    'reizen.index.nareizen.kicker': 'Nareizen · zelf gereisd',
    'reizen.index.nareizen.title': 'Zo ging het echt',
    'reizen.index.nareizen.intro': 'Reizen van Marijn, met wat hij proefde, waar hij sliep en wat hij anders zou doen.',
    'reizen.index.nareizen.newest': 'Uitgelicht',
    'reizen.index.nareizen.kickerCard': 'Nareis',
    'reizen.index.readStory': 'Lees het verhaal',
    'reizen.index.driveRoute': 'Rij deze route zelf',
    'reizen.index.sleep.kicker': 'Slapen waar wij sliepen',
    'reizen.index.sleep.title': 'Hier ging het licht uit',
    'reizen.index.sleep.intro': 'Alleen adressen waar Marijn zelf sliep. Boeken kan via onze partnerlink, jij betaalt niets extra.',
    'reizen.index.routes.kicker': 'Wijnroutes',
    'reizen.index.routes.title': 'Kies je route',
    'reizen.index.routes.intro': 'Dagindelingen met wijnhuizen en slaapadressen. Het label laat zien of Marijn de route reed of dat het een redactiegids is.',
    'reizen.index.map.title': 'Alle routes op de kaart',
    'reizen.index.group.zelf': 'Zelf gereisd',
    'reizen.index.group.zelfSub': 'Routes die Marijn reed of nareisde',
    'reizen.index.group.redactie': 'Redactiegidsen',
    'reizen.index.group.redactieSub': 'Gidsen op primaire bronnen en lokale kennis, zonder ooggetuigeclaim',
    'reizen.chip.aria': 'Filter de routes',
    'reizen.chip.land': 'Land',
    'reizen.chip.dagen': 'Duur',
    'reizen.chip.all': 'Alle',
    'reizen.chip.empty': 'Geen routes met deze combinatie. Kies een ander land of een andere duur.',
    'reizen.chip.dagen.1-2': '1 tot 2 dagen',
    'reizen.chip.dagen.3-4': '3 tot 4 dagen',
    'reizen.chip.dagen.5+': '5 dagen of meer',
    'reizen.meta.dag': 'dag',
    'reizen.meta.dagen': 'dagen',
    'reizen.meta.wijnhuizen': 'wijnhuizen',
    'reizen.index.routes.allCta': 'Alle wijnroutes op de kaart',
    'reizen.index.routes.moreCta': 'Bekijk de route',
    'reizen.index.nareizen.emptyNote': 'Nareizen volgen: Marijn schrijft ze op na elke reis. Begin intussen bij de wijnroutes hieronder.',
    'reizen.label.zelfGereisd': 'Zelf gereisd',
    'reizen.label.redactiegids': 'Redactiegids',
    'reizen.related.nareis.title': 'De nareis van deze streek',
    'reizen.related.route.title': 'Wijnroutes door deze streek',
    'reizen.index.groupFallback': 'Onderweg',
    'reizen.index.readCta': 'Lees de nareis →',
    'reizen.index.empty.title': 'De nareizen zijn onderweg',
    'reizen.index.empty.descPre': 'Er staat nog geen verslag online. Begin intussen bij de ',
    'reizen.index.empty.descLink': 'wijnroutes',
    'reizen.index.empty.descPost': ', daar staat waar de reizen beginnen.',

    // LAT-2826 — chrome van de pakket-/nareisdetailpagina. Stond als losse
    // NL-literals in src/pages/reizen-nareizen/[slug].astro; nu dictionary-driven
    // zodat de /en/-tegenhanger dezelfde keys kan overlayen.
    'reizen.detail.crumbsAria': 'Breadcrumb',
    'reizen.detail.kicker': 'Reizen nareizen',
    'reizen.detail.metaTitleSuffix': ' · Reizen nareizen',
    'reizen.detail.section.dagTotDag': 'Route dag-tot-dag',
    'reizen.detail.section.wijnhuizen': 'Wijnhuizen om te boeken',
    'reizen.detail.section.accommodaties': 'Waar te slapen',
    'reizen.detail.section.reismoment': 'Reismoment',
    'reizen.detail.leesPortret': 'Lees portret →',

    // LAT-2868 — LangheCaptureBlock (Langhe-PDF lead magnet). Stond als hardcoded
    // NL-`variants` in src/components/LangheCaptureBlock.astro; nu dictionary-driven
    // zodat de /en/-artikelpagina de EN-overlay krijgt (seed: ui-strings-en-lat2832).
    'langhe.capture.a.koptekst': 'Meer uit de Langhe in je inbox',
    'langhe.capture.a.body': 'Dit artikel geeft de kern. Wil je meer: waar we proefden, welke wijnhuizen ons bijbleven en wat zo’n reis kost? Dat staat in De Brief, die Marijn eens per maand schrijft.',
    'langhe.capture.a.ctaText': 'Schrijf je in voor De brief',
    'langhe.capture.a.subCopy': 'Eens per maand ontvang je ook De Brief: over wijn, reizen en de mensen erachter. Uitschrijven kan altijd.',
    'langhe.capture.c.koptekst': 'Begin met Piemonte',
    'langhe.capture.c.body': 'Wil je weten waar te beginnen in de Langhe? In De Brief schrijf ik over routes, wijnhuizen en wat het kost, vanuit eigen ervaring.',
    'langhe.capture.c.ctaText': 'Schrijf je in voor De brief',
    'langhe.capture.c.subCopy': 'Eens per maand volgt De Brief: over wijn en reizen vanuit eigen ervaring.',

    // LAT-2921 — HubBacklink (pillar-hub terugverwijzing, src/lib/hub-backlinks.ts).
    // Stond als hardcoded NL-`label` op het HubDef-target; nu dictionary-driven
    // zodat de /en/-tegenhangers van de hub-leden (o.a. auto-huren-sardinie) een
    // EN-label krijgen i.p.v. altijd "Onderdeel van de Italië-wijngids".
    'hub.italie.backlinkLabel': 'Onderdeel van de Italië-wijngids',

    // LAT-3306 (B4) — artikel-rubrieklabels. De NL-waarde is exact de rauwe
    // `articles.category`-string uit Directus, zodat NL byte-identiek blijft en
    // de slug (= filter-URL) ongewijzigd uit die rauwe string blijft komen. Zie
    // src/lib/rubriek-labels.ts; EN-values staan in ui_strings_translations.
    'artikelen.rubriek.regio-gidsen': 'Regio-gidsen',
    'artikelen.rubriek.routes-logistiek': 'Routes & logistiek',
    'artikelen.rubriek.huis-portretten': 'Huis-portretten',
    'artikelen.rubriek.wijnkennis-losjes-uitgelegd': 'Wijnkennis losjes uitgelegd',
    'artikelen.rubriek.verborgen-regio-s': "Verborgen regio's",
    'artikelen.rubriek.proefnotities': 'Proefnotities',
    'artikelen.rubriek.wijn-tafel': 'Wijn & tafel',
};

/**
 * LAT-2831 — statische EN-seed voor de gate-blokkerende UI-strings.
 * Directus `ui_strings_translations` wint (live override); deze map is de
 * code-level fallback zodat de /en/-pagina's de gate passeren ook als Directus
 * nog geen EN-values heeft.  Volgorde in t(): Directus → UI_STRING_EN → UI_STRING_DEFAULTS.
 */
export const UI_STRING_EN: Record<string, string> = {
  // Besluit 2026-10-05: /en/wijnroutes/ is de ene hub (zie WijnroutesHub.astro).
  'wijnroutes.hub.meta.title': 'Wine routes to drive yourself, with places to stay and wineries | VinoMartino',
  'wijnroutes.hub.meta.description':
    'Wine routes of one to five days across Europe and the Cape: day plans, wineries you can call and places to sleep. On the routes Marijn drove himself, you read how it really went.',
  'wijnroutes.hub.hero.label': 'Wine routes',
  'wijnroutes.hub.hero.h1': 'Wine routes to drive yourself',
  'wijnroutes.hub.hero.desc':
    'Day plans with wineries you can call and places to sleep. On the routes Marijn drove himself, you first read how it really went.',
  'wijnroutes.hub.hero.ctaStories': 'Read how it really went',
  'route.verhaal.kicker': 'How we drove it · travelled ourselves',
  'route.verhaal.slapen': 'Where we slept',
  // Code-level EN voor keys die de hub en het verhaalblok delen met oudere
  // families; Directus `ui_strings_translations` wint als die een waarde heeft.
  'streek.breadcrumb.home': 'Home',
  'route.breadcrumb.index': 'Wine routes',
  'wijnroutes.index.empty.title': 'Routes are on their way',
  'wijnroutes.index.empty.descPre': 'Langhe, Etna, Mosel and Wachau are first in line. In the meantime, the ',
  'wijnroutes.index.empty.descLink': 'travel articles',
  'wijnroutes.index.empty.descPost': ' already hold the practical details per region.',
  'reizen.detail.section.dagTotDag': 'Day-by-day route',
  'reizen.detail.section.wijnhuizen': 'Wineries worth booking',
  'reizen.detail.section.reismoment': 'When to go',
  'reizen.detail.leesPortret': 'Read the portrait →',
  // LAT-12451 — redesign /reizen-nareizen/.
  'reizen.index.hero.h1': 'The story first. Then the route.',
  'reizen.index.hero.desc': 'Nareizen are the trips Marijn made himself, detours included. Routes are the day plans to follow in his footsteps.',
  'reizen.index.hero.ctaStories': 'Read the stories',
  'reizen.index.hero.ctaRoutes': 'Pick a route',
  'reizen.index.nareizen.kicker': 'Trip reports · travelled ourselves',
  'reizen.index.nareizen.title': 'How it really went',
  'reizen.index.nareizen.intro': 'Trips by Marijn, with what he tasted, where he slept and what he would do differently.',
  'reizen.index.nareizen.newest': 'Featured',
  'reizen.index.nareizen.kickerCard': 'Trip report',
  'reizen.index.readStory': 'Read the story',
  'reizen.index.driveRoute': 'Drive this route yourself',
  'reizen.index.sleep.kicker': 'Where we slept',
  'reizen.index.sleep.title': 'Lights out here',
  'reizen.index.sleep.intro': 'Only places where Marijn slept himself. Booking goes through our partner link at no extra cost to you.',
  'reizen.index.routes.kicker': 'Wine routes',
  'reizen.index.routes.title': 'Pick your route',
  'reizen.index.routes.intro': 'Day plans with wineries and places to sleep. The label shows whether Marijn drove the route or it is an editorial guide.',
  'reizen.index.map.title': 'All routes on the map',
  'reizen.index.group.zelf': 'Travelled ourselves',
  'reizen.index.group.zelfSub': 'Routes Marijn drove or followed',
  'reizen.index.group.redactie': 'Editorial guides',
  'reizen.index.group.redactieSub': 'Guides built on primary sources and local knowledge, no eyewitness claim',
  'reizen.chip.aria': 'Filter the routes',
  'reizen.chip.land': 'Country',
  'reizen.chip.dagen': 'Length',
  'reizen.chip.all': 'All',
  'reizen.chip.empty': 'No routes match this combination. Pick another country or length.',
  'reizen.chip.dagen.1-2': '1 to 2 days',
  'reizen.chip.dagen.3-4': '3 to 4 days',
  'reizen.chip.dagen.5+': '5 days or more',
  'reizen.meta.dag': 'day',
  'reizen.meta.dagen': 'days',
  'reizen.meta.wijnhuizen': 'wineries',
  'reizen.label.zelfGereisd': 'Travelled ourselves',
  'reizen.label.redactiegids': 'Editorial guide',
  'reizen.index.routes.moreCta': 'View the route',
  'reizen.index.routes.allCta': 'All wine routes on the map',
  // LAT-12300 — eerste-gebruik-tooltip bij de kelder-toggle.
  'header.cellar.tipText': 'Too bright? Read in dark cellar mode.',

  // LAT-11950 — het promoblok in "Ontdek" claimde eigen bezoek voor élke
  // landengids, ook op /en/. Deze keys stonden alleen in UI_STRING_DEFAULTS, dus
  // /en/ kreeg de Nederlandse zin; met de herschrijving krijgt /en/ nu ook de
  // juiste claim in het Engels. Lijst van elf: src/lib/bezochte-streken.ts.
  'header.ontdek.promoKicker': 'Been there or Editorial guide',
  'header.ontdek.promoTitle': 'Every guide says where it comes from',
  'header.ontdek.promoBody': 'Eleven regions I visited myself, from the Loire to the Cape: those pages carry what I tasted and who poured it. The other guides are editorial, built on primary sources and local knowledge, with no eyewitness claim.',

  // LAT-10472 — affiliate-blok chrome + fallback-CTA's. Deze keys worden pas
  // gebruikt als een AffiliateBlockConfig géén eigen ctaLabel/description meegeeft;
  // zonder EN-waarde viel de render terug op de NL-default en lekte die naar /en/.
  'affiliate.block.accommodation.title': 'Where to sleep',
  'affiliate.block.accommodation.desc': 'Book a place to stay in this region',
  'land.section.topWijnhuizenTitle': 'Wineries worth a visit',
  'affiliate.block.accommodation.cta': 'Check availability',
  'affiliate.block.activity.title': 'Activities & tours',
  'affiliate.block.activity.desc': 'Book a tasting or tour in this region',
  'affiliate.block.activity.cta': 'Book this experience',
  'affiliate.block.sidebar.title': 'Book your trip',
  'affiliate.block.sidebar.desc': 'Plan the trip we made',
  'affiliate.block.sidebar.cta': 'Plan your trip',
  'ui.cta.primary.fallbackCta': 'Check availability',
  'ui.cta.comparison.fallbackCta': 'View',
  'ui.cta.closing.fallbackCta': 'Plan your visit',
    // LAT-4776 — beeld-niveau §7-disclosure (BeeldHerkomst.astro). De
    // machineleesbare marker zit in het data-attribuut, niet in deze copy, dus
    // de detector blijft ook op /en/-pagina's werken als deze zin verandert.
    'ui.beeldherkomst.ai': 'AI-generated illustration: editorial interpretation, not photographic evidence.',
    'ui.beeldherkomst.ai.title': 'This image was created with AI as an editorial illustration. It is not photographic evidence of this place.',

    // StreekCard.astro — "Begin hier"-badge.
    'streken.card.beginHier': 'Start here',

    // StrekenIndex.astro (/en/streken/).
    'streken.index.meta.title': 'Wine Regions, From Piedmont to the Mosel | VinoMartino',
    'streken.index.meta.description': 'Discover the great wine regions of Europe — terroir, grape varieties, climate and the best producers. In-depth guides for wine lovers.',
    'streken.index.hero.label': 'Wine regions',
    'streken.index.hero.h1': 'Terroir, grapes &amp; tradition',
    'streken.index.hero.desc': 'Piedmont, Etna, Burgundy, Mosel — each region has its own logic of soil, climate and grape. I explain them here as I came to know them: by driving there.',
    'streken.index.tier1.label': 'Visited in person',
    'streken.index.tier1.title': 'Regions I\'ve driven myself',
    'streken.index.tier1.desc': 'These guides were written after my own visits. Not sure where to start? Begin with the four marked "Start here".',
    'streken.index.tier2.label': 'Editorial guides',
    'streken.index.tier2.title': 'Guides by country',
    'streken.index.tier2.desc': 'Carefully compiled from primary sources and local knowledge, grouped by country.',
    'streken.index.overig': 'Other',
    'streken.index.empty.title': 'The guides are on their way',
    'streken.index.empty.descPre': 'Piedmont, Etna, Burgundy and the Mosel are at the top of the list. I would rather write them well than fast, so start with the ',
    'streken.index.empty.descLink': 'articles',
    'streken.index.empty.descPost': '.',

    // NewsletterFooter.astro / NewsletterInline.astro (LAT-12560): EN had no keys and fell back to Dutch.
    'newsletter.footer.kicker': 'The letter · once a month',
    'newsletter.footer.heading': 'Wine travel stories in your inbox',
    'newsletter.footer.lede': 'Once a month Marijn sends a real letter: about a winemaker we just visited, a region that caught our attention again, a bottle that made an impression.',
    'newsletter.footer.submit': 'Subscribe to The Letter',
    'newsletter.footer.fineprint': 'Signing up goes through Substack: you get an email to confirm your subscription. You can unsubscribe at any time with one click.',
    'newsletter.inline.heading': 'Stories like this, once a month in your inbox',
    'newsletter.inline.body': 'Once a month I write a letter: where we were, who we spoke to, which bottle stayed with us. Unsubscribe at any time.',
    'newsletter.inline.submit': 'Subscribe to The Letter',

    // LangheCaptureBlock.astro — Langhe capture (variant a = mid-article).
    'langhe.capture.a.koptekst': 'More from the Langhe in your inbox',
    'langhe.capture.a.body': 'This article gives you the essentials. Want more: where we tasted, which wineries stayed with us and what a trip like this costs? That is in The Letter, which Marijn writes once a month.',
    'langhe.capture.a.ctaText': 'Subscribe to The Letter',
    'langhe.capture.a.subCopy': 'Once a month you\'ll also receive The Letter: about wine, travel, and the people behind it. Unsubscribe anytime.',

    // LangheCaptureBlock.astro — Langhe capture (variant c = homepage-style).
    'langhe.capture.c.koptekst': 'Start with Piedmont',
    'langhe.capture.c.body': 'If you want to know where to begin in the Langhe: in The Letter I write about routes, wineries and what it costs, from personal experience.',
    'langhe.capture.c.ctaText': 'Subscribe to The Letter',
    'langhe.capture.c.subCopy': 'Once a month The Letter follows: about wine and travel from personal experience.',

    // RhoneMap.astro — kaart-chrome (LAT-4909). `rhonemap.aria.mapPre` is in
    // Directus geseed (LAT-2848) maar had nog geen code-level fallback: bij een
    // Directus-degradatie tijdens de build viel het aria-label terug op "Kaart:".
    'rhonemap.aria.mapPre': 'Map:',
    'rhonemap.label': 'Map',
    'rhonemap.legend.aria': 'Legend',
    'rhonemap.legend.route': 'Route north → south',

    // WijnhuisPageContent.astro — template-chrome van de ~130 wijnhuis-portretten
    // (LAT-4911). EN-copy aangeleverd en goedgekeurd door de Lead Editor.
    // `visit.mapsCta` is bewust identiek aan de NL-default: eigennaam + universele
    // frase. De `§ ` in `story.label` is een typografisch teken, geen taal, dus die
    // blijft ook in de EN-waarde staan.
    'wijnhuis.hero.eyebrow': 'Winery portrait',
    'wijnhuis.meta.streek': 'REGION',
    'wijnhuis.meta.route': 'ROUTE',
    'wijnhuis.meta.sinds': 'SINCE',
    'wijnhuis.meta.hectaren': 'HECTARES',
    'wijnhuis.meta.biologisch': 'ORGANIC',
    'wijnhuis.meta.biologisch.ja': 'Yes',
    'wijnhuis.drieluik.beeldenVanPrefix': 'Images of',
    'wijnhuis.story.label': '§ The story',
    'wijnhuis.wines.eyebrow': 'The wines',
    'wijnhuis.wines.title': 'What we tasted',
    'wijnhuis.visit.eyebrow': 'Visit',
    'wijnhuis.visit.title': 'Getting there',
    'wijnhuis.visit.mapsCta': 'Open in Google Maps →',
    'wijnhuis.visit.reserveCta': 'Request a reservation',
    'wijnhuis.related.label': 'Related',
    'wijnhuis.related.title': 'More wineries in this region',

    // LAT-12769 — Wijnhuis-portret 2.0.
    'wijnhuis.glas.title': 'In one glass',
    'wijnhuis.glas.eyebrow': 'At a glance',
    'wijnhuis.glas.sinds': 'Since',
    'wijnhuis.glas.generatie': 'Generation',
    'wijnhuis.glas.hectares': 'Hectares',
    'wijnhuis.glas.topwijngaarden': 'Top vineyards',
    'wijnhuis.glas.druiven': 'Grapes',
    'wijnhuis.glas.bodem': 'Soil',
    'wijnhuis.glas.helling': 'Steepest slope',
    'wijnhuis.glas.stijl': 'Style',
    'wijnhuis.glas.stijl.zoet.l': 'Dry',
    'wijnhuis.glas.stijl.zoet.r': 'Sweet',
    'wijnhuis.glas.stijl.vol.l': 'Light',
    'wijnhuis.glas.stijl.vol.r': 'Full',
    'wijnhuis.glas.stijl.bewaar.l': 'Drink now',
    'wijnhuis.glas.stijl.bewaar.r': 'Cellar',
    'wijnhuis.glas.prijs': 'Price',
    'wijnhuis.glas.bezoek': 'Visit',
    'wijnhuis.glas.talen': 'Speaks',
    'wijnhuis.bodem.leisteen': 'Slate',
    'wijnhuis.bodem.kalk': 'Limestone',
    'wijnhuis.bodem.vulkanisch': 'Volcanic',
    'wijnhuis.bodem.zand': 'Sand',
    'wijnhuis.bodem.klei': 'Clay',
    'wijnhuis.bodem.loess': 'Loess',
    'wijnhuis.bodem.graniet': 'Granite',
    'wijnhuis.bodem.overig': 'Mixed',
    'wijnhuis.bezoek.zonder_afspraak': 'No appointment',
    'wijnhuis.bezoek.vinothek': 'Tasting room',
    'wijnhuis.bezoek.op_afspraak': 'By appointment',
    'wijnhuis.cta.plan': 'Plan your visit',
    'wijnhuis.cta.route': 'On the route',
    'wijnhuis.badge.zelfGeweest': 'We have been',
    'wijnhuis.drinken.eyebrow': 'What to drink',
    'wijnhuis.drinken.title': 'Three bottles, three moments',
    'wijnhuis.rol.instap': 'Entry',
    'wijnhuis.rol.signature': 'Signature',
    'wijnhuis.rol.splurge': 'Splurge',
    'wijnhuis.drink.vanaf': 'Drink from',
    'wijnhuis.drink.tot': 'until',
    'wijnhuis.drink.wacht': 'Wait until',
    'wijnhuis.drink.koop': 'Buy this bottle',
    'wijnhuis.bezoek.eyebrow': 'Visit',
    'wijnhuis.bezoek.title': 'Plan your visit',
    'wijnhuis.bezoek.adres': 'Address',
    'wijnhuis.bezoek.website': 'Website',
    'wijnhuis.bezoek.openingstijden': 'Opening hours',
    'wijnhuis.bezoek.gesloten': 'Closed',
    'wijnhuis.bezoek.proeverij': 'Tasting',
    'wijnhuis.bezoek.prijs': 'Price p.p.',
    'wijnhuis.bezoek.duur': 'Duration',
    'wijnhuis.bezoek.min': 'min',
    'wijnhuis.bezoek.taal': 'Language',
    'wijnhuis.bezoek.reserveer': 'Book your tasting',
    'wijnhuis.dag.ma': 'Monday',
    'wijnhuis.dag.di': 'Tuesday',
    'wijnhuis.dag.wo': 'Wednesday',
    'wijnhuis.dag.do': 'Thursday',
    'wijnhuis.dag.vr': 'Friday',
    'wijnhuis.dag.za': 'Saturday',
    'wijnhuis.dag.zo': 'Sunday',
    'wijnhuis.ervaring.title': 'Our experience',
    'wijnhuis.combineer.eyebrow': 'Combine with',
    'wijnhuis.combineer.title': 'More nearby',
    'wijnhuis.combineer.route': 'Wine route',
    'wijnhuis.combineer.streek': 'Region',
    'wijnhuis.waarom.eyebrow': 'Why you go here',
    'wijnhuis.faq.eyebrow': 'Quick answers',
    'wijnhuis.faq.title': 'Good to know',

    // RelatedEntities.astro — cross-linkblok onderaan de artikelpagina's (LAT-4911).
    // `related.label`/`related.kind.streek`/`related.kind.wijnhuis` volgen de door de
    // Lead Editor goedgekeurde termen uit de wijnhuis-set (Related / Region / Winery);
    // `related.title`, `related.kind.wijnroute` en `related.kind.land` zijn nieuw en
    // staan ter bevestiging in het EN-copy-issue.
    'related.label': 'Related',
    'related.title': 'Read on',
    'related.kind.streek': 'Region',
    'related.kind.wijnhuis': 'Winery',
    'related.kind.wijnroute': 'Wine route',
    'related.kind.land': 'Country',

    // RouteItineraryDays.astro + RouteGeoMap.astro — stop-soorten en kaart-chrome
    // op de /en/wijnroutes/-pagina's (LAT-4911). `Winery` volgt de goedgekeurde
    // wijnhuis-set; de rest is nieuw en staat ter bevestiging in het EN-copy-issue.
    'route.stop.wijnhuis': 'Winery',
    'route.stop.eten': 'Food',
    'route.stop.bezienswaardigheid': 'Sight',
    'route.stop.overnachting': 'Stay',
    'route.stay.cta': 'View & book',
    'route.stop.duur': 'Allow {duur}.',
    'route.stop.website': 'Website',
    'route.stop.kaart': 'View on map',
    'route.daysAria': 'Days on this route',
    'route.leesPortret': 'Read the portrait',
    'routegeo.label': 'Route map',
    'routegeo.aria.mapPre': 'Map of the route',
    'routegeo.legend.aria': 'Legend',
    'routegeo.legend.dagetappe': 'Day leg',
    'routegeo.legend.wijnhuis': 'Winery',
    'routegeo.legend.overnachten': 'Stay',

    // Keys die de infrastructuur al hadden in UI_STRING_DEFAULTS maar nog geen
    // EN-waarde, en daardoor op /en/ NL terugvielen (LAT-4911). Vallen buiten de
    // twaalf gate-markers, maar staan op dezelfde ~130 pagina's.
    'wijnhuis.breadcrumb.index': 'Wineries',
    'wijnhuizen.index.hero.label': 'Wineries',
    // LAT-13075 — keuzehulp op /en/wijnhuizen/.
    'wijnhuizen.filter.label': 'Find a winery',
    'wijnhuizen.filter.zoek.label': 'Search by name, region, town or grape',
    'wijnhuizen.filter.zoek.placeholder': 'For example Langhe or Riesling',
    'wijnhuizen.filter.bestemming.label': 'Destination',
    'wijnhuizen.filter.bestemming.alle': 'All destinations',
    'wijnhuizen.filter.land.alle': 'All of {land}',
    'wijnhuizen.filter.druif.label': 'Grape',
    'wijnhuizen.filter.druif.alle': 'All grapes',
    'wijnhuizen.filter.overigeStreken': 'Other regions',
    'wijnhuizen.filter.meer': 'More filters',
    'wijnhuizen.filter.actief': 'Active filters',
    'wijnhuizen.filter.wis': 'Clear all',
    'wijnhuizen.filter.chip.verwijder': 'Remove filter',
    'wijnhuizen.filter.telling.een': '1 winery',
    'wijnhuizen.filter.telling.meer': '{n} wineries',
    'wijnhuizen.filter.telling.van': '{n} of {totaal} wineries',
    'wijnhuizen.filter.leeg.titel': 'No winery matches all of this',
    'wijnhuizen.filter.leeg.tekst': 'Remove a filter or search wider.',
    'wijnhuizen.filter.leeg.zonderDruif': 'For {n} wineries the grapes are not recorded yet; a grape filter leaves them out, but without filters they are all listed.',
    'wijnhuizen.filter.leeg.zoekOveral': 'Search "{q}" in all destinations',
    'wijnhuizen.card.druivenOnbekend': 'Grapes not recorded yet',
    'wijnhuizen.card.bezoekOnbekend': 'Visiting options not confirmed yet',
    'wijnhuizen.card.druifFilter': 'Show all wineries with {druif}',
    // ProefnotitieKaart.astro — 'Uit de kelder' stond via UI_COPY hardcoded in het
    // component (LAT-4924 §3). EN-copy goedgekeurd door de Lead Editor.
    'ui.proefnotitie.kaartLabel': 'From the cellar',
    // EerstDitBoeken.astro — 'Eerst dit boeken' stond via UI_COPY hardcoded in het
    // component (LAT-7703), exact dezelfde bug als hierboven.
    'ui.eerstDitBoeken.heading': 'Book these first',
    // LAT-4979 — de resterende datalabels van dezelfde kaart. 'Gedronken in'
    // staat voor een plaats ("Gedronken in: Alba"), dus 'Drunk in'. Bewust NIET
    // 'Tasted in': wij houden geen formele proeverijen, en dat werkwoord claimt
    // een autoriteit die we niet hebben (CEO-besluit 2026-08-14 op LAT-4979,
    // zelfde redenering als het weghalen van de 'zelf gereisd'-badges).
    'ui.proefnotitie.gedronkenLabel': 'Drunk in',
    'ui.proefnotitie.prijsLabel': 'Price',
    // 'Vintage', niet 'Year': vakterm op een fleskaart. Randvoorwaarde van dat
    // besluit is dat het veld een oogstjaar draagt — `proefnotities[].jaar` is
    // vrije tekst, en de enige waarde in Directus is "2017" (gemeten 2026-08-14).
    // Komt er ooit een NV/blend in, val dan terug op 'Year / Producer / Appellation'.
    'ui.proefnotitie.datarij1Labels': 'Vintage / Producer / Appellation',
    'wijnhuis.staynear.aria': 'Nearby places to stay',
    'wijnhuis.staynear.labelPrefix': 'Stay near',
    'wijnhuis.staynear.disclosure': 'Affiliate links · no extra cost to you',
    'wijnhuis.staynear.ctaNearPrefix': 'Stay near',
    'wijnhuis.staynear.ctaNear': 'Stay nearby',

    // Rubriek-labels voor /en/artikelen/ — LAT-3319.
    'artikelen.rubriek.regio-gidsen': 'Region guides',
    'artikelen.rubriek.routes-logistiek': 'Routes & logistics',
    'artikelen.rubriek.huis-portretten': 'Producer profiles',
    'artikelen.rubriek.wijnkennis-losjes-uitgelegd': 'Wine, plainly explained',
    'artikelen.rubriek.verborgen-regio-s': 'Hidden regions',
    'artikelen.rubriek.proefnotities': 'Tasting notes',
    'artikelen.rubriek.wijn-tafel': 'Wine & food',

    // AffiliateBlockDisclosure.astro — LAT-4979. De reserveringszin is de
    // disclosure zelf: drieledig zoals NL (mechanisme / commissie / geen
    // meerprijs), in die volgorde. Dit is de laatste bron van de
    // `wijnhuis`-gate-marker op /en/ (LAT-4911).
    //
    // Board-approval bee76a8a (Marijn, 2026-08-14) ging over de CATEGORIE, niet
    // over deze zin: disclosure-copy is sindsdien R1-self-approvable. De
    // formulering hieronder is de door de CEO vastgestelde eindstand van
    // 2026-08-14 16:24Z; `receives a commission` / `your price is unchanged` is
    // bewust actief en zonder voorbehoud (geen `may`, geen `typically`).
    'affiliate.blockDisclosure.bezoek': 'We visited {producent} in {maand} {jaar}.',
    'affiliate.blockDisclosure.reservering': 'Booking via {bron}. VinoMartino receives a commission — your price is unchanged.',
    'affiliate.blockDisclosure.bron.directeLink': 'the direct link to the winery',

    'ui.maand.januari': 'January',
    'ui.maand.februari': 'February',
    'ui.maand.maart': 'March',
    'ui.maand.april': 'April',
    'ui.maand.mei': 'May',
    'ui.maand.juni': 'June',
    'ui.maand.juli': 'July',
    'ui.maand.augustus': 'August',
    'ui.maand.september': 'September',
    'ui.maand.oktober': 'October',
    'ui.maand.november': 'November',
    'ui.maand.december': 'December',
    // LAT-13056 Variant A "Vlot"
    'card.leesVerder': 'Read more →',
    'card.sticker.zelfGereisd': '✓ Travelled ourselves',
    'home.hero.nieuwTag': 'New',
    'home.feed.title': 'Just back',
    'artikel.facts.aria': 'Key facts about this article',
    // LAT-13056 Variant B "Uitgesproken"
    'home.hero.versLabel': 'fresh off the press',
    'home.hero.versAria': 'The newest articles',
    'card.hand.zelfGeweest': 'been there ourselves',
};

/** Resolver over de UI-dictionary: EN-value indien aanwezig, anders NL-default. */
export interface UiStrings {
    locale: Locale;
    /** Vertaalde string voor `key`; valt terug op de NL-default, en (laatste
     *  redmiddel) op `key` zelf als de key onbekend is. */
    t(key: string): string;
}

function fromDefaults(locale: Locale): UiStrings {
    if (locale === 'en') {
        return { locale, t: (key) => UI_STRING_EN[key] ?? UI_STRING_DEFAULTS[key] ?? key };
    }
    return { locale, t: (key) => UI_STRING_DEFAULTS[key] ?? key };
}

/**
 * LAT-3319 — build-cache per locale.
 *
 * `loadUiStrings()` wordt per *pagina* aangeroepen (ArtikelDetail, AuteurDetail,
 * ArtikelenIndex, HomeContent, ...). Zonder cache betekent dat één Directus-fetch
 * per EN-pagina: bij ~300 EN-pagina's ~300 keer dezelfde dictionary ophalen.
 * Onder die buildload slaat Directus' pressure-limiter aan en antwoordt `503`,
 * waarna `fetchDirectusCollection` per poging 2000 ms slaapt (LAT-2779). In run
 * 30709928435 gebeurde dat 47×; de build tikte daardoor tegen de
 * `timeout-minutes: 30` van deploy.yml aan en werd twee keer op rij afgebroken.
 *
 * De dictionary is build-constant, dus één fetch per locale volstaat. We cachen
 * de *promise* zodat gelijktijdige renders dezelfde fetch delen.
 *
 * Belangrijk: alleen een Directus-gedekt resultaat wordt vastgehouden. Een
 * degradatie (Directus onbereikbaar/503) valt terug op `fromDefaults()`, en
 * `UI_STRING_EN` dekt maar 34 van de 433 keys — dat resultaat site-breed
 * vastpinnen zou 399 keys in het NL zetten op /en/. Zo'n uitkomst wordt dus
 * *niet* gecachet: een volgende pagina probeert het gewoon opnieuw, precies
 * zoals vóór deze wijziging.
 */
const uiStringsCache = new Map<Locale, Promise<UiStrings>>();

export function loadUiStrings(locale: Locale = DEFAULT_LOCALE): Promise<UiStrings> {
    const cached = uiStringsCache.get(locale);
    if (cached) return cached;

    const pending = fetchUiStrings(locale).then(
        ({ ui, cacheable }) => {
            // Terugval op de hardcoded defaults = geen geldige cache-inhoud.
            if (!cacheable) uiStringsCache.delete(locale);
            return ui;
        },
        (err) => {
            uiStringsCache.delete(locale);
            throw err;
        },
    );
    uiStringsCache.set(locale, pending);
    return pending;
}

/** Resultaat + of het de moeite waard is om vast te houden. */
interface UiStringsLoad {
    ui: UiStrings;
    /** `false` zodra we op de hardcoded defaults zijn teruggevallen ná een mislukte fetch. */
    cacheable: boolean;
}

/**
 * Laadt de UI-dictionary voor `locale`. NL = geen fetch (byte-identiek aan de
 * hardcoded defaults). EN = haalt de `ui_strings`-rijen met hun `translations`
 * op, bouwt een key→EN-value-Map en overlayt die op de NL-defaults.
 */
async function fetchUiStrings(locale: Locale = DEFAULT_LOCALE): Promise<UiStringsLoad> {
    // NL en "niet geconfigureerd" zijn deterministisch: geen fetch, dus niets om
    // opnieuw te proberen — cachen is hier gratis en juist.
    if (locale === DEFAULT_LOCALE) return { ui: fromDefaults(locale), cacheable: true };

    const env = readDirectusEnv();
    if (!env.configured) return { ui: fromDefaults(locale), cacheable: true };

    const url = `${env.url}/items/ui_strings?limit=-1&fields=key,translations.languages_code,translations.value`;
    let res: Response;
    try {
        res = await fetchDirectusCollection('loadUiStrings', url, {
            headers: { Authorization: `Bearer ${env.token}` },
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[loadUiStrings] Directus onbereikbaar (${locale}): ${msg} — terugval op NL-defaults.`);
        return { ui: fromDefaults(locale), cacheable: false };
    }
    if (!res.ok) {
        console.warn(`[loadUiStrings] Directus ${res.status} op ui_strings (${locale}) — terugval op NL-defaults.`);
        return { ui: fromDefaults(locale), cacheable: false };
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
        ui: {
            locale,
            t: (key) => overlay.get(key) ?? UI_STRING_EN[key] ?? UI_STRING_DEFAULTS[key] ?? key,
        },
        cacheable: true,
    };
}
