/**
 * Shared Directus runtime configuration for site content loaders.
 *
 * Behavior contract (LAT-984, hardened by LAT-1078):
 * - DIRECTUS_URL + DIRECTUS_TOKEN configured → Directus is the canonical source.
 *   Network/HTTP failures throw, so builds fail loudly instead of silently
 *   serving stale or fallback content.
 * - Both env vars missing → throw with a clear message naming what is missing.
 *   The legacy ALLOW_LOCAL_CONTENT_FALLBACK escape hatch was removed in
 *   LAT-1078: src/content/_legacy/* is archive, not a runtime source.
 * - DIRECTUS_INCLUDE_DRAFTS=1 → status filter becomes published+draft (preview
 *   mode). Default keeps drafts out of production builds.
 */

export interface DirectusEnv {
    url: string;
    token: string;
    configured: boolean;
    includeDrafts: boolean;
}

export function readDirectusEnv(): DirectusEnv {
    const url = (process.env['DIRECTUS_URL'] || '').trim();
    const token = (process.env['DIRECTUS_TOKEN'] || '').trim();
    const includeDrafts = process.env['DIRECTUS_INCLUDE_DRAFTS'] === '1';
    return {
        url,
        token,
        configured: Boolean(url && token),
        includeDrafts,
    };
}

/** Directus query fragment selecting only publishable rows. */
export function statusFilterQuery(env: DirectusEnv): string {
    return env.includeDrafts
        ? '&filter[status][_in]=published,draft'
        : '&filter[status][_eq]=published';
}

/**
 * Fail the build when Directus is not configured. LAT-1078 removed the local
 * Markdown fallback — src/content/_legacy/* is archive-only and must never be
 * rendered. Loaders call this before any work.
 */
export function assertDirectusConfigured(loaderName: string, env: DirectusEnv): void {
    if (env.configured) return;
    throw new Error(
        `[${loaderName}] DIRECTUS_URL and DIRECTUS_TOKEN are required. ` +
            `Local Markdown under src/content/_legacy/ is archive-only since LAT-1078 ` +
            `and is no longer a runtime fallback. Configure Directus or point the build at a preview Directus instance.`,
    );
}

/**
 * LAT-1768 — is soft-degradation (return [] on a collection-level 403/404) allowed?
 *
 * Production builds must fail loud: a broken Directus/DAM coupling should block
 * the deploy before publication instead of silently shipping empty pages. The
 * only builds permitted to degrade are preview/dev:
 * - preview builds set DIRECTUS_INCLUDE_DRAFTS=1 (deploy.yml), so Marijn can
 *   still review the rest of the site even when one collection's permission is
 *   mid-migration.
 * - local/dev builds can opt in explicitly with ALLOW_CONTENT_DEGRADE=1.
 *
 * Default (production: neither flag set) returns false → callers throw.
 */
export function allowContentDegrade(env: DirectusEnv): boolean {
    return env.includeDrafts || process.env['ALLOW_CONTENT_DEGRADE'] === '1';
}

/**
 * LAT-1768 — handle a collection-level access failure (the build-role cannot
 * read the whole collection: terminal 403/404 after all field-tier fallbacks).
 * In production this throws so the build fails loud; in preview/dev it logs and
 * lets the caller degrade to an empty list. This is distinct from field-tier
 * 400/403 fallbacks, which legitimately mean "field not migrated yet" and must
 * stay tolerant.
 */
export function assertCollectionReadableOrDegrade(
    loaderName: string,
    collection: string,
    status: number,
    env: DirectusEnv,
    bodySnippet = '',
): void {
    const base =
        `[${loaderName}] Directus collection '${collection}' ontoegankelijk voor build-rol (HTTP ${status}).` +
        (bodySnippet ? ` Body: ${bodySnippet}` : '');
    if (allowContentDegrade(env)) {
        console.error(`${base} Preview/dev degradeert naar lege lijst — fix Directus-permissies (LAT-1013).`);
        return;
    }
    throw new Error(
        `${base} Productie-build afgebroken (LAT-1768 fail-loud): een kapotte CMS/DAM-koppeling ` +
            `mag geen lege pagina's publiceren. Fix de Directus-permissie, of zet ALLOW_CONTENT_DEGRADE=1 ` +
            `voor een expliciete preview/dev-build.`,
    );
}
