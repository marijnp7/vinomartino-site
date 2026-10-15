import type { WineGeography } from './wine-geography';

// LAT-12594 (K2, documentbytes streek): the country locator (~42 KB of paths) is served as a
// cacheable standalone SVG instead of inline in every streek document. Page CSS does not reach
// into an <img>, so the presentation from WineAreaPreview.astro is inlined as attributes here.
export const locatorSvgUrl = (slug: string) => `/geo/locator/${slug}.svg`;
export const areaJsonUrl = (slug: string) => `/geo/area/${slug}.json`;

export function wineAreaLocatorSvg(g: WineGeography): string {
  const { viewBox, paths, d, anchor } = g.overview;
  const r = Math.max(...viewBox.split(' ').map(Number).slice(2)) * .012;
  const ctx = paths.map((p) => `<path d="${p}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`
    + `<g fill="#8A7E70" fill-opacity=".08" stroke="#8A7E70" stroke-opacity=".35" stroke-width=".6">${ctx}</g>`
    + `<path d="${d}" fill="#5A1A1F" fill-opacity=".26" stroke="#5A1A1F" stroke-width="1.2" fill-rule="evenodd" vector-effect="non-scaling-stroke"/>`
    + `<circle cx="${anchor.x}" cy="${anchor.y}" r="${r}" fill="#5A1A1F" stroke="#F0E6D0" stroke-width="2"/>`
    + `</svg>`;
}
