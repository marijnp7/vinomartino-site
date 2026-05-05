// Affiliate link generator with UTM tracking
// Format: vinomartino.com → partner affiliate site with utm params

interface AffiliateUrlParams {
  partner: 'booking.com' | 'getyourguide' | 'skyscanner' | 'reisverzekering';
  region: string;
  placement: 'sidebar' | 'inline-mid' | 'inline-end' | 'footer';
  contentType: 'streken' | 'wijnhuizen' | 'routes' | 'landen';
  category?: string;
}

/**
 * Generate affiliate partner URLs with UTM tracking
 * Structure: https://partner.com/?utm_source=vinomartino&utm_medium=affiliate&utm_campaign={content_type}-{region}&utm_content={placement}&aff_id={code}
 */
export function generateAffiliateUrl(params: AffiliateUrlParams): string {
  const { partner, region, placement, contentType, category } = params;

  const utm = {
    source: 'vinomartino',
    medium: 'affiliate',
    campaign: `${contentType}-${region.toLowerCase().replace(/\s+/g, '-')}`,
    content: placement,
  };

  // Partner-specific base URLs and affiliate codes (read from env vars at build time)
  const partnerConfig: Record<string, { baseUrl: string; affId: string }> = {
    'booking.com': {
      baseUrl: 'https://booking.com/s',
      affId: process.env['BOOKING_AID'] || '',
    },
    'getyourguide': {
      baseUrl: 'https://partner.getyourguide.com',
      affId: process.env['GETYOURGUIDE_PARTNER'] || '',
    },
    'skyscanner': {
      baseUrl: 'https://skyscanner.com',
      affId: process.env['SKYSCANNER_PARTNER'] || '',
    },
    'reisverzekering': {
      baseUrl: 'https://reisverzekering.example.com',
      affId: process.env['REISVERZEKERING_PARTNER'] || '',
    },
  };

  const config = partnerConfig[partner];
  if (!config) throw new Error(`Unknown affiliate partner: ${partner}`);

  // Build query string
  const params_str = new URLSearchParams({
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    utm_content: utm.content,
    aff_id: config.affId,
    ...(category && { category }),
  }).toString();

  // For Booking.com: add region as search destination
  if (partner === 'booking.com') {
    const searchQuery = new URLSearchParams({ s: region }).toString();
    return `${config.baseUrl}/?${searchQuery}&${params_str}`;
  }

  // Default: append params to base URL
  return `${config.baseUrl}?${params_str}`;
}

/**
 * Generate affiliate URLs for each content type with region context
 */
export function getAffiliateLinks(contentType: 'streken' | 'wijnhuizen' | 'routes' | 'landen', region: string) {
  return {
    accommodation: generateAffiliateUrl({
      partner: 'booking.com',
      region,
      placement: 'sidebar',
      contentType,
    }),
    activity: generateAffiliateUrl({
      partner: 'getyourguide',
      region,
      placement: 'inline-mid',
      contentType,
    }),
    flight: generateAffiliateUrl({
      partner: 'skyscanner',
      region,
      placement: 'footer',
      contentType,
    }),
    insurance: generateAffiliateUrl({
      partner: 'reisverzekering',
      region,
      placement: 'footer',
      contentType,
    }),
  };
}
