/**
 * Shared Directus runtime configuration for site content loaders.
 *
 * Behavior contract (LAT-984):
 * - DIRECTUS_URL + DIRECTUS_TOKEN configured → Directus is the canonical source.
 *   Network/HTTP failures throw, so builds fail loudly instead of silently
 *   serving stale or fallback content.
 * - Both env vars missing → throw with a clear message naming what is missing,
 *   UNLESS ALLOW_LOCAL_CONTENT_FALLBACK=1 is set, in which case local Markdown
 *   files under src/content/* are used (dev / offline-build convenience).
 * - DIRECTUS_INCLUDE_DRAFTS=1 → status filter becomes published+draft (preview
 *   mode). Default keeps drafts out of production builds.
 */

export interface DirectusEnv {
    url: string;
    token: string;
    configured: boolean;
    includeDrafts: boolean;
    localFallbackAllowed: boolean;
}

export function readDirectusEnv(): DirectusEnv {
    const url = (process.env['DIRECTUS_URL'] || '').trim();
    const token = (process.env['DIRECTUS_TOKEN'] || '').trim();
    const includeDrafts = process.env['DIRECTUS_INCLUDE_DRAFTS'] === '1';
    const localFallbackAllowed = process.env['ALLOW_LOCAL_CONTENT_FALLBACK'] === '1';
    return {
        url,
        token,
        configured: Boolean(url && token),
        includeDrafts,
        localFallbackAllowed,
    };
}

/** Directus query fragment selecting only publishable rows. */
export function statusFilterQuery(env: DirectusEnv): string {
    return env.includeDrafts
        ? '&filter[status][_in]=published,draft'
        : '&filter[status][_eq]=published';
}

/** Filter local-Markdown items by status the same way as the Directus query. */
export function filterLocalByStatus<T extends { status?: string }>(items: T[], env: DirectusEnv): T[] {
    if (env.includeDrafts) return items;
    return items.filter((i) => (i.status || 'published') === 'published');
}

/**
 * Decide whether the loader is allowed to fall back to local Markdown files
 * when Directus is unconfigured. Throws with a clear message otherwise so the
 * build crashes instead of producing a silently empty/stale site.
 */
export function assertLocalFallbackAllowed(loaderName: string, env: DirectusEnv): void {
    if (env.localFallbackAllowed) return;
    throw new Error(
        `[${loaderName}] DIRECTUS_URL and DIRECTUS_TOKEN are required for production builds. ` +
            `Set both env vars, or pass ALLOW_LOCAL_CONTENT_FALLBACK=1 for an explicit local-Markdown build.`,
    );
}
