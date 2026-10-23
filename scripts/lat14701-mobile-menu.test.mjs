// LAT-14701 — regressie: mobiel menu sluit op Escape met focus terug, knopnaam per
// stand uit ui_strings (NL/EN), en TourCards gebruikt alleen bestaande thematokens.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const header = readFileSync('src/components/SiteHeader.astro', 'utf8');
const tours = readFileSync('src/components/TourCards.astro', 'utf8');
const ui = readFileSync('src/lib/ui-strings.ts', 'utf8');

assert.match(header, /data-aria-close=\{ui\.t\('header\.mobile\.menuCloseAria'\)\}/, 'sluitnaam uit ui_strings');
assert.match(header, /e\.key === 'Escape' && mobileMenuOpen\(\)/, 'Escape-handler voor mobiel menu');
assert.match(header, /setMobileMenu\(false, true\)/, 'focus terug naar de knop');
assert.match(header, /mobileMenu\?\.addEventListener\('focusout'/, 'menu sluit als focus eruit gaat');
assert.equal((ui.match(/'header\.mobile\.menuCloseAria'/g) ?? []).length, 2, 'NL + EN sluitnaam');
assert.equal((ui.match(/'header\.mobile\.menuAria'/g) ?? []).length, 2, 'NL + EN opennaam');
assert.doesNotMatch(tours, /--ink-soft|var\(--border/, 'TourCards: geen niet-bestaande tokens');
console.log('lat14701 mobile-menu + tourcards: ok');
