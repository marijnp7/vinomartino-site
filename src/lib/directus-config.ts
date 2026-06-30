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

/**
 * Directus on-the-fly image transform for build-time downloads (LAT-1770).
 * Originals are 3-7 MB; capping at 1600px width / quality 75 keeps heroes crisp
 * on retina while cutting per-asset weight ~95%. JPEG is kept so the `.jpg`
 * filenames and content-type stay unchanged (no template work). `fit=inside`
 * never upscales smaller sources. `format=jpg` is required: without it Directus
 * preserves the source format, so PNG-origin photos stay ~1 MB and serve as
 * image/png under a `.jpg` name.
 */
export const ASSET_TRANSFORM = 'width=1600&quality=75&fit=inside&format=jpg';

/** Append the shared transform to a Directus `/assets/<id>` URL. */
export function assetUrl(directusUrl: string, assetId: string): string {
    return `${directusUrl}/assets/${assetId}?${ASSET_TRANSFORM}`;
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
