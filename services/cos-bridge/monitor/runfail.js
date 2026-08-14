// LAT-5994 — bewaker op run-mislukkingen (LAT-5991 punt 2).
//
// Op 2026-08-14 tussen 11:34Z en 12:33Z gingen 100 van de 106 runs vlootbreed
// stuk op `Not logged in - Please run /login`. Er ging niets af. De bestaande
// OAuth-bewaker meet de refresh-DEADLINE, niet of runs daadwerkelijk kunnen
// inloggen — en hij werd door de storing zelf stilgelegd, want hij draait sinds
// LAT-5123 als agent-routine (zie de kop van monitor.js). Een detector die zelf
// een agent-run nodig heeft is per constructie blind voor de storing die runs
// sloopt.
//
// Vandaar dat deze check hier woont: `paperclip-monitor-1` is een node-proces
// met een eigen interval en een eigen meldroute (POST /notify -> cos-bridge ->
// Telegram). Dat die route de storing overleeft is niet geredeneerd maar
// gemeten: cos.notifications id 7/8/9/10 zijn om 11:36:09Z, 11:36:10Z,
// 11:42:53Z en 11:44:26Z verstuurd en afgeleverd (`delivered='t'`) terwijl in
// datzelfde kwartier vrijwel elke agent-run stierf.
//
// De meting zelf gaat rechtstreeks op `agent_wakeup_requests`: geen agent, geen
// checkout, geen wake. Alleen SELECT.
//
// Dit bestand bevat bewust alleen de query-opbouw en het OORDEEL, allebei puur
// en zonder netwerk. `monitor.js` importeert ze en `test/lat5994-run-failure-
// test.mjs` importeert exact dezelfde functies — er is dus maar één predicaat,
// en de rood/groen-proef bindt aan de code die live draait, niet aan een kopie
// (zie het "twee detectoren, één gepland"-patroon dat we hier eerder in liepen).

// --- drempels ---------------------------------------------------------------
// Venster van 15 min bij een check-cadans van 5 min: de storing van 14-08 zat
// binnen ~5 min boven de drempel (bucket 11:30-11:35: n=9, ratio 0,56).
export const RUN_FAILURE_WINDOW_MINUTES = 15;
// 30%. Gemeten baseline over de 7 dagen voor het incident: 2023 tikken van 5
// min, waarvan 62 boven deze drempel — en die 62 zijn GEEN ruis maar twee echte
// vlootbrede storingen: 07-08 t/m 10-08 "Secret decryption failed (master key
// fingerprint: ...)" over 6 agents, en 14-08 "Not logged in". Buiten die twee
// clusters komt de ratio in geen enkel venster boven 0,30. De drempel scheidt
// dus storing van achtergrond, niet hoog van laag.
export const RUN_FAILURE_RATIO_THRESHOLD = 0.30;
// Onder 5 wakes in het venster is de ratio niet informatief (1 op 2 is 50%).
// Zulke vensters heten hier `undetermined`: ze vuren niet, maar ze wissen ook
// geen lopend alarm en ze rapporteren n mee. Stil vallen bij weinig verkeer is
// precies hoe een bewaker groen gaat lijken terwijl hij niets weet.
export const RUN_FAILURE_MIN_N = 5;
// Deelt één identieke fout dit aandeel van alle mislukkingen over >= 2 agents,
// dan wijst dat op een GEDEELDE oorzaak (credential, route) en niet op iets
// per-agent. Dat onderscheid was op 14-08 de hele diagnose.
export const SHARED_CAUSE_SHARE = 0.5;
export const SHARED_CAUSE_MIN_AGENTS = 2;

// Alleen een letterlijke timestamp of `now()` mag in de SQL. Deze bewaker
// bouwt query-tekst op, dus de enige veilige vorm is een whitelist.
const AT_LITERAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?Z?$/;

export function atExpression(at) {
  if (at === undefined || at === null || at === "now") return "now()";
  if (typeof at !== "string" || !AT_LITERAL.test(at)) {
    throw new Error(`ongeldige --at waarde: ${JSON.stringify(at)} (verwacht 'YYYY-MM-DD HH:MM[:SS][Z]')`);
  }
  return `timestamptz '${at.replace("T", " ")}'`;
}

/**
 * De twee queries van de check. Beide read-only, beide op hetzelfde venster.
 * @param {{at?: string, windowMinutes?: number}} opts
 */
