import { defineConfig, devices } from '@playwright/test';

// PW_PORT lets a second run use its own server while another holds 4173.
const port = Number(process.env.PW_PORT ?? 4173);

const sizes = [
  { name: 'android-360x800', width: 360, height: 800 },
  { name: 'android-390x844', width: 390, height: 844 },
  { name: 'android-428x926', width: 428, height: 926 },
];

export default defineConfig({
  testDir: 'e2e/web',
  outputDir: 'test-results',
  snapshotPathTemplate: 'e2e/screenshots/golden/{projectName}/{arg}{ext}',
  reporter: 'list',
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css' } },
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: `node e2e/web/serve.mjs dist`,
    env: { PORT: String(port) },
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [...sizes.map(({ name, width, height }) => ({
    name,
    testIgnore: /perf-ui\.spec\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      browserName: 'chromium' as const,
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      launchOptions: {
        args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning', '--disable-lcd-text'],
      },
    },
  })),
  // The UI budgets (cold boot at CPU x2) measure the app, not the host: they run after the three size projects
  // have finished, so no other worker shares the CPU (two workers under load put the same bytes at 2.8 to 4.7 s,
  // alone at 2.2 to 2.4 s).
  {
    name: 'perf-ui-390x844',
    testMatch: /perf-ui\.spec\.ts/,
    dependencies: sizes.map((s) => s.name),
    use: {
      ...devices['Desktop Chrome'],
      browserName: 'chromium' as const,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      launchOptions: {
        args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning', '--disable-lcd-text'],
      },
    },
  },
  ],
});
