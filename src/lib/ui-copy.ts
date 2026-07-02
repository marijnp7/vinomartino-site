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
} as const;
