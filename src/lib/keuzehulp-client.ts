// LAT-13771 — client-side keuzehulp voor /accommodaties/ en /accommodaties/<streek>/.
// Zelfde aanpak als de wijnhuizen-keuzehulp (LAT-13075, WijnhuizenIndex.astro): de kaarten
// staan statisch in de HTML, dit script verbergt/toont ze. Status leeft in het URL-fragment
// (#q=…&land=…): deelbaar, niet indexeerbaar, via replaceState zodat "terug" intact blijft.
//
// Contract in de markup:
//   [data-kh-root]  data-i18n='{"een":"1 …","alle":"{n} …","van":"{n} van {totaal} …","verwijder":"…"}'
//                   data-totaal="N"  data-track="<prefix voor cta_id>"
//   [data-kh-form]  met optioneel input[data-kh-zoek] en select[data-kh-select][name=<veld>]
//   [data-kh-card]  data-zoek="<gevouwen zoektekst>"  data-<veld>="<waarde> [<waarde> …]"
//   [data-kh-telling] [data-kh-chips] [data-kh-wis] [data-kh-leeg] [data-wh-wis-leeg]
//   optioneel [data-kh-meer-n]: telling van actieve selects binnen de omliggende <details>.
//
// LAT-13773 — select[data-kh-lijst]: meerwaardige kaarten (artikel met twee streken).
// data-<veld> is dan een lijst slugs met spaties; een kaart past als één ervan past (OR
// binnen het veld), en een optiewaarde `<veld>:<slug>` (Bestemming: `land:frankrijk`,
// `streek:bourgogne`) toetst data-<veld> in plaats van de select-naam. Zonder het attribuut
// blijft het exacte vergelijking (accommodaties: plaatsnamen met spaties). Optietekst =
// data-base, anders data-label.
import { trackEvent } from './site-events';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/ß/g, 'ss').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function initKeuzehulp(root: HTMLElement): void {
  const t = JSON.parse(root.dataset.i18n || '{}') as Record<string, string>;
  const totaal = Number(root.dataset.totaal || 0);
  const track = root.dataset.track || 'keuzehulp';
  const form = root.querySelector<HTMLFormElement>('[data-kh-form]');
  if (!form) return;
  const zoek = form.querySelector<HTMLInputElement>('[data-kh-zoek]');
  const selects = [...form.querySelectorAll<HTMLSelectElement>('[data-kh-select]')];
  const telling = form.querySelector<HTMLElement>('[data-kh-telling]')!;
  const chips = form.querySelector<HTMLElement>('[data-kh-chips]')!;
  const wis = form.querySelector<HTMLButtonElement>('[data-kh-wis]')!;
  const leeg = root.querySelector<HTMLElement>('[data-kh-leeg]');
  const cards = [...root.querySelectorAll<HTMLElement>('[data-kh-card]')];
  const meerN = [...form.querySelectorAll<HTMLElement>('[data-kh-meer-n]')];
  // LAT-14550 — segmented control: knoppen [data-kh-seg=<select-naam>][data-value] sturen een
  // verborgen select[data-kh-select] aan, zodat filterlogica, chips en URL-fragment gelijk blijven.
  const segs = [...form.querySelectorAll<HTMLButtonElement>('button[data-kh-seg]')];
  // "Meer filters" is alleen op mobiel inklapbaar; op desktop is de summary verborgen
  // (keuzehulp.css), dus de <details> moet daar open staan, anders verdwijnt het veld.
  const meer = [...form.querySelectorAll<HTMLDetailsElement>('details')];
  const desktop = window.matchMedia('(min-width: 721px)');
  const syncMeer = () => { if (desktop.matches) meer.forEach((d) => { d.open = true; }); };
  syncMeer();
  desktop.addEventListener('change', syncMeer);

  const hasOption = (sel: HTMLSelectElement, v: string) => [...sel.options].some((o) => o.value === v);
  const optLabel = (sel: HTMLSelectElement) => sel.selectedOptions[0]?.dataset.label || '';

  const past = (c: HTMLElement, sel: HTMLSelectElement, v: string) => {
    if (!('khLijst' in sel.dataset)) return c.dataset[sel.name] === v;
    const i = v.indexOf(':');
    const [k, w] = i > 0 ? [v.slice(0, i), v.slice(i + 1)] : [sel.name, v];
    return (c.dataset[k] || '').split(' ').includes(w);
  };
  const matches = (c: HTMLElement, q: string[], skip?: HTMLSelectElement, alt?: string) => {
    for (const sel of selects) {
      const v = sel === skip ? (alt ?? '') : sel.value;
      if (v && !past(c, sel, v)) return false;
    }
    const hay = c.dataset.zoek || '';
    return q.every((w) => hay.includes(w));
  };

  const chip = (label: string, onRemove: () => void) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    const x = document.createElement('span');
    x.className = 'wh-chip-x';
    x.setAttribute('aria-hidden', 'true');
    x.textContent = '×';
    btn.append(x);
    btn.setAttribute('aria-label', `${t.verwijder}: ${label}`);
    btn.addEventListener('click', () => { onRemove(); apply(true); (zoek ?? selects[0])?.focus(); });
    li.append(btn);
    return li;
  };

  function apply(push = false) {
    const raw = zoek ? zoek.value.trim() : '';
    const q = fold(raw).split(' ').filter(Boolean);
    let n = 0;
    for (const c of cards) { const ok = matches(c, q); c.hidden = !ok; if (ok) n++; }
    // Aantallen per optie, gegeven de overige filters.
    for (const sel of selects) {
      for (const o of sel.options) {
        if (!o.value) continue;
        const k = cards.filter((c) => matches(c, q, sel, o.value)).length;
        o.textContent = `${o.dataset.base ?? o.dataset.label} (${k})`;
        o.dataset.n = String(k);
      }
    }
    for (const b of segs) {
      const sel = selects.find((s) => s.name === b.dataset.khSeg);
      if (!sel) continue;
      const v = b.dataset.value || '';
      b.setAttribute('aria-pressed', String(sel.value === v));
      const nEl = b.querySelector<HTMLElement>('[data-kh-seg-n]');
      const opt = [...sel.options].find((o) => o.value === v);
      if (nEl && v && opt?.dataset.n != null) nEl.textContent = `(${opt.dataset.n})`;
    }
    const actief = (q.length ? 1 : 0) + selects.filter((s) => s.value).length;
    telling.textContent = actief === 0
      ? (totaal === 1 && t.een ? t.een : (t.alle || '').replace('{n}', String(totaal)))
      : (t.van || '').replace('{n}', String(n)).replace('{totaal}', String(totaal));
    chips.replaceChildren(
      ...(raw && zoek ? [chip(`“${raw}”`, () => { zoek.value = ''; })] : []),
      ...selects.filter((s) => s.value).map((s) => chip(optLabel(s), () => { s.value = ''; })),
    );
    wis.hidden = actief === 0;
    for (const n of meerN) {
      const k = selects.filter((s) => s.value && n.closest('details')?.contains(s)).length;
      n.textContent = String(k);
      n.hidden = k === 0;
    }
    if (leeg) leeg.hidden = n > 0;
    const params = new URLSearchParams();
    if (raw) params.set('q', raw);
    for (const s of selects) if (s.value) params.set(s.name, s.value);
    const hash = params.toString();
    if (push || hash !== location.hash.slice(1)) {
      history.replaceState(history.state, '', hash ? `#${hash}` : location.pathname + location.search);
    }
  }

  const readHash = () => {
    const p = new URLSearchParams(location.hash.slice(1));
    if (zoek) zoek.value = p.get('q') || '';
    for (const s of selects) {
      const v = p.get(s.name) || '';
      s.value = hasOption(s, v) ? v : '';
    }
  };

  readHash();
  apply();

  let zoekTimer: number | undefined;
  zoek?.addEventListener('input', () => {
    apply();
    window.clearTimeout(zoekTimer);
    zoekTimer = window.setTimeout(() => { if (zoek.value.trim()) trackEvent('cta_click', { cta_id: `${track}_zoek` }); }, 1500);
  });
  for (const s of selects) {
    s.addEventListener('change', () => { apply(); if (s.value) trackEvent('cta_click', { cta_id: `${track}_${s.name}:${s.value}` }); });
  }
  for (const b of segs) {
    b.addEventListener('click', () => {
      const sel = selects.find((s) => s.name === b.dataset.khSeg);
      if (!sel) return;
      sel.value = b.dataset.value || '';
      sel.dispatchEvent(new Event('change'));
    });
  }
  form.addEventListener('submit', (ev) => { ev.preventDefault(); zoek?.blur(); });
  const wisAlles = () => {
    if (zoek) zoek.value = '';
    for (const s of selects) s.value = '';
    apply(true);
    (zoek ?? selects[0])?.focus();
  };
  wis.addEventListener('click', wisAlles);
  leeg?.querySelector('[data-wh-wis-leeg]')?.addEventListener('click', wisAlles);
  window.addEventListener('hashchange', () => { readHash(); apply(); });
}

export function initAlleKeuzehulpen(): void {
  for (const root of document.querySelectorAll<HTMLElement>('[data-kh-root]')) initKeuzehulp(root);
}
