export type OverviewIcon = 'calendar' | 'car' | 'pin' | 'wine' | 'grapes' | 'plane' | 'clock' | 'ticket' | 'home' | 'people' | 'land' | 'info';
export interface OverviewFact { label: string; value: string; icon?: OverviewIcon; }
// Optional explicit icons win; existing editorial JSON remains backwards compatible.
export function overviewIcon(label: string): OverviewIcon {
  const s = label.toLowerCase();
  if (/druif|druiven|grape/.test(s)) return 'grapes';
  if (/vlieg|airport|flight/.test(s)) return 'plane';
  if (/vervoer|transport|rijd|rijt|driv|auto/.test(s)) return 'car';
  if (/overnacht|basis|base|slapen|\bstays?\b|accommod/.test(s)) return 'home';
  if (/prijs|budget|price|cost|reserv|afspraak|appointment|booking/.test(s)) return 'ticket';
  if (/generatie|generation/.test(s)) return 'people';
  if (/hectare|oppervlak|area/.test(s)) return 'land';
  if (/duur|duration|bezoektijd|visit time/.test(s)) return 'clock';
  if (/seizoen|season|oogst|harvest|jaargang|vintage|sinds|since|dagen|days|beste tijd|best time/.test(s)) return 'calendar';
  if (/wijnhuis|winer|stijl|style|appellat/.test(s)) return 'wine';
  if (/adres|address|etappe|stage|stop|route/.test(s)) return 'pin';
  return 'info';
}
export function overviewFacts(facts: OverviewFact[]): OverviewFact[] {
  return facts.filter(f => typeof f.label === 'string' && typeof f.value === 'string' && f.label.trim() && f.value.trim())
    .map(f => ({ label: f.label.trim(), value: f.value.trim(), icon: f.icon ?? overviewIcon(f.label) }));
}
