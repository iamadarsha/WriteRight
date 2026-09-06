import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// §23.2 test layers: unit + integration run under Vitest with a jsdom DOM and
// WXT's in-memory fake browser (storage, runtime messaging). Browser E2E is a
// separate Playwright project added in later phases.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/entrypoints/**',
        'src/**/*.d.ts',
        'src/types/**',
        'src/ai/**',
        'src/engine/harper/**',
        // React glue — no branching logic; covered by component + visual
        // regression tests from Phase 3 (§9.2).
        'src/ui/hooks/**',
        'src/ui/components/**',
      ],
      thresholds: {
        statements: 78,
        // Phase 2 adds DOM-positioning code (mirror sync, client-rect marks,
        // scroll/resize handlers) whose branches jsdom cannot exercise; these
        // are covered by Playwright visual/E2E from Phase 3 (§9.2, §23.2).
        branches: 67,
        functions: 78,
        lines: 84,
      },
    },
  },
});
