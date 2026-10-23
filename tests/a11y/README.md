# Schermlezertest L2 (LAT-14237 / LAT-14720)

`vsr-steps.mjs` draait de vijf stappen uit LAT-14237 tegen de live site met de virtuele
schermlezer van Guidepup (`@guidepup/virtual-screen-reader`) in Playwright-Chromium.
Uitkomst = **geautomatiseerd, virtueel**: een benadering van VoiceOver, niet de echte.

```bash
npm i --no-save @guidepup/virtual-screen-reader playwright
node tests/a11y/vsr-steps.mjs            # schrijft voorleesverslag-virtueel.json
A11Y_BASE=https://preview.example A11Y_WIJNHUIS=/wijnhuizen/<slug>/ node tests/a11y/vsr-steps.mjs
```

Alleen lezen: het script klikt op menu en filters, maar opent geen affiliate-links (REGEL 11).

## Hergebruik met echte VoiceOver (stap 2, macOS)

Alle schermlezer-acties lopen via de adapter `sr` (`start`, `stop`, `clear`, `log`, `readAll`,
`headings`). Vervang die door een implementatie op `@guidepup/guidepup` (`voiceOver.start()`,
`voiceOver.next()`, `voiceOver.perform(voiceOver.keyboardCommands.findNextHeading)`,
`voiceOver.spokenPhraseLog()`) en draai Playwright met `headless: false` in Safari/WebKit.
De stappen en de analyse (`nameFindings`) blijven gelijk; let wel op dat VoiceOver
Nederlandse rolnamen uitspreekt ("link", "knop", "Bezocht") waar de virtuele lezer Engels gebruikt.
