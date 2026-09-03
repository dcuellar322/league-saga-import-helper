import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@leaguesaga/import-contract': fileURLToPath(new URL('./packages/import-contract/src/index.ts', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['apps/desktop/src/**/*.test.{ts,tsx}', 'packages/import-contract/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      all: true,
      include: [
        'apps/desktop/scripts/**/*.cjs',
        'apps/desktop/src/main/**/*.ts',
        'apps/desktop/src/preload/**/*.ts',
        'apps/desktop/src/renderer/**/*.{ts,tsx}',
        'apps/desktop/src/shared/**/*.ts',
        'packages/import-contract/src/**/*.ts'
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'apps/desktop/src/main/main.ts',
        'apps/desktop/src/renderer/main.tsx',
        'packages/import-contract/src/generate-json-schema.ts'
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90
      }
    }
  }
});
