// LAT-1593 — KPI-dashboard data-loader (build-time snapshot).
//
// Leest de cookieless click-tracker-data (affiliate_clicks, fase 2 LAT-1019/1592)
// uit Directus en aggregeert clicks per regio/partner/plaatsing voor het interne
// dashboard op /intern/dashboard/ (nginx basic-auth beschermd).
//
// LAT-1789 — voegt de CJ-commissie-import toe: leest `affiliate_commissions`
// (dagelijkse CJ Commission Detail import, import-cj-commissions.mjs) en berekent
// commissie/omzet per partner/regio/plaatsing, conversie en omzet-per-bezoeker, plus
// de CJ-reconciliatie (tracker-clicks naast CJ-conversies en commissie).
//
// De site is statisch (SSG): dit is een snapshot per build/deploy, geen live
// stream. Dat past bij het deploy-ritme en hergebruikt het bestaande build-time
// Directus-leespad (directus-config.ts).
//
// Graceful degradation: zowel affiliate_clicks als affiliate_commissions zijn los
// geprovisioneerde collecties. Ontbreekt een collectie of de lees-permissie voor het
// build-token, dan faalt de build NIET — het dashboard rendert een nette
// "nog geen data / wacht op provisioning"-staat (vgl. LAT-1011).

import { readDirectusEnv, fetchDirectusCollection } from './directus-config';

export interface ClickRow {
  placement: string;
  partner: string;
  context: string;
  path: string;
  clicked_at: string | null;
}

export interface CommissionRow {
  click_id: string;
  partner: string;
  region: string;
  placement: string;
  commission_usd: number;
  commission_eur: number;
  sale_amount_usd: number;
  event_date: string | null;
}

export interface CountBucket {
  key: string;
  label: string;
  count: number;
}

export interface CommissionBucket {
  key: string;
  label: string;
  conversions: number;
  commissionEur: number;
}

export interface CjReconRow {
  partner: string;
  trackedClicks: number;
  cjConversions: number;
  commissionEur: number;
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
  // LAT-1789 — commissies.
  commissionsAvailable: boolean;
  totalConversions: number;
  totalCommissionEur: number;
  totalCommissionUsd: number;
  conversionRate: number; // conversies / clicks (0..1)
  revenuePerVisitor: number; // commissie EUR / clicks
  commissionByPartner: CommissionBucket[];
  commissionByRegio: CommissionBucket[];
  commissionByPlacement: CommissionBucket[];
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
    commissionsAvailable: false,
    totalConversions: 0,
    totalCommissionEur: 0,
    totalCommissionUsd: 0,
    conversionRate: 0,
    revenuePerVisitor: 0,
    commissionByPartner: [],
    commissionByRegio: [],
    commissionByPlacement: [],
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
    if (!r.clicked_at) continue;
    const t = Date.parse(r.clicked_at);
    if (Number.isFinite(t) && t >= cutoff) n++;
  }
  return n;
}

/** Som commissie per dimensie (partner/regio/plaatsing). */
function tallyCommission(
  rows: CommissionRow[],
  pick: (r: CommissionRow) => string,
  labeler?: (key: string) => string,
): CommissionBucket[] {
  const acc = new Map<string, { conversions: number; commissionEur: number }>();
  for (const r of rows) {
    const key = pick(r) || '(leeg)';
    const cur = acc.get(key) ?? { conversions: 0, commissionEur: 0 };
    cur.conversions += 1;
    cur.commissionEur += r.commission_eur || 0;
    acc.set(key, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ key, label: labeler ? labeler(key) : key, conversions: v.conversions, commissionEur: v.commissionEur }))
    .sort((a, b) => b.commissionEur - a.commissionEur || b.conversions - a.conversions);
}

async function loadCommissions(env: ReturnType<typeof readDirectusEnv>): Promise<CommissionRow[] | null> {
  try {
    const res = await fetchDirectusCollection(
      'clicks-dashboard',
      `${env.url}/items/affiliate_commissions?limit=-1&fields=click_id,partner,region,placement,commission_usd,commission_eur,sale_amount_usd,event_date&sort=-event_date`,
      { headers: { Authorization: `Bearer ${env.token}` } },
    );
    // Collectie of read-permissie ontbreekt → commissies (nog) niet beschikbaar; geen build-fout.
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Partial<CommissionRow>[] };
    return (json.data ?? []).map((r) => ({
      click_id: String(r.click_id ?? ''),
      partner: String(r.partner ?? ''),
      region: String(r.region ?? ''),
      placement: String(r.placement ?? ''),
      commission_usd: Number(r.commission_usd ?? 0) || 0,
      commission_eur: Number(r.commission_eur ?? 0) || 0,
      sale_amount_usd: Number(r.sale_amount_usd ?? 0) || 0,
      event_date: r.event_date ? String(r.event_date) : null,
    }));
  } catch {
    return null;
  }
}

