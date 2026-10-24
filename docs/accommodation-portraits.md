# Accommodation portraits: production contract

Approved reference: `/paperclip/design/vinomartino/accommodatieportret-concept-20261020/IMPLEMENTATION.txt`.
The static preview is a visual reference, never a content source for a build.

## Canonical URL and publication

`/accommodaties/{streek.slug}/{accommodations.slug}/` and the same path under
`/en/`. The existing one-segment path is the streek roundup. Never make an
`articles` copy. Both locale pages must exist together, or neither exists.
`accommodations.status=published` remains the card gate. A detail page additionally
requires `portrait_status=published`, the data validation below, and an EN
translation row. A card may remain public without a portrait.

## Directus fields

The migration `directus/scripts/extend-accommodations-portraits.mjs` adds:

| Collection | Field | Meaning |
| --- | --- | --- |
| `accommodations` | `portrait_status` | `draft`, `in_review`, `published`; independent of card status |
| `accommodations` | `portrait_content` | Complete NL copy and structured blocks |
| `accommodations` | `portrait_gallery` | Ordered image IDs and rights/credit metadata |
| `accommodations` | `portrait_permission_ref` | Source of image permission |
| `accommodations` | `portrait_review_ref` | Independent editorial approval |
| `accommodations_translations` | `portrait_content` | Complete EN copy; no fallback |

Keep `hero_image`, `booking_url`, `streek_id`, `slug`, `name` and existing card
fields in their current records. `portrait_gallery` is one array shared by both
locales: `{file_id, credit, source_url}` per item. It contains at least three
inline images, all from Directus DAM with proven rights. The hero needs credit
in the content of each locale. No AI transformation of property images.

`portrait_content` is one object per locale, with nonempty `title`, `intro`,
`booking_reason`, `why`, `considerations`, `rooms`, `wine`, `practical`,
`booking_cta`, `hero_alt`, `hero_credit`, `disclosure`, `meta_title`,
`meta_description`, and `gallery_alts` keyed by file UUID. Optional:
`quote` (with `attribution` and source), `faq` array of `{question, answer}`,
and `wine_links` array of `{name, href, travel_time, method}`. Empty optional
blocks are omitted. Content may use structured paragraphs; the renderer must
escape plain text and sanitize any authored rich text. No fabricated quotes,
stay experiences, prices, distances or route stops.

Publishing validation is strict: both locales complete, every image UUID
readable, license and credit recorded, source URL to the property present,
permission and independent review references present, actual property booking
URL from CMS valid through the existing resolver, and streek relation/slug
valid. Reject generic Booking search links as selected-property destinations.
Image permission alone does not imply editorial recommendation. Disclosure
must describe invitation or paid stay only when supported by evidence.

## Rendering and links

Use SiteLayout header/footer and the approved visual sequence: introduction,
first booking reason, large hero, anchor navigation, editorial assessment,
rooms, wine context, credited gallery, practical details, FAQ, booking block,
source/disclosure. Preserve responsive behavior, accessible zoom/gallery and
FAQ. Internal links use locale-aware helpers. The roundup card's title/photo
links to the portrait only when the portrait gate passes; its booking CTA stays
separate. Portrait breadcrumbs link to the correct streek roundup and streek
guide. Wine house/route links only when editorially verified. Use the existing
accommodation booking resolver and click tracking with per-property SID; keep
the current Stay22/CJ policy and disclosure.

First content records are accommodations 84 and 88, written/reviewed in the
existing content task. Do not publish Altes Winzerhaus before its image-chain
task is complete. The generic `articles` 185 template stays draft.

## Verification before `portret_live`

Read back both Directus records and rights metadata, then verify production
NL/EN HTML, build-info commit, real images/credits, per-property booking link
and tracking/disclosure, card → portrait → streek links, locale and hreflang,
desktop/mobile, and independent Lead Editor/Design Lead/DevOps review.
