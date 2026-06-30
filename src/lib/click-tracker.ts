// LAT-1019 / LAT-1029 — Affiliate click tracker (in-house, cookieless, DNT-aware)
// POSTs a small JSON beacon to /api/clicks/affiliate (nginx → Directus `affiliate_clicks`).
// Picks up any element marked [data-affiliate-track] via delegated click — works for the
// LAT-1029 AffiliateBlock today and any future affiliate <a> we annotate.
import { trackPlausible } from './plausible';

export interface AffiliateClickPayload {
  placement: string;
  partner: string;
  context: string;
  path: string;
  referrer_host: string | null;
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

function buildPayload(el: HTMLElement): AffiliateClickPayload {
  return {
    placement: el.dataset.affiliatePlacement || '',
    partner: el.dataset.affiliatePartner || '',
    context: el.dataset.affiliateContext || '',
    path: window.location.pathname,
    referrer_host: getReferrerHost(),
  };
}

function sendPlausible(el: HTMLElement, anchor: HTMLAnchorElement | null): void {
  const context = el.dataset.affiliateContext || '';
  const region = context.includes('-') ? context.slice(context.indexOf('-') + 1) : '';
  let domain = '';
  if (anchor?.href) {
    try { domain = new URL(anchor.href).hostname; } catch { /* ignore */ }
  }
  trackPlausible('affiliate_click', {
    label: context,
    affiliate_partner: el.dataset.affiliatePartner || '',
    region,
    placement: el.dataset.affiliatePlacement || '',
    affiliate_url_domain: domain,
    path: window.location.pathname,
  });
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
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const trackEl = target.closest<HTMLElement>('[data-affiliate-track]');
    if (!trackEl) return;
    send(buildPayload(trackEl));
    sendPlausible(trackEl, target.closest<HTMLAnchorElement>('a[href]'));
  }, { capture: true });
}
