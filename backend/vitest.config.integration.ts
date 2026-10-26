import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.integration.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