export async function loadClicksDashboard(): Promise<ClicksDashboard> {
  const env = readDirectusEnv();
  if (!env.configured) {
    return emptyDashboard('unconfigured', 'Directus is niet geconfigureerd in deze build.');
  }

  let rows: ClickRow[];
  try {
    const res = await fetchDirectusCollection(
      'clicks-dashboard',
      `${env.url}/items/affiliate_clicks?limit=-1&fields=placement,partner,context,path,clicked_at&sort=-clicked_at`,
      { headers: { Authorization: `Bearer ${env.token}` } },
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
      clicked_at: r.clicked_at ? String(r.clicked_at) : null,
    }));
  } catch (err) {
    return emptyDashboard('unavailable', `Kon affiliate_clicks niet laden: ${(err as Error).message}`);
  }

  // Commissies laden (LAT-1789). null = collectie/permissie ontbreekt → commissie-panelen
  // tonen een "wacht op provisioning"-staat, maar de click-cijfers renderen gewoon.
  const commissions = await loadCommissions(env);
  const commissionsAvailable = commissions !== null;
  const comms = commissions ?? [];

  if (rows.length === 0 && comms.length === 0) {
    return { ...emptyDashboard('empty', 'Nog geen clicks geregistreerd.'), status: 'empty', commissionsAvailable };
  }

  const byPartner = tally(rows, (r) => r.partner);

  // Commissie-aggregaties.
  const totalConversions = comms.length;
  const totalCommissionEur = comms.reduce((s, r) => s + (r.commission_eur || 0), 0);
  const totalCommissionUsd = comms.reduce((s, r) => s + (r.commission_usd || 0), 0);
  const conversionRate = rows.length > 0 ? totalConversions / rows.length : 0;
  const revenuePerVisitor = rows.length > 0 ? totalCommissionEur / rows.length : 0;

  // Conversies + commissie per partner, voor de reconciliatie.
  const commByPartnerKey = new Map<string, { conversions: number; commissionEur: number }>();
  for (const r of comms) {
    const key = (r.partner || '(leeg)').toLowerCase();
    const cur = commByPartnerKey.get(key) ?? { conversions: 0, commissionEur: 0 };
    cur.conversions += 1;
    cur.commissionEur += r.commission_eur || 0;
    commByPartnerKey.set(key, cur);
  }

  // CJ-reconciliatie: tracker-clicks naast CJ-conversies + commissie per CJ/Booking-partner.
  const reconKeys = new Set<string>([
    ...byPartner.map((b) => b.key.toLowerCase()).filter((k) => CJ_PARTNERS.has(k)),
    ...[...commByPartnerKey.keys()].filter((k) => CJ_PARTNERS.has(k)),
  ]);
  const cjReconciliation: CjReconRow[] = [...reconKeys].map((key) => {
    const tracked = byPartner.find((b) => b.key.toLowerCase() === key)?.count ?? 0;
    const comm = commByPartnerKey.get(key);
    return {
      partner: key,
      trackedClicks: tracked,
      cjConversions: comm?.conversions ?? 0,
      commissionEur: comm?.commissionEur ?? 0,
    };
  }).sort((a, b) => b.commissionEur - a.commissionEur || b.trackedClicks - a.trackedClicks);

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
    commissionsAvailable,
    totalConversions,
    totalCommissionEur,
    totalCommissionUsd,
    conversionRate,
    revenuePerVisitor,
    commissionByPartner: tallyCommission(comms, (r) => r.partner),
    commissionByRegio: tallyCommission(comms, (r) => r.region, (k) => k || '(onbekend)'),
    commissionByPlacement: tallyCommission(comms, (r) => r.placement, (k) => k || '(onbekend)'),
    cjReconciliation,
  };
}
