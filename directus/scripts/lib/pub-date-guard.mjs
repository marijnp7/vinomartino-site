/**
 * LAT-2358 — shared guard so scripts never reset a publication date on update.
 *
 * pub_date is set once, at first publication. Any PATCH of an existing item must
 * NOT carry pub_date (or its aliases); editorial changes belong in updated_at.
 * Import/seed/wire scripts should route their update payload through
 * stripPubDateForUpdate() before PATCHing.
 */

// Field names that represent the immutable first-publication date.
export const PUB_DATE_FIELDS = ['pub_date', 'pubDate', 'published_at', 'date_published'];

/**
 * Returns a shallow copy of `fields` with any publication-date key removed.
 * Use for PATCH/update of an existing item.
 */
export function stripPubDateForUpdate(fields) {
  const out = {};
  let stripped = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (PUB_DATE_FIELDS.includes(k)) {
      stripped.push(k);
      continue;
    }
    out[k] = v;
  }
  if (stripped.length && process.env.PUB_DATE_GUARD_VERBOSE) {
    console.warn(`[pub-date-guard] stripped ${stripped.join(', ')} from update payload`);
  }
  return out;
}

/**
 * Throw if an update payload contains a publication-date field. Use when you want
 * a hard failure instead of silent stripping.
 */
export function assertNoPubDateOnUpdate(fields) {
  const hit = Object.keys(fields || {}).filter((k) => PUB_DATE_FIELDS.includes(k));
  if (hit.length) {
    throw new Error(
      `[pub-date-guard] update payload must not set ${hit.join(', ')} — pub_date is immutable after first publication (LAT-2358).`,
    );
  }
}
