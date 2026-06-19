// LAT-1593 — KPI-dashboard data-loader (build-time snapshot).
//
// Leest de cookieless click-tracker-data (affiliate_clicks, fase 2 LAT-1019/1592)
// uit Directus en aggregeert clicks per regio/partner/plaatsing voor het interne
// dashboard op /intern/dashboard/ (nginx basic-auth beschermd).
//
// De site is statisch (SSG): dit is een snapshot per build/deploy, geen live
// stream. Dat past bij het deploy-ritme en hergebruikt het bestaande build-time
// Directus-leespad (directus-config.ts).
//
// Graceful degradation: de affiliate_clicks-collectie is handmatig aangemaakt en
// staat (nog) niet in het bootstrap-schema. Ontbreekt de collectie of de lees-
// permissie voor het build-token, dan faalt de build NIET — het dashboard rendert
// een nette "nog geen data / wacht op provisioning"-staat (vgl. de streken-loader
// retry-zonder-veld en de 400/403-retry, LAT-1011).

import { readDirectusEnv } from './directus-config';

export interface ClickRow {
  placement: string;
  partner: string;
  context: string;
  path: string;
  date_created: string | null;
}

export interface CountBucket {
  key: string;
  label: string;
  count: number;
}

export interface CjReconRow {
  partner: string;
  trackedClicks: number;
}

export type DashboardStatus = 'ok' | 'empty' | 'unconfigured' | 'unavailable';

export interface ClicksDashboard {
  status: DashboardStatus;
  message: string | null;
  generatedAt: string;
  totalClicks: number;
  clicks7d: number;
  clicks30d: number;
  byPartner: CountBucket[];
  byPlacement: CountBucket[];
  byRegio: CountBucket[];
  cjReconciliation: CjReconRow[];
}

// Partners die via CJ/Booking lopen en in de reconciliatie thuishoren.
const CJ_PARTNERS = new Set(['booking.com', 'stay22']);

function emptyDashboard(status: DashboardStatus, message: string | null): ClicksDashboard {
  return {
    status,
    message,
    generatedAt: new Date().toISOString(),
    totalClicks: 0,
    clicks7d: 0,
    clicks30d: 0,
    byPartner: [],
    byPlacement: [],
    byRegio: [],
    cjReconciliation: [],
  };
}

/** Leid een leesbare regio/context af uit de tracker-context ('streek-etna' -> 'etna'). */
function regioFromContext(context: string): string {
  if (!context) return '(onbekend)';
  const m = context.match(/^(streek|wijnhuis|accommodatie|landen?)-(.+)$/);
  return (m ? m[2] : context).replace(/-/g, ' ');
}

function tally(rows: ClickRow[], pick: (r: ClickRow) => string, labeler?: (key: string) => string): CountBucket[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r) || '(leeg)';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labeler ? labeler(key) : key, count }))
    .sort((a, b) => b.count - a.count);
}

function countSince(rows: ClickRow[], days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const r of rows) {
    if (!r.date_created) continue;
    const t = Date.parse(r.date_created);
    if (Number.isFinite(t) && t >= cutoff) n++;
  }
  return n;
}

export async function loadClicksDashboard(): Promise<ClicksDashboard> {
  const env = readDirectusEnv();
  if (!env.configured) {
    return emptyDashboard('unconfigured', 'Directus is niet geconfigureerd in deze build.');
  }

  let rows: ClickRow[];
  try {
    const res = await fetch(
      `${env.url}/items/affiliate_clicks?limit=-1&fields=placement,partner,context,path,date_created&sort=-date_created`,
      { headers: { Authorization: `Bearer ${env.token}` }, signal: AbortSignal.timeout(15000) },
    );
    if (res.status === 403 || res.status === 404) {
      return emptyDashboard(
        'unavailable',
        'De affiliate_clicks-collectie of de lees-permissie voor het build-token ontbreekt. ' +
          'DevOps moet de collectie + read-permissie provisioneren (zie schema-script).',
      );
    }
    if (!res.ok) {
      return emptyDashboard('unavailable', `Directus gaf status ${res.status} terug.`);
    }
    const json = (await res.json()) as { data?: Partial<ClickRow>[] };
    rows = (json.data ?? []).map((r) => ({
      placement: String(r.placement ?? ''),
      partner: String(r.partner ?? ''),
      context: String(r.context ?? ''),
      path: String(r.path ?? ''),
      date_created: r.date_created ? String(r.date_created) : null,
    }));
  } catch (err) {
    return emptyDashboard('unavailable', `Kon affiliate_clicks niet laden: ${(err as Error).message}`);
  }

  if (rows.length === 0) {
    return { ...emptyDashboard('empty', 'Nog geen clicks geregistreerd.'), status: 'empty' };
  }

  const byPartner = tally(rows, (r) => r.partner);
  const cjReconciliation: CjReconRow[] = byPartner
    .filter((b) => CJ_PARTNERS.has(b.key.toLowerCase()))
    .map((b) => ({ partner: b.key, trackedClicks: b.count }));

  return {
    status: 'ok',
    message: null,
    generatedAt: new Date().toISOString(),
    totalClicks: rows.length,
    clicks7d: countSince(rows, 7),
    clicks30d: countSince(rows, 30),
    byPartner,
    byPlacement: tally(rows, (r) => r.placement),
    byRegio: tally(rows, (r) => r.context, regioFromContext),
    cjReconciliation,
  };
}
