import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://vinomartino.com',
  server: { host: '0.0.0.0', port: 4321 },
  trailingSlash: 'always',
  integrations: [
    sitemap({
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
      filter: (page) =>
        !page.includes('/go/') &&
        !page.includes('/admin/') &&
        !page.includes('/api/'),
    }),
  ],
});
