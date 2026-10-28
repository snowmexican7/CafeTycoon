/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/CafeTycoon/',
  worker: { format: 'es' },
  test: { include: ['src/**/*.test.ts'] },
});
