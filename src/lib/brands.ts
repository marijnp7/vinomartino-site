export interface Brand {
  slug: string;
  name: string;
  tagline: string;
  status: 'draft' | 'live' | 'archived';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  fontHeading: string;
  fontBody: string;
  logoPrimary?: string;
  logoMonochrome?: string;
  favicon?: string;
  ogDefaultImage?: string;
  socialInstagram?: string;
  socialPinterest?: string;
  socialYoutube?: string;
  socialTiktok?: string;
  contentPillars: string[];
  locales: string[];
  defaultLocale: string;
}

export const brands: Brand[] = [
  {
    slug: 'vinomartino',
    name: 'VinoMartino',
    tagline: 'Wijnreizen met karakter',
    status: 'live',
    primaryColor: '#5E1A1D',
    secondaryColor: '#E8DCC4',
    accentColor: '#6E7F5E',
    textColor: '#2A2622',
    fontHeading: '"Cormorant Garamond", "EB Garamond", "Georgia", serif',
    fontBody: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    socialInstagram: 'vinomartino',
    socialPinterest: 'vinomartino',
    contentPillars: [
      'Wijnregio-gidsen',
      'Wijnhuis-portretten',
      'Route & itineraire',
      'Druif & terroir',
      'Proeverij-ervaringen',
      'Culinaire combinaties',
      'Seizoenskalender',
      'Praktische reistips',
    ],
    locales: ['nl'],
    defaultLocale: 'nl',
  },
];
