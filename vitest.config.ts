import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'plugins/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/i18n/testSetup.ts'],
  },
});
