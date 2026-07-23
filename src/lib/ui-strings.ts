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
    'header.ontdek.promoKicker': 'Zelf gereisd',
    'header.ontdek.promoTitle': 'Met liefde geselecteerd',
    'header.ontdek.promoBody': 'Elke landengids hier komt voort uit een eigen wijnreis: geen bureautips, maar streken, telers en flessen die we zelf bezochten en proefden.',
    'header.ontdek.alleLanden': 'Alle landen',
    'header.search.openAria': 'Zoeken openen',
    'header.search.label': 'Zoeken',
    'header.cellar.enterAria': 'Ga naar de kelder (donkere modus)',
    'header.cellar.enterLabel': 'Naar de kelder',
    'header.cellar.exitLabel': 'Naar buiten',
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
    'home.proof.aria': 'Bewijs en gezicht',
    'home.proof.portraitAlt': 'Marijn proeft een glas wijn met wijngaarden op de achtergrond',
    'home.proof.kicker': 'Bewijs en gezicht',
    'home.proof.stat1Label': 'streken zelf bereisd',
    'home.proof.stat2Label': 'sinds we op pad zijn',
    'home.proof.manifestPre': 'Waar we zelf waren, zie je dat: het label ',
    'home.proof.manifestEm': 'Zelf gereisd',
    'home.proof.cta': 'Ons verhaal →',
    'home.brief.dateline': 'De Brief · elke twee weken',
    'home.brief.heading': 'Elke twee weken een brief. Geen lijstjes.',
    'home.brief.body': 'Een persoonlijke brief van Marijn: wat we recent dronken, waar we waren, en welke fles ons opviel. Geen affiliate-deals, geen nieuwsbriefformule.',
    'home.brief.emailLabel': 'E-mailadres',
    'home.brief.emailPlaceholder': 'je@adres.nl',
    'home.brief.submit': 'Stuur me de brief',

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
    'streken.index.empty.descPre': 'Piemonte, Etna, Bourgogne, Mosel en Priorat staan bovenaan de lijst. Ik schrijf ze liever goed dan snel, begin ondertussen bij de ',
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
    'landen.index.empty.descPre': "We werken aan uitgebreide wijnlandgidsen op basis van eigen bezoek aan de regio's.",
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
    'wijnhuizen.index.meta.description': 'Ontdek de wijnhuizen achter de fles, van eigenzinnige Barolo-producenten tot vulkanische pioniers op de Etna. Persoonlijke portretten van wijnmakers die er echt toe doen.',
    'wijnhuizen.index.hero.label': 'Wijnhuizen',
    'wijnhuizen.index.hero.h1': 'Producenten & wijnmakerijen',
    'wijnhuizen.index.hero.desc': 'Niet de fles, maar de mensen erachter. Wijnmakers die ik heb bezocht, met wie ik heb gesproken, van oude Piëmontese families tot radicale nieuwe-golf producenten op de Etna.',
    'wijnhuizen.index.empty.title': 'De portretten zijn onderweg',
    'wijnhuizen.index.empty.descPre': 'Elk wijnhuis krijgt één verhaal, geen scorekaart. De eerste portretten verschijnen zodra ik de bezoeken achter me heb. Begin ondertussen bij de ',
    'wijnhuizen.index.empty.descLink': 'reisartikelen',
    'wijnhuizen.index.empty.descPost': '.',

    // WijnroutesIndex.astro (/wijnroutes/).
    'wijnroutes.index.meta.title': 'Wijnroutes, Gids voor wijnreizen | VinoMartino',
    'wijnroutes.index.meta.description': 'Doorloop de mooiste wijnroutes ter wereld, van de steile Etna-noordflank tot de kronkelende Mosel. Praktische routes voor wijnliefhebbers die zelf op pad gaan.',
    'wijnroutes.index.hero.label': 'Wijnroutes',
    'wijnroutes.index.hero.h1': 'Gids voor wijnreizen',
    'wijnroutes.index.hero.desc': 'Routes die ik zelf heb gereden, met de Fiat Panda, de trein, soms met een koffer te veel. Dagindelingen, slaapadressen en de producenten die het waard zijn om twee weken vooruit voor te bellen.',
    'wijnroutes.index.map.title': 'Alle routes op de kaart',
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
    'auteurs.breadcrumb.index': 'Auteurs',
    'auteurs.index.meta.title': 'Auteurs — VinoMartino',
    'auteurs.index.meta.description': 'Wie schrijft VinoMartino? Maak kennis met de schrijvers achter onze wijnreizen en proefnotities.',
    'auteurs.index.kicker': 'Auteurs',
    'auteurs.index.h1': 'Wie schrijft VinoMartino',
    'auteurs.index.lead': 'Eén notitieboekje per reis, een eigen stem per schrijver. Hieronder vindt u wie er achter de stukken zit.',
    'auteurs.index.readMorePre': 'Lees artikelen van ',
    'auteurs.index.readMorePost': ' →',
    'auteurs.detail.kicker': 'Auteur',
    'auteurs.detail.metaTitleSuffix': ' — Auteur | VinoMartino',
    'auteurs.detail.regionsHeading': 'Bereisde streken',
    'auteurs.detail.socialPre': 'Volg ',
    'auteurs.detail.socialPost': ' op Instagram',
    'auteurs.detail.articlesHeadingPre': 'Artikelen van ',
    'auteurs.detail.emptyPre': 'Er zijn nog geen gepubliceerde artikelen van ',
    'auteurs.detail.emptyPost': '. Houd deze pagina in de gaten; nieuw werk verschijnt hier zodra het live staat.',
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
        res = await fetchDirectusCollection('loadUiStrings', url, {
            headers: { Authorization: `Bearer ${env.token}` },
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
