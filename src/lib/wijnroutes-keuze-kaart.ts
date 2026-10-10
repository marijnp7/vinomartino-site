// LAT-13075 — kaart van de keuzehulp op /wijnroutes/ (client-only, lazy geïmporteerd).
// Eén pin per route op het eerste waypoint plus de routelijn, uitsluitend uit de
// bestaande routes.stopsGeo (zie kaartLijn). Gekozen route bordeaux, de rest neutraal;
// gefilterde routes verdwijnen. Geen legenda: de lijst ernaast ís de legenda.
import 'leaflet/dist/leaflet.css';
import { addBaseLayer } from './map-base';

type KaartRoute = { slug: string; href: string; titel: string; meta: string; line: [number, number][] };
type KaartData = { routes: KaartRoute[]; cta: string };

const BORDEAUX = '#5A1A1F';
const NEUTRAAL = '#8C8279';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export async function mountKeuzeKaart(panel: HTMLElement, onPick: (slug: string) => void) {
  const canvas = panel.querySelector<HTMLElement>('[data-wk-canvas]')!;
  const data = JSON.parse(panel.querySelector('[data-wk-data]')?.textContent || '{}') as KaartData;
  // @ts-ignore leaflet heeft hier geen type-declaraties (zelfde als HomeRoutesMap)
  const L: any = await import('leaflet').then((m: any) => m.default ?? m);
  const map = L.map(canvas, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
  await addBaseLayer(map);

  const items = new Map<string, { r: KaartRoute; poly: any; pin: any }>();
  const pinIcon = (on: boolean) => L.divIcon({
    className: '',
    html: `<span class="wk-pin${on ? ' is-on' : ''}"></span>`,
    iconSize: on ? [18, 18] : [12, 12],
    iconAnchor: on ? [9, 9] : [6, 6],
  });
  for (const r of data.routes || []) {
    const poly = L.polyline(r.line, { color: NEUTRAAL, weight: 2.5, opacity: 0.7, lineCap: 'round', lineJoin: 'round' });
    const pin = L.marker(r.line[0], { icon: pinIcon(false), title: r.titel, keyboard: true, riseOnHover: true });
    const popup = `<div class="wk-pop"><strong>${esc(r.titel)}</strong>${r.meta ? `<span>${esc(r.meta)}</span>` : ''}<a href="${esc(r.href)}">${esc(data.cta)} &rarr;</a></div>`;
    pin.bindPopup(popup, { autoPanPadding: [24, 24] });
    poly.bindPopup(popup);
    pin.on('click', () => onPick(r.slug));
    poly.on('click', () => onPick(r.slug));
    items.set(r.slug, { r, poly, pin });
  }

  let visible = new Set(items.keys());
  let selected: string | null = null;

  const fit = () => {
    const pts = [...visible].flatMap((s) => items.get(s)?.r.line ?? []);
    if (pts.length === 0) return;
    // Kader op de dominante cluster; continent-uitschieters (Kaap) blijven geplot
    // maar trekken het beeld niet naar wereld-zoom (zelfde regel als HomeRoutesMap).
    const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const mLat = med(pts.map((p) => p[0])), mLng = med(pts.map((p) => p[1]));
    const core = pts.filter((p) => Math.abs(p[0] - mLat) <= 16 && Math.abs(p[1] - mLng) <= 24);
    map.fitBounds(core.length >= 2 ? core : pts, { padding: [32, 32], maxZoom: 8 });
  };

  const render = () => {
    for (const [slug, it] of items) {
      const show = visible.has(slug);
      const on = slug === selected;
      if (show) { it.poly.addTo(map); it.pin.addTo(map); } else { it.poly.remove(); it.pin.remove(); }
      it.poly.setStyle({ color: on ? BORDEAUX : NEUTRAAL, weight: on ? 4 : 2.5, opacity: on ? 0.95 : 0.6 });
      it.pin.setIcon(pinIcon(on));
      it.pin.setZIndexOffset(on ? 1000 : 0);
      if (on) it.poly.bringToFront();
    }
  };

  render();
  fit();
  return {
    setVisible(slugs: Set<string>) {
      const changed = slugs.size !== visible.size || [...slugs].some((s) => !visible.has(s));
      visible = new Set([...slugs].filter((s) => items.has(s)));
      render();
      if (changed) fit();
    },
    select(slug: string | null) { selected = slug && items.has(slug) ? slug : null; render(); },
    resize() { map.invalidateSize(); fit(); },
  };
}
