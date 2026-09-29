// LAT-11948 — eigen cookieloze eventmeting (vervangt Plausible). POST naar
// /api/events (nginx -> Directus `site_events`). Geen cookie, geen IP-opslag,
// geen fingerprint: de sessie-hash is sha256(willekeurig tab-id uit sessionStorage
// + UTC-datum als dagelijks wisselende salt), dus niet te koppelen over dagen.
export type SiteEventName =
  | 'pageview'
  | 'cta_click'
  | 'newsletter_signup'
  | 'affiliate_in_view'
  | 'web_vital';

export interface SiteEventProps {
  cta_id?: string;
  metric?: string;
  value?: number;
}

const ENDPOINT = '/api/events';
const SID_KEY = 'vm_sid';
const INTERNAL_KEY = 'vm_internal';
const BOT_UA = /bot|crawl|spider|headless|lighthouse|playwright|puppeteer|phantom|selenium|curl|wget|paperclip|vinomartino-agent/i;

export function trackingOptedOut(): boolean {
  const nav = navigator as Navigator & { msDoNotTrack?: string; globalPrivacyControl?: boolean };
  const win = window as Window & { doNotTrack?: string };
  const dnt = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sessionHash(): Promise<string> {
  let sid = '';
  try {
    sid = sessionStorage.getItem(SID_KEY) || '';
    if (!sid) {
      sid = randomId();
      sessionStorage.setItem(SID_KEY, sid);
    }
  } catch {
    sid = randomId();
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${sid}:${todayUtc()}`));
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Eigen verkeer: ?vm_internal=1 zet een vlag in localStorage (ook via /intern/),
// agent- en bot-user-agents en webdriver-browsers, en alles buiten het productiedomein.
function isInternal(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('vm_internal') === '1') localStorage.setItem(INTERNAL_KEY, '1');
    if (params.get('vm_internal') === '0') localStorage.removeItem(INTERNAL_KEY);
    if (localStorage.getItem(INTERNAL_KEY) === '1') return true;
  } catch { /* storage geblokkeerd */ }
  if (window.location.pathname.startsWith('/intern/')) return true;
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
  if (BOT_UA.test(navigator.userAgent)) return true;
  return !/(^|\.)vinomartino\.com$/.test(window.location.hostname);
}

function referrerHost(): string | null {
  if (!document.referrer) return null;
  try {
    const host = new URL(document.referrer).host;
    return host === window.location.host ? null : host;
  } catch {
    return null;
  }
}

export function pageType(path: string): string {
  const p = path.replace(/^\/en(?=\/|$)/, '') || '/';
  if (p === '/') return 'home';
  const first = p.split('/')[1];
  const map: Record<string, string> = {
    streken: 'streek', artikelen: 'artikel', wijnhuizen: 'wijnhuis', accommodaties: 'accommodatie',
    wijnroutes: 'route', landen: 'land', reispakketten: 'reispakket', 'de-brief': 'brief',
    seizoenskalender: 'brief', intern: 'intern',
  };
  return map[first] || 'overig';
}

let hashPromise: Promise<string> | null = null;

function baseRow(event: SiteEventName, props: SiteEventProps) {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  return {
    event,
    cta_id: props.cta_id || null,
    metric: props.metric || null,
    value: typeof props.value === 'number' ? props.value : null,
    path,
    page_type: pageType(path),
    lang: path === '/en' || path.startsWith('/en/') ? 'en' : 'nl',
    referrer_host: referrerHost(),
    utm_source: params.get('utm_source')?.slice(0, 80) || null,
    utm_medium: params.get('utm_medium')?.slice(0, 80) || null,
    utm_campaign: params.get('utm_campaign')?.slice(0, 120) || null,
    is_internal: isInternal(),
  };
}

function post(rows: object[]): void {
  const body = JSON.stringify(rows);
  if (navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .catch(() => { /* best-effort */ });
}

export async function trackEvents(events: Array<[SiteEventName, SiteEventProps?]>): Promise<void> {
  if (trackingOptedOut() || !window.crypto?.subtle) return;
  try {
    hashPromise = hashPromise || sessionHash();
    const session_hash = await hashPromise;
    post(events.map(([name, props]) => ({ ...baseRow(name, props || {}), session_hash })));
  } catch { /* meting mag de pagina nooit breken */ }
}

export function trackEvent(event: SiteEventName, props: SiteEventProps = {}): void {
  void trackEvents([[event, props]]);
}

function ctaIdFor(anchor: HTMLAnchorElement): string {
  const variant = anchor.closest<HTMLElement>('[data-cta-variant]')?.dataset.ctaVariant;
  if (variant) return `${anchor.dataset.affiliatePlacement || 'hub-cta'}:${variant}`;
  if (anchor.dataset.ctaId) return anchor.dataset.ctaId;
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

function observeAffiliateInView(): void {
  const els = document.querySelectorAll<HTMLElement>('[data-affiliate-track]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const el = entry.target as HTMLElement;
      io.unobserve(el);
      trackEvent('affiliate_in_view', {
        cta_id: [el.dataset.affiliatePartner, el.dataset.affiliatePlacement].filter(Boolean).join(':') || 'affiliate',
      });
    }
  }, { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
}

function observeWebVitals(): void {
  if (!('PerformanceObserver' in window)) return;
  let lcp = 0;
  let cls = 0;
  let inp = 0;
  const watch = (type: string, cb: (entry: PerformanceEntry & Record<string, any>) => void, extra: object = {}) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((e) => cb(e as any)))
        .observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
    } catch { /* type niet ondersteund */ }
  };
  watch('largest-contentful-paint', (e) => { lcp = e.startTime; });
  watch('layout-shift', (e) => { if (!e.hadRecentInput) cls += e.value; });
  watch('event', (e) => { if (e.interactionId && e.duration > inp) inp = e.duration; }, { durationThreshold: 40 });
  let sent = false;
  const flush = () => {
    if (sent) return;
    sent = true;
    const rows: Array<[SiteEventName, SiteEventProps]> = [];
    if (lcp) rows.push(['web_vital', { metric: 'LCP', value: Math.round(lcp) }]);
    if (inp) rows.push(['web_vital', { metric: 'INP', value: Math.round(inp) }]);
    rows.push(['web_vital', { metric: 'CLS', value: Math.round(cls * 1000) / 1000 }]);
    void trackEvents(rows);
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}

export function initSiteEvents(): void {
  if (trackingOptedOut()) return;
  trackEvent('pageview');
  observeAffiliateInView();
  observeWebVitals();

  document.addEventListener('click', (event) => {
    const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;
    const isCta =
      anchor.hasAttribute('data-cta-id') ||
      anchor.hasAttribute('data-affiliate-track') ||
      anchor.closest('[data-cta-experiment]') !== null ||
      anchor.classList.contains('btn') ||
      anchor.classList.contains('quiet-cta') ||
      anchor.className.includes('__cta');
    if (isCta) trackEvent('cta_click', { cta_id: ctaIdFor(anchor) });
  }, { capture: true });
}
