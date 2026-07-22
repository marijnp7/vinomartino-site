/**
 * LAT-1958 — centrale UI-copy ("vertaalstrings"). HARDE REGEL 3: geen hardcoded
 * copy verspreid door de templates. Labels die geen per-rij CMS-veld verdienen
 * (site-brede vaste teksten) staan hier als één bron van waarheid.
 */
export const UI_COPY = {
    /** Twee-tier authenticiteitsmodel (LAT-1957): badge bij streken/artikelen die de redactie zelf bezocht. */
    zelfGereisdBadge: 'Zelf gereisd',
    zelfGereisdBadgeTitle: 'Deze plek is door onze redactie zelf bezocht.',
    /** Tier 2 van het model (LAT-1996): niet zelf bezocht, wel redactioneel samengesteld. */
    redactiegidsBadge: 'Redactiegids',
    redactiegidsBadgeTitle: 'Samengesteld door onze redactie op basis van primaire bronnen en lokale kennis, zonder eigen bezoek.',
    /** LAT-2112 (VIS-STRAT-03, kader LAT-2014) — rubriekenstelsel: value → leesbaar label. */
    rubrieken: {
        de_route: 'De Route',
        het_portret: 'Het Portret',
        uit_de_kelder: 'Uit de kelder',
        eerst_dit_boeken: 'Eerst dit boeken',
    } as Record<string, string>,
    rubriekSignatuurTitle: 'Terugkerende rubriek met een eigen redactionele scope en visuele stempel.',
    /** Tier-prefix voor de rubriek-signatuur (Tier 1 / Tier 2), toegekend door Lead Editor. */
    tierPrefix: 'Tier',
    /** LAT-2112 — koppen voor de "Uit de kelder"-kaarten en het "Eerst dit boeken"-voetblok. */
    proefnotitieKaartLabel: 'Uit de kelder',
    proefnotitieDatarij1Labels: 'Jaar / Wijnmaker / Appellation',
    proefnotitieGedronkenLabel: 'Gedronken in',
    proefnotitiePrijsLabel: 'Prijs',
    eerstDitBoekenHeading: 'Eerst dit boeken',
} as const;
