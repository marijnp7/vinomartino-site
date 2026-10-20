import { buildCjBookingLink, isDirectBoeklink, unwrapCjRedirect } from './affiliates';
import { readDirectusEnv, assertDirectusConfigured, fetchDirectusCollection } from './directus-config';
import { downloadAsset } from './accommodaties-loader';
import type { Locale } from './i18n';

export interface PortraitCopy {
  title: string; intro: string; booking_reason: string; why: string;
  considerations: string; rooms: string; wine: string; practical: string;
  booking_cta: string; hero_alt: string; hero_credit: string; disclosure: string;
  meta_title: string; meta_description: string; gallery_alts: Record<string, string>;
  quote?: { text: string; attribution: string; source: string };
  faq?: { question: string; answer: string }[];
  wine_links?: { name: string; href: string; travel_time: string; method: string }[];
}
export interface PortraitImage { file_id: string; credit: string; source_url: string; src?: string }
export interface Portrait {
  id: number; slug: string; streekSlug: string; name: string; siteUrl: string;
  bookingUrl: string; bookingHref: Record<Locale, string>; hero: PortraitImage;
  gallery: PortraitImage[]; copy: Record<Locale, PortraitCopy>;
}
const required = ['title','intro','booking_reason','why','considerations','rooms','wine','practical','booking_cta','hero_alt','hero_credit','disclosure','meta_title','meta_description'] as const;
const str = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const object = (v: unknown): Record<string, any> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
const http = (v: unknown): boolean => { try { const u = new URL(str(v)); return ['http:','https:'].includes(u.protocol); } catch { return false; } };
const uuid = (v: unknown): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str(v));
function propertyBooking(url: string): boolean {
  if (!http(url)) return false;
  const direct = unwrapCjRedirect(url);
  if (isDirectBoeklink(direct)) return http(direct);
  try { const u = new URL(direct); return /(^|\.)booking\.com$/i.test(u.hostname) && /^\/hotel\/[^/]+\//.test(u.pathname); } catch { return false; }
}
function validCopy(value: unknown, gallery: PortraitImage[]): value is PortraitCopy {
  const c = object(value);
  if (!c || required.some((key) => !str(c[key]))) return false;
  const alts = object(c.gallery_alts);
  if (!alts || gallery.some((img) => !str(alts[img.file_id]))) return false;
  if (c.quote && (!str(c.quote.text) || !str(c.quote.attribution) || !str(c.quote.source))) return false;
  if (c.faq && (!Array.isArray(c.faq) || c.faq.some((x: any) => !str(x.question) || !str(x.answer)))) return false;
  if (c.wine_links && (!Array.isArray(c.wine_links) || c.wine_links.some((x: any) => !str(x.name) || !str(x.href) || !str(x.travel_time) || !str(x.method)))) return false;
  return true;
}
export function validatePortrait(row: Record<string, any>, en: unknown): Portrait | null {
  const gallery = row.portrait_gallery;
  const streek = object(row.streek_id);
  const siteUrl = str(row.website);
  if (row.status !== 'published' || row.portrait_status !== 'published' || !str(row.slug) || !str(row.name) || !str(streek?.slug) || !uuid(row.hero_image) || !str(row.portrait_permission_ref) || !str(row.portrait_review_ref) || !http(siteUrl) || !propertyBooking(str(row.booking_url))) return null;
  if (!Array.isArray(gallery) || gallery.length < 3 || gallery.some((x) => !uuid(x?.file_id) || !str(x?.credit) || !http(x?.source_url))) return null;
  if (!validCopy(row.portrait_content, gallery) || !validCopy(en, gallery)) return null;
  const bookingUrl = str(row.booking_url);
  const sid = `accommodation-${row.slug}`;
  const bookingHref = isDirectBoeklink(bookingUrl) ? { nl: bookingUrl, en: bookingUrl } : { nl: buildCjBookingLink(bookingUrl, sid, 'nl'), en: buildCjBookingLink(bookingUrl, sid, 'en') };
  return { id: Number(row.id), slug: str(row.slug), streekSlug: str(streek!.slug), name: str(row.name), siteUrl, bookingUrl, bookingHref, hero: { file_id: row.hero_image, credit: row.portrait_content.hero_credit, source_url: siteUrl }, gallery, copy: { nl: row.portrait_content, en: en as PortraitCopy } };
}
let cache: Promise<Portrait[]> | undefined;
export function loadAccommodationPortraits(): Promise<Portrait[]> {
  if (cache) return cache;
  cache = (async () => {
    const env = readDirectusEnv(); assertDirectusConfigured('accommodationPortraits', env);
    const headers = { Authorization: `Bearer ${env.token}` };
    const fields = 'id,status,slug,name,booking_url,hero_image,website,streek_id.slug,portrait_status,portrait_content,portrait_gallery,portrait_permission_ref,portrait_review_ref';
    const parent = await fetchDirectusCollection('accommodationPortraits', `${env.url}/items/accommodations?limit=-1&fields=${fields}&filter[portrait_status][_eq]=published`, { headers });
    // The page routes may be deployed before the approved schema migration.
    // An absent field yields no portraits; any other Directus error fails loud.
    if (parent.status === 400) {
      const message = await parent.text();
      if (/portrait_status|portrait_content|portrait_gallery|portrait_permission_ref|portrait_review_ref/i.test(message)) {
        console.warn('[accommodation portraits] schema migration pending; no detail pages');
        return [];
      }
      throw new Error(`accommodation portraits: Directus 400: ${message.slice(0,200)}`);
    }
    if (!parent.ok) throw new Error(`accommodation portraits: Directus ${parent.status}: ${(await parent.text()).slice(0,200)}`);
    const rows = ((await parent.json()).data || []) as Record<string, any>[];
    if (!rows.length) return [];
    const trans = await fetchDirectusCollection('accommodationPortraits:en', `${env.url}/items/accommodations_translations?limit=-1&filter[languages_code][_eq]=en&fields=accommodations_id,portrait_content`, { headers });
    if (!trans.ok) throw new Error(`accommodation portraits EN: Directus ${trans.status}`);
    const english = new Map(((await trans.json()).data || []).map((r: any) => [String(r.accommodations_id), r.portrait_content]));
    const valid = rows.map((r) => validatePortrait(r, english.get(String(r.id)))).filter((x): x is Portrait => !!x);
    await Promise.all(valid.flatMap((p) => [p.hero, ...p.gallery].map(async (img) => { img.src = await downloadAsset(img.file_id, env.url, env.token) || undefined; })));
    return valid.filter((p) => p.hero.src && p.gallery.every((img) => img.src));
  })().catch((e) => { cache = undefined; throw e; });
  return cache;
}
