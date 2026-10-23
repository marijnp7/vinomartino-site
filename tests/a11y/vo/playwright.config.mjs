// LAT-14721: Playwright-config voor de echte VoiceOver-run (alleen macOS-runner).
import { devices } from '@playwright/test';
import { screenReaderConfig } from '@guidepup/playwright';

export default {
  ...screenReaderConfig,
  testDir: '.',
  testMatch: /vo-steps\.spec\.mjs$/,
  reportSlowTests: null,
  timeout: 10 * 60 * 1000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { trace: 'retain-on-failure', video: 'retain-on-failure' },
  projects: [{ name: 'webkit', use: { ...devices['Desktop Safari'], headless: false, locale: 'nl-NL' } }],
};
