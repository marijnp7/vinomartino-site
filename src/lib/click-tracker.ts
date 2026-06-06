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

export function initAffiliateTracker(): void {
  if (navigator.doNotTrack === '1') return;
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const trackEl = target.closest<HTMLElement>('[data-affiliate-track]');
    if (!trackEl) return;
    send(buildPayload(trackEl));
  }, { capture: true });
}
