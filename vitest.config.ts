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
    include: ['apps/desktop/src/**/*.test.ts', 'packages/import-contract/src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      all: true,
      include: [
        'apps/desktop/scripts/after-pack.cjs',
        'apps/desktop/src/main/validation.ts',
        'apps/desktop/src/main/upload.ts',
        'apps/desktop/src/main/updates.ts',
        'apps/desktop/src/main/diagnostics.ts',
        'apps/desktop/src/main/security.ts',
        'apps/desktop/src/main/settings.ts',
        'apps/desktop/src/main/espn/cookies.ts',
        'apps/desktop/src/main/espn/login-window.ts',
        'apps/desktop/src/main/espn/transform.ts',
        'apps/desktop/src/main/espn/api.ts',
        'apps/desktop/src/shared/environment.ts',
        'apps/desktop/src/shared/espn-input.ts',
        'apps/desktop/src/renderer/errors.ts',
        'apps/desktop/src/renderer/import-review.ts',
        'apps/desktop/src/preload/preload.ts',
        'packages/import-contract/src/schema.ts',
        'packages/import-contract/src/validate.ts',
        'packages/import-contract/src/fixtures.ts'
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  }
});
