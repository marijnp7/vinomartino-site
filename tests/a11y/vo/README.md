# Schermlezertest L2 met echte VoiceOver (LAT-14721)

Zelfde vijf stappen als `../vsr-steps.mjs` (virtuele lezer, LAT-14720), nu met echte VoiceOver
via Guidepup op een GitHub Actions macOS-runner. Draait alleen via
`.github/workflows/a11y-voiceover.yml`: handmatig (`workflow_dispatch`) of na een geslaagde
productie-deploy. Geen dagelijkse of per-push run (macOS-minuten).

Uitvoer: artifact `voorleesverslag-voiceover` met `stap-1.json` t/m `stap-5.json`
(gesproken frases per stap) plus het Playwright-rapport en de setup-opname.

Lokaal op een Mac (VoiceOver moet automatisering toestaan, zie `npx @guidepup/setup`):

```bash
cd tests/a11y/vo && npm i --no-save @guidepup/guidepup @guidepup/playwright @playwright/test
npx playwright install webkit && npx playwright test -c playwright.config.mjs
```

VoiceOver op de runner spreekt Engels ("Read more, link", "visited link"); de virtuele lezer
gebruikt "link, Read more". `nameFindings` vangt beide volgordes.
