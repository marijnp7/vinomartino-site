// LAT-1823: pillar-hub backlinks. Specifieke content-pagina's verwijzen terug
// naar hun landenhub ("Onderdeel van de Italië-wijngids"). Bewust een expliciete
// allowlist per hub i.p.v. een land-brede regel: de hub-leden zijn handmatig
// gecureerd (de Kaap-wijnroute is bijv. Zuid-Afrikaans maar dient als
// voorbeeldroute in de Italië-gids) en mogen niet vanzelf meegroeien.

export type HubMemberType = 'streek' | 'artikel' | 'accommodatie' | 'route';

export interface HubBacklinkTarget {
  href: string;
  label: string;
}

interface HubDef {
  target: HubBacklinkTarget;
  members: Record<HubMemberType, string[]>;
}

const HUBS: HubDef[] = [
  {
    target: { href: '/landen/italie/', label: 'Onderdeel van de Italië-wijngids' },
    members: {
      streek: ['langhe-piemonte'],
      artikel: ['wijnreizen-piemonte-complete-gids', 'auto-huren-sardinie'],
      accommodatie: ['langhe-piemonte'],
      route: ['kaap-wijnroute'],
    },
  },
];

/** Returns the hub backlink for a page, or null when the page is not a member. */
export function hubBacklinkFor(type: HubMemberType, slug: string | undefined): HubBacklinkTarget | null {
  if (!slug) return null;
  for (const hub of HUBS) {
    if (hub.members[type]?.includes(slug)) return hub.target;
  }
  return null;
}
