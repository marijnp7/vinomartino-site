type PlausibleEvent =
  | 'affiliate_click'
  | 'component_view'
  | 'cta_click'
  | 'cta_click_early'
  | 'cta_click_late'
  | 'newsletter_signup'
  | 'region_selected';

type PlausibleFn = (
  eventName: PlausibleEvent | string,
  options?: { props?: Record<string, string | number | boolean> },
) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

function trackingOptedOut(): boolean {
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

function cleanProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean;
}

export function trackPlausible(eventName: PlausibleEvent, props: Record<string, unknown> = {}): void {
  if (trackingOptedOut()) return;
  const plausible = window.plausible;
  if (typeof plausible !== 'function') return;
  plausible(eventName, { props: cleanProps(props) });
}

function normalizeRegion(value: string): string {
  return value
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.toLowerCase() || 'unknown';
}

function ctaTypeFor(anchor: HTMLAnchorElement): string {
  if (anchor.dataset.plausibleCta) return anchor.dataset.plausibleCta;
  if (anchor.dataset.affiliateTrack !== undefined) return 'affiliate';
  const href = anchor.getAttribute('href') || '';
  if (href.startsWith('/de-brief')) return 'newsletter';
  if (href.startsWith('/artikelen/')) return 'article_link';
  if (href.startsWith('/accommodaties/')) return 'book_accommodation';
  if (href.startsWith('/wijnhuizen/')) return 'winery_profile';
  if (href.startsWith('/wijnroutes/')) return 'route_link';
  if (href.startsWith('/streken/')) return 'region_link';
  return 'navigation';
}

function linkDomain(anchor: HTMLAnchorElement): string {
  try {
    return new URL(anchor.href).hostname;
  } catch {
    return '';
  }
}

export function initPlausibleInteractions(): void {
  if (trackingOptedOut()) return;

  // LAT-2019 KPI A noemer: component-impressie != pageview (de Overnachten-
  // component rendert alleen op streek-/accommodatiepagina's met een boekbaar
  // adres). Eén 'component_view' per pageview waar de Bekijk & boek-knop staat
  // levert de juiste CTR-noemer; de server-side kliklog blijft autoritatief.
  if (document.querySelector('[data-cta="bekijk-boek"]')) {
    trackPlausible('component_view', {
      component: 'overnachten',
      path: window.location.pathname,
    });
  }

  // newsletter_signup wordt gevuurd door initNewsletterForms (newsletter-signup.ts),
  // ná een geslaagde fetch-submit, zodat region_preference de echte keuze reflecteert.

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;

      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('/streken/')) {
        trackPlausible('region_selected', {
          region: normalizeRegion(href),
          path: window.location.pathname,
        });
      }

      const isCta =
        anchor.hasAttribute('data-plausible-cta') ||
        anchor.classList.contains('btn') ||
        anchor.classList.contains('quiet-cta') ||
        anchor.className.includes('__cta');

      if (!isCta || anchor.hasAttribute('data-affiliate-track')) return;

      trackPlausible('cta_click', {
        cta_type: ctaTypeFor(anchor),
        label: anchor.textContent?.trim().slice(0, 80) || '',
        path: window.location.pathname,
        target_path: href,
        target_domain: linkDomain(anchor),
      });
    },
    { capture: true },
  );
}
