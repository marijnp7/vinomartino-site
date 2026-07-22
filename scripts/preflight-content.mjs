#!/usr/bin/env node
/**
 * LAT-1768 — production content preflight.
 *
 * Runs BEFORE `astro build` on production deploys. It verifies that the
 * Directus/DAM coupling is healthy enough to publish: the env is configured and
 * the core live content types return at least a minimum number of *published*
 * rows. A broken CMS/DAM coupling (missing env, broken collection permission,
 * empty collection) exits non-zero so the deploy is blocked before publication
 * instead of shipping empty pages to promotional traffic.
 *
 * Posture:
 * - Production (default): hard-fail (exit 1) on any problem.
 * - Preview/dev: warn-only. Signalled by DIRECTUS_INCLUDE_DRAFTS=1 (deploy.yml
 *   sets this for preview) or an explicit ALLOW_CONTENT_DEGRADE=1.
 *
 * Per-type minimums are overridable via env: MIN_LANDEN, MIN_ARTICLES,
 * MIN_STREKEN, MIN_ROUTES (default 1 each — the regression we guard against is a
 * collection silently returning zero rows).
 */

const url = (process.env.DIRECTUS_URL || '').trim();
const token = (process.env.DIRECTUS_TOKEN || '').trim();
const includeDrafts = process.env.DIRECTUS_INCLUDE_DRAFTS === '1';
const allowDegrade = includeDrafts || process.env.ALLOW_CONTENT_DEGRADE === '1';

const minFor = (key, fallback) => {
    const raw = Number(process.env[key]);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
};

// Live content types that drive promotional landing pages. status=published
// matches the production build filter (drafts excluded).
const CHECKS = [
    { collection: 'landen', label: 'landen', min: minFor('MIN_LANDEN', 1) },
    { collection: 'articles', label: 'artikelen', min: minFor('MIN_ARTICLES', 1) },
    { collection: 'streken', label: 'streken', min: minFor('MIN_STREKEN', 1) },
    { collection: 'routes', label: 'routes', min: minFor('MIN_ROUTES', 1) },
];

const statusFilter = includeDrafts
    ? 'filter[status][_in]=published,draft'
    : 'filter[status][_eq]=published';

function fail(msg) {
    if (allowDegrade) {
        console.warn(`[preflight] WARN (preview/dev, niet-blokkerend): ${msg}`);
        return false;
    }
    console.error(`[preflight] FAIL: ${msg}`);
    return true;
}

async function countPublished(collection) {
    const endpoint = `${url}/items/${collection}?limit=0&meta=filter_count&${statusFilter}`;
    const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `collectie '${collection}' ontoegankelijk voor build-rol (HTTP ${res.status}): ${body.slice(0, 200)}`,
        );
    }
    const json = await res.json();
    const count = json?.meta?.filter_count;
    if (typeof count !== 'number') {
        throw new Error(`collectie '${collection}' gaf geen meta.filter_count terug`);
    }
    return count;
}

async function main() {
    let problems = 0;

    if (!url || !token) {
        if (fail('DIRECTUS_URL en/of DIRECTUS_TOKEN ontbreken — kan content niet verifiëren.')) problems++;
        // Without env there is nothing further to check.
        return problems;
    }

    for (const check of CHECKS) {
        try {
            const count = await countPublished(check.collection);
            if (count < check.min) {
                if (fail(`${check.label}: ${count} gepubliceerd, minimaal ${check.min} vereist.`)) problems++;
            } else {
                console.log(`[preflight] OK ${check.label}: ${count} gepubliceerd (min ${check.min}).`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (fail(msg)) problems++;
        }
    }
    return problems;
}

main()
    .then((problems) => {
        if (problems > 0) {
            console.error(
                `[preflight] ${problems} probleem(en) — productie-deploy geblokkeerd (LAT-1768). ` +
                    `Fix de Directus/DAM-koppeling, of draai met ALLOW_CONTENT_DEGRADE=1 voor een preview/dev-build.`,
            );
            process.exit(1);
        }
        console.log('[preflight] alle content-checks geslaagd.');
    })
    .catch((err) => {
        // Unexpected runtime error (e.g. Directus unreachable). Treat as a hard
        // failure in production; preview/dev still blocks because reachability
        // is a prerequisite for any build.
        console.error(`[preflight] onverwachte fout: ${err instanceof Error ? err.stack || err.message : String(err)}`);
        process.exit(1);
    });
