import { defineConfig, devices } from '@playwright/test';

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
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'node e2e/web/serve.mjs dist',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: sizes.map(({ name, width, height }) => ({
    name,
    use: {
      ...devices['Desktop Chrome'],
      browserName: 'chromium' as const,
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
  })),
});
