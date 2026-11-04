import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/helpers/globalSetup.js'],
    setupFiles: ['./tests/helpers/env.js'],
    fileParallelism: false, // one shared test database
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
