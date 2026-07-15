import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vinomartino.com',
  server: { host: '0.0.0.0', port: 4321 },
  trailingSlash: 'always',
  redirects: {
    // LAT-2056: Marijn-slug is nu `marijn` (strikte regel: geen `martin`).
    '/auteurs/martin/': '/auteurs/marijn/',
  },
  integrations: [
    sitemap({
      changefreq: 'weekly',
      lastmod: new Date(),
      filter: (page) =>
        !page.includes('/go/') &&
        !page.includes('/admin/') &&
        !page.includes('/intern/') &&
        !page.includes('/api/') &&
        // LAT-1676: interne noindex component-preview hoort niet in de sitemap.
        !page.includes('/preview/') &&
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
        if (
          item.url.match(/\/(wijnhuizen|wijnroutes|streken|landen)\/$/)
        ) {
          return { ...item, priority: 0.9, changefreq: 'weekly' };
        }
        // Landen detail pages rank highest after homepage (country = topical hub)
        if (item.url.match(/\/landen\/[^/]+\/$/)) {
          return { ...item, priority: 0.85, changefreq: 'monthly' };
        }
        // Other new content-type detail pages
        if (
          item.url.match(/\/(wijnhuizen|wijnroutes|streken)\/[^/]+\/$/)
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
