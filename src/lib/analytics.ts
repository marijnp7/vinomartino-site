// LAT-1755 — Tiny client helper for privacy-safe custom events.
// Fires named events into Plausible (or any Plausible-compatible window.plausible queue
// installed by src/components/Analytics.astro). No-op when analytics is disabled, so call
// sites stay vendor-agnostic and free of null-checks. Cookieless: sets nothing client-side.

type PlausibleFn = (event: string, options?: { props?: Record<string, string | number | boolean> }) => void;

// Conversion events this site actually has. `join/demo/docs/github` from the brief are
// Paperclip-platform events with no surface on vinomartino.com; add them here if/when a
// promo entrypoint ships.
export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_completed';

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  const fn = (window as Window & { plausible?: PlausibleFn }).plausible;
  if (typeof fn !== 'function') return;
  fn(event, props ? { props } : undefined);
}
