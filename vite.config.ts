/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/CafeTycoon/',
  worker: { format: 'es' },
  // CI runners are ~2x slower than a dev laptop; whole-week sim tests also set 30 s explicitly.
  test: { include: ['src/**/*.test.ts'], testTimeout: 15_000 },
});
