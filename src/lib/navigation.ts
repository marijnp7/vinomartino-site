export interface NavItem {
    label: string;
    href: string;
    key: string;
    order: number;
}

// LAT-1591: de topnav is een vaste, code-gedefinieerde set die NIET meegroeit
// met content. Landen, Streken en Wijnroutes leven voortaan in de
// /ontdek-atlas-hub — een land of streek toevoegen is een bubbel erbij op
// /ontdek, geen nav-item erbij. De pagina's /landen/, /streken/ en /wijnroutes/
// blijven bestaan en bereikbaar.
//
// Bewust niet langer Directus-gestuurd (was LAT-907 nav_items): een
// CMS-bewerkbare nav was precies het mechanisme dat het menu liet groeien.
// Een nav-wijziging gaat voortaan via deze lijst.
const NAV_ITEMS: NavItem[] = [
    { label: 'Ontdek', href: '/ontdek/', key: 'ontdek', order: 5 },
    { label: 'Wijnhuizen', href: '/wijnhuizen/', key: 'wijnhuizen', order: 30 },
    { label: 'Slapen', href: '/accommodaties/', key: 'accommodaties', order: 35 },
    { label: 'Artikelen', href: '/artikelen/', key: 'artikelen', order: 50 },
    { label: 'De brief', href: '/de-brief/', key: 'de-brief', order: 60 },
    { label: 'Over ons', href: '/over-ons/', key: 'over-ons', order: 70 },
];

export async function loadNavigation(): Promise<NavItem[]> {
    return [...NAV_ITEMS].sort((a, b) => a.order - b.order);
}
