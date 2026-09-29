// LAT-1019 / LAT-1029 — Affiliate click tracker (in-house, cookieless, DNT-aware)
// POSTs a small JSON beacon to /api/clicks/affiliate (nginx → Directus `affiliate_clicks`).
// Picks up any element marked [data-affiliate-track] via delegated click — works for the
// LAT-1029 AffiliateBlock today and any future affiliate <a> we annotate.

export interface AffiliateClickPayload {
  placement: string;
  partner: string;
  context: string;
  path: string;
  referrer_host: string | null;
  /** LAT-11947: SubID van de plaatsing, uit de uitgaande href (CJ sid, TradeTracker r, GYG cmp, Stay22 campaign). */
  subid: string;
  /** LAT-11947: eerste externe referrer (alleen hostnaam) van deze sessie, uit sessionStorage. */
  first_referrer_host: string | null;
}

const ENDPOINT = '/api/clicks/affiliate';

function getReferrerHost(): string | null {
  if (!document.referrer) return null;
  try {
    const u = new URL(document.referrer);
    if (u.host === window.location.host) return null;
    return u.host;
  } catch {
    return null;
  }
}

const FIRST_REF_KEY = 'vm_first_ref';

// Alleen hostnaam, alleen sessionStorage (tabblad-sessie), geen cookie, geen persoonsgegeven.
// '-' = de sessie startte zonder externe referrer (direct of intern), zodat een latere
// interne referrer die waarde niet alsnog overschrijft.
export function captureFirstReferrerHost(): void {
  try {
    if (sessionStorage.getItem(FIRST_REF_KEY) !== null) return;
    sessionStorage.setItem(FIRST_REF_KEY, getReferrerHost() ?? '-');
  } catch { /* storage geblokkeerd: geen first-ref, klik werkt gewoon */ }
}

function getFirstReferrerHost(): string | null {
  try {
    const v = sessionStorage.getItem(FIRST_REF_KEY);
    return v && v !== '-' ? v : null;
  } catch {
    return null;
  }
}

export function subidFromHref(href: string): string {
  try {
    const p = new URL(href, window.location.href).searchParams;
    return p.get('sid') || p.get('r') || p.get('cmp') || p.get('campaign') || '';
  } catch {
    return '';
  }
}

function buildPayload(el: HTMLElement, anchor: HTMLAnchorElement | null): AffiliateClickPayload {
  return {
    placement: el.dataset.affiliatePlacement || '',
    partner: el.dataset.affiliatePartner || '',
    context: el.dataset.affiliateContext || '',
    path: window.location.pathname,
    referrer_host: getReferrerHost(),
    subid: anchor?.href ? subidFromHref(anchor.href).slice(0, 200) : '',
    first_referrer_host: getFirstReferrerHost(),
  };
}

function send(payload: AffiliateClickPayload): void {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon(ENDPOINT, blob)) return;
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => { /* best-effort */ });
}

// LAT-1592 — ACM/AVG-compliant opt-out: respecteer Do-Not-Track in al zijn
// browser-varianten plus Global Privacy Control. Eén signaal = niet tracken.
function trackingOptedOut(): boolean {
  const nav = navigator as Navigator & {
    msDoNotTrack?: string;
    globalPrivacyControl?: boolean;
  };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  if (dnt === '1' || dnt === 'yes') return true;
  if (nav.globalPrivacyControl === true) return true;
  return false;
}

export function initAffiliateTracker(): void {
  if (trackingOptedOut()) return;
  captureFirstReferrerHost();
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const trackEl = target.closest<HTMLElement>('[data-affiliate-track]');
    if (!trackEl) return;
    send(buildPayload(trackEl, target.closest<HTMLAnchorElement>('a[href]')));
  }, { capture: true });
}
