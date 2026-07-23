import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vinomartino.com',
  server: { host: '0.0.0.0', port: 4321 },
  trailingSlash: 'always',
  // LAT-2575: NL blijft primair en prefixloos; EN leeft onder /en/.
  // Inert zolang er nog geen /en/-pagina's worden gegenereerd (no-translation-guard).
  i18n: {
    defaultLocale: 'nl',
    locales: ['nl', 'en'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },
  redirects: {
    // LAT-2056: Marijn-slug is nu `marijn` (strikte regel: geen `martin`).
    '/auteurs/martin/': '/auteurs/marijn/',
  },
  integrations: [
    sitemap({
      changefreq: 'weekly',
      lastmod: new Date(),
      // LAT-2575: hreflang-alternates in de sitemap zodra /en/-pagina's bestaan.
      i18n: {
        defaultLocale: 'nl',
        locales: { nl: 'nl-NL', en: 'en-US' },
      },
      filter: (page) =>
        !page.includes('/go/') &&
        !page.includes('/admin/') &&
        !page.includes('/intern/') &&
        !page.includes('/api/') &&
        // LAT-1676: interne noindex component-preview hoort niet in de sitemap.
        !page.includes('/preview/') &&
        // LAT-2771: /infographics/* is een interne component-preview voor redactie
        // en QA (InfographicsPreview.astro, LAT-2693) en staat al op
        // `noindex, nofollow`. Die pagina's horen dus ook niet in de sitemap —
        // NL noch EN. Besluit T9-gate: niet vertalen, wel uit de sitemap.
        !page.includes('/infographics/') &&
        // LAT-859: /routes/* non-canonical; canonical is /wijnroutes/*
        !page.includes('/routes/') &&
        // LAT-859: douro/mosel have canonical Directus entries at douro-portugal/mosel-duitsland
        page !== 'https://vinomartino.com/streken/douro/' &&
        page !== 'https://vinomartino.com/streken/mosel/' &&
        // LAT-1853/LAT-2457: keyword-cannibalisatie 301's; canonical is de doel-slug.
        page !== 'https://vinomartino.com/artikelen/een-week-in-piemonte-barolo-barbaresco-en-alles-daartussenin/' &&
        page !== 'https://vinomartino.com/artikelen/langhe-vier-dagen-route/',
      serialize(item) {
        // Homepage
        if (item.url === 'https://vinomartino.com/') {
          return { ...item, priority: 1.0, changefreq: 'daily' };
        }
        // New content-type index pages get high priority
        // LAT-2826: /reizen-nareizen/ heeft sinds deze ticket een echte
        // listingpagina (voorheen 403 op een directory zonder index, LAT-2707).
        if (
          item.url.match(/\/(wijnhuizen|wijnroutes|streken|landen|reizen-nareizen)\/$/)
        ) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        // Landen detail pages rank highest after homepage (country = topical hub)
        if (item.url.match(/\/landen\/[^/]+\/$/)) {
          return { ...item, priority: 0.85, changefreq: 'monthly' };
        }
        // Other new content-type detail pages
        if (
          item.url.match(/\/(wijnhuizen|wijnroutes|streken|reizen-nareizen)\/[^/]+\/$/)
        ) {
          return { ...item, priority: 0.8, changefreq: 'monthly' };
        }
        // Article listing
        if (item.url === 'https://vinomartino.com/artikelen/') {
          return { ...item, priority: 0.85, changefreq: 'weekly' };
        }
        // Article detail pages
        if (item.url.includes('/artikelen/')) {
          return { ...item, priority: 0.7, changefreq: 'monthly' };
        }
        // Auteurs index + detail pages (E-E-A-T signal)
        if (item.url === 'https://vinomartino.com/auteurs/') {
          return { ...item, priority: 0.6, changefreq: 'monthly' };
        }
        if (item.url.match(/\/auteurs\/[^/]+\/$/)) {
          return { ...item, priority: 0.55, changefreq: 'monthly' };
        }
        // Static pages (over-ons, privacy, etc.)
        return { ...item, priority: 0.4, changefreq: 'yearly' };
      },
    }),
  ],
});