export function runFailureQueries(opts = {}) {
  const windowMinutes = opts.windowMinutes ?? RUN_FAILURE_WINDOW_MINUTES;
  if (!Number.isInteger(windowMinutes) || windowMinutes <= 0) {
    throw new Error(`windowMinutes moet een positief geheel getal zijn, kreeg ${windowMinutes}`);
  }
  const at = atExpression(opts.at);
  const window = `requested_at > ${at} - interval '${windowMinutes} minutes' and requested_at <= ${at}`;
  return {
    totals: `select count(*)::text as n, count(*) filter (where status = 'failed')::text as nfail
      from agent_wakeup_requests where ${window}`,
    // Groeperen op de fout met cijferreeksen genormaliseerd: zonder dat valt
    // "Process lost -- child pid 170292" in evenveel groepen als er rijen zijn
    // en verdwijnt juist het signaal waar het om gaat, namelijk dat ÉÉN fout
    // meerdere agents raakt.
    groups: `select regexp_replace(coalesce(error, '(geen error-tekst)'), '[0-9]+', 'N', 'g') as norm,
             min(left(coalesce(error, '(geen error-tekst)'), 160)) as sample,
             count(*)::text as n, count(distinct agent_id)::text as agents
      from agent_wakeup_requests where status = 'failed' and ${window}
      group by 1 order by count(*) desc, 1 limit 5`,
  };
}

/** Zet de twee query-resultaten om in de sample die classify() leest. */
export function toSample(totalsRows, groupRows) {
  const t = totalsRows[0] || ["0", "0"];
  return {
    n: parseInt(t[0], 10),
    nfail: parseInt(t[1], 10),
    groups: groupRows.map((r) => ({
      error: r[1],
      n: parseInt(r[2], 10),
      agents: parseInt(r[3], 10),
    })),
  };
}

/**
 * Puur oordeel. Geen netwerk, geen klok, geen env.
 *
 * Uitkomsten:
 *   { fault }                       de meting zelf mislukte — NOOIT als gezond lezen
 *   { sev: 2, ... }                 alarm: ratio >= drempel bij n >= minimum
 *   { sev: 0, undetermined: true }  te weinig verkeer om iets te zeggen (houdt vast)
 *   { sev: 0 }                      gezond
 */
export function classifyRunFailures(sample, opts = {}) {
  if (!sample || sample.error) {
    return { fault: sample?.error || "geen meting" };
  }
  const { n, nfail } = sample;
  if (!Number.isFinite(n) || !Number.isFinite(nfail)) {
    return { fault: `onleesbare telling (n=${sample.n}, nfail=${sample.nfail})` };
  }
  const ratioThreshold = opts.ratioThreshold ?? RUN_FAILURE_RATIO_THRESHOLD;
  const minN = opts.minN ?? RUN_FAILURE_MIN_N;
  const ratio = n > 0 ? nfail / n : 0;
  const groups = (sample.groups || []).slice().sort((a, b) => b.n - a.n);
  const top = groups[0] || null;
  const shared = Boolean(
    top && nfail > 0 && top.n / nfail >= SHARED_CAUSE_SHARE && top.agents >= SHARED_CAUSE_MIN_AGENTS
  );
  const base = { n, nfail, ratio, groups, top, shared, windowMinutes: opts.windowMinutes ?? RUN_FAILURE_WINDOW_MINUTES };

  if (n < minN) return { ...base, sev: 0, undetermined: true };
  if (ratio >= ratioThreshold) return { ...base, sev: 2 };
  return { ...base, sev: 0 };
}

/** Eén regel die in elk logboek en elke melding hetzelfde leest. */
export function formatRunFailureLine(verdict) {
  if (verdict.fault) return `runfail: fault=${verdict.fault}`;
  const pct = (verdict.ratio * 100).toFixed(0);
  const state = verdict.undetermined ? "onbepaald" : verdict.sev === 2 ? "ALARM" : "ok";
  return `runfail: ${state} ratio=${pct}% nfail=${verdict.nfail}/${verdict.n} venster=${verdict.windowMinutes}m` +
    (verdict.shared ? " gedeelde-oorzaak=ja" : "");
}

/** Foutgroepen als leesbaar blok voor de melding. */
export function formatRunFailureGroups(verdict) {
  if (!verdict.groups || verdict.groups.length === 0) return "(geen mislukkingen in het venster)";
  return verdict.groups
    .map((g) => `  ${g.n}x over ${g.agents} agent(s): ${g.error}`)
    .join("\n");
}
