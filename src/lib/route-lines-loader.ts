// LAT-13816 — laadt de vooraf berekende wegroutes (gecommit, nooit tijdens build of
// bezoek opgehaald). Ontbreekt het bestand voor een slug, dan null: de kaart valt
// terug op de rechte lijn en de km-cel verdwijnt.
import type { RouteLine } from './route-lines';

const files = import.meta.glob<RouteLine>('../data/route-lines/*.json', { eager: true, import: 'default' });
const bySlug = new Map<string, RouteLine>(
    Object.values(files).filter((l) => l && typeof l.slug === 'string').map((l) => [l.slug, l]),
);

export function loadRouteLine(slug: string): RouteLine | null {
    return bySlug.get(slug) ?? null;
}
