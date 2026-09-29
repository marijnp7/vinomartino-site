// LAT-1843 — Meetfundament voor de CTA A/B-test op de Italië-hub (LAT-1842).
// Wijst elke bezoeker stabiel (localStorage) 50/50 toe aan variant 'early' of
// 'late'. De klik zelf meet site-events.ts (LAT-11948): cta_id = '<plaatsing>:<variant>'.
// Scope: alleen actief binnen een [data-cta-experiment]-container; de Italië-hub
// zet die marker, andere pagina's niet → no-op elders.
export type CtaVariant = 'early' | 'late';

const STORAGE_KEY = 'vm_cta_ab_variant';

function pickVariant(): CtaVariant {
  return Math.random() < 0.5 ? 'early' : 'late';
}

// Stabiel per bezoeker: eenmaal toegewezen blijft de variant staan, zodat de
// A/B-toewijzing consistent is over page views (localStorage kan falen in
// private mode / storage-blokkers → dan per-load fallback, geen crash).
function assignVariant(): CtaVariant {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'early' || stored === 'late') return stored;
    const variant = pickVariant();
    localStorage.setItem(STORAGE_KEY, variant);
    return variant;
  } catch {
    return pickVariant();
  }
}

export function initCtaExperiment(): void {
  // LAT-1842 rendert twee slots (data-cta-slot="early"|"late"), elk in een eigen
  // [data-cta-experiment]-container. Beide krijgen DEZELFDE, eenmaal toegewezen
  // variant; CSS toont enkel de bijpassende slot (zie landen/[slug].astro).
  const containers = document.querySelectorAll<HTMLElement>('[data-cta-experiment]');
  if (containers.length === 0) return;

  const variant = assignVariant();

  containers.forEach((container) => {
    // Exposeer de variant voor LAT-1842 (plaatsing vroeg vs. laat) + CSS/QA.
    container.dataset.ctaVariant = variant;

  });
}
