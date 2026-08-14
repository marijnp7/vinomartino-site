// LAT-2452: nieuwsbriefformulieren posten via fetch() i.p.v. een native
// target="_blank"-submit (die opende een tab met rauwe MailerLite-JSON en voelde
// kapot). Eén gedelegeerde submit-handler dekt elk [data-newsletter-signup]-form,
// toont inline succes/fout en vuurt het Plausible-event newsletter_signup.
import { trackPlausible } from './plausible';

const SUCCESS_MESSAGE = 'Check je inbox — de Langhe-reisplanner komt eraan.';
const ERROR_MESSAGE =
  'Aanmelden lukte even niet. Probeer het zo nog eens, of mail ons op hallo@vinomartino.travel.';

const REGION_FIELD = 'fields[region_preference]';

// LAT-3209 — per-form overrides. Landingspagina's halen hun copy uit Directus
// (collectie `landing_pages`) en geven de teksten als data-attribuut mee; de
// bovenstaande constanten blijven de default voor de bestaande formulieren,
// die hun eigen lead magnet noemen.
function successMessage(form: HTMLFormElement): string {
  return form.dataset.newsletterSuccess?.trim() || SUCCESS_MESSAGE;
}

function errorMessage(form: HTMLFormElement): string {
  return form.dataset.newsletterError?.trim() || ERROR_MESSAGE;
}

function regionValue(form: HTMLFormElement): string {
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${REGION_FIELD}"]`,
  );
  const value = field?.value.trim();
  return value ? value : 'unknown';
}

function clearMessages(form: HTMLFormElement): void {
  form.parentElement
    ?.querySelectorAll('.newsletter-signup__error, .newsletter-signup__success')
    .forEach((el) => el.remove());
}

function showSuccess(form: HTMLFormElement): void {
  clearMessages(form);
  form.hidden = true;
  const msg = document.createElement('p');
  msg.className = 'newsletter-signup__success';
  msg.setAttribute('role', 'status');
  msg.textContent = successMessage(form);
  form.insertAdjacentElement('afterend', msg);
}

function showError(form: HTMLFormElement): void {
  clearMessages(form);
  const msg = document.createElement('p');
  msg.className = 'newsletter-signup__error';
  msg.setAttribute('role', 'alert');
  msg.textContent = errorMessage(form);
  form.insertAdjacentElement('afterend', msg);
}

async function handleSubmit(form: HTMLFormElement): Promise<void> {
  if (form.dataset.submitting === 'true') return;
  form.dataset.submitting = 'true';

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  const originalLabel = button?.textContent ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Even geduld…';
  }
  clearMessages(form);

  const action = form.getAttribute('action') || form.action;
  const data = new FormData(form);
  // MailerLite verwerpt een lege region_preference; laat het veld weg als de
  // lezer geen regio koos (het veld is optioneel).
  //
  // LAT-3209 — uitzondering: op een form met een `required` regio-select mag die
  // bypass NIET gelden. Zou hij dat wel doen, dan zou een leeg veld alsnog een
  // geldige inschrijving zonder regio opleveren en de regio-routing-automations
  // nooit triggeren. De browser blokkeert leeg submitten al via `required`; dit
  // is de tweede sluiting, voor het geval het attribuut ooit wegvalt.
  const regionSelect = form.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${REGION_FIELD}"]`,
  );
  const regionRequired = Boolean(regionSelect?.required);
  const region = (data.get(REGION_FIELD) as string | null)?.trim();
  if (!region && !regionRequired) data.delete(REGION_FIELD);

  try {
    const res = await fetch(action, { method: 'POST', body: data });
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (res.ok && json?.success) {
      // LAT-2772 — de `data-plausible-cta` op de submit-knop was inert: die wordt
      // alleen door de klik-delegatie in plausible.ts gelezen, en die matcht
      // uitsluitend `a[href]`. Alle vier de formulieren (home, /de-brief/,
      // langhe-PDF, seizoenskalender) vuurden daardoor één ononderscheidbare
      // `newsletter_signup`. Geef het label mee als prop, zodat de bron in de
      // Plausible-breakdown zichtbaar is naast alleen `path`.
      trackPlausible('newsletter_signup', {
        region_preference: regionValue(form),
        cta_type: button?.dataset.plausibleCta || 'unknown',
        path: window.location.pathname,
      });
      showSuccess(form);
      return;
    }
    throw new Error('mailerlite-rejected');
  } catch {
    if (button) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
    showError(form);
  } finally {
    form.dataset.submitting = 'false';
  }
}

export function initNewsletterForms(): void {
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form || !form.matches('[data-newsletter-signup]')) return;
      event.preventDefault();
      void handleSubmit(form);
    },
    { capture: true },
  );
}
