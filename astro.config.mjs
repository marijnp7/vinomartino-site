import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vinomartino.com',
  server: { host: '0.0.0.0', port: 4321 },
  trailingSlash: 'always',
  integrations: [
    sitemap({
      changefreq: 'weekly',
      lastmod: new Date(),
      filter: (page) =>
        !page.includes('/go/') &&
        !page.includes('/admin/') &&
        !page.includes('/api/') &&
        // LAT-859: /routes/* non-canonical; canonical is /wijnroutes/*
        !page.includes('/routes/') &&
        // LAT-859: douro/mosel have canonical Directus entries at douro-portugal/mosel-duitsland
        page !== 'https://vinomartino.com/streken/douro/' &&
        page !== 'https://vinomartino.com/streken/mosel/',
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
        // Static pages (over-ons, privacy, etc.)
        return { ...item, priority: 0.4, changefreq: 'yearly' };
      },
    }),
  ],
});
