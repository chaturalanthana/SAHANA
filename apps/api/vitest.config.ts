import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@sahana/i18n': path.join(repoRoot, 'packages/i18n/src/index.ts'),
      '@sahana/types': path.join(repoRoot, 'packages/types/src/index.ts'),
      '@sahana/validation': path.join(repoRoot, 'packages/validation/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/env.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});
