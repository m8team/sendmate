import { defineConfig } from 'vitest/config';
import { wranglerLimitsJson } from './limits-json.mjs';

export default defineConfig({
  // Same as astro.config.mjs, so tests see the limits the site is built with.
  define: { __LIMITS_JSON__: JSON.stringify(wranglerLimitsJson()) },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/lib/api/**/*.ts'],
      // types.ts is type-only and index.ts only re-exports.
      exclude: ['src/lib/api/**/*.test.ts', 'src/lib/api/__tests__/**', 'src/lib/api/types.ts', 'src/lib/api/index.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
